-- CONSOLIDATED FIX V2: Stock Turnover with Initial Stock Awareness
-- This version ensures that 'INITIAL_STOCK' movements are counted as part of the starting stock.

-- 1. Drop dependent functions
DROP FUNCTION IF EXISTS public.get_top_stock_turnover(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS public.calculate_business_aggregate_stock_turnover(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS public.get_stock_at_time(uuid, uuid, uuid, timestamp with time zone);

-- 2. HELPER: get_stock_at_time (Reconstructs stock exactly at a timestamp)
CREATE OR REPLACE FUNCTION public.get_stock_at_time(
    p_item_id UUID,
    p_business_id UUID,
    p_account_id UUID,
    p_target_time TIMESTAMPTZ
)
RETURNS NUMERIC AS $$
DECLARE
    v_current_stock NUMERIC := 0;
    v_movements_after NUMERIC := 0;
BEGIN
    SELECT COALESCE(SUM(quantity), 0)::NUMERIC INTO v_current_stock
    FROM core.stock_levels
    WHERE item_id = p_item_id AND account_id = p_account_id
      AND (p_business_id IS NULL OR business_id = p_business_id) AND is_deleted = false;

    SELECT COALESCE(SUM(quantity_change), 0)::NUMERIC INTO v_movements_after
    FROM core.stock_movements
    WHERE item_id = p_item_id AND account_id = p_account_id
      AND (p_business_id IS NULL OR business_id = p_business_id)
      AND created_at >= p_target_time AND is_deleted = false;

    RETURN v_current_stock - v_movements_after;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- 3. GLOBAL KPI: calculate_business_aggregate_stock_turnover
CREATE OR REPLACE FUNCTION public.calculate_business_aggregate_stock_turnover(
    p_business_id UUID,
    p_account_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS NUMERIC AS $$
DECLARE
    total_quantity_moved_out NUMERIC := 0;
    total_start_inventory NUMERIC := 0;
    total_end_inventory NUMERIC := 0;
    total_average_inventory NUMERIC := 0;
BEGIN
    -- Units Out
    SELECT COALESCE(SUM(ABS(quantity_change)), 0)::NUMERIC
    INTO total_quantity_moved_out
    FROM core.stock_movements
    WHERE account_id = p_account_id AND (p_business_id IS NULL OR business_id = p_business_id)
      AND quantity_change < 0
      AND created_at >= p_start_date::TIMESTAMPTZ 
      AND created_at < (p_end_date + interval '1 day')::TIMESTAMPTZ;

    -- Inventory Aggregation with INITIAL_STOCK awareness
    WITH item_list AS (
        SELECT DISTINCT item_id FROM core.stock_levels
        WHERE account_id = p_account_id AND (p_business_id IS NULL OR business_id = p_business_id) AND is_deleted = false
    )
    SELECT 
        -- Start Stock = Reconstructed at start + Any INITIAL_STOCK during the period
        SUM(
            public.get_stock_at_time(item_id, p_business_id, p_account_id, p_start_date::TIMESTAMPTZ) +
            COALESCE((
                SELECT SUM(quantity_change) FROM core.stock_movements 
                WHERE item_id = il.item_id AND account_id = p_account_id AND (p_business_id IS NULL OR business_id = p_business_id)
                  AND movement_type = 'INITIAL_STOCK'
                  AND created_at >= p_start_date::TIMESTAMPTZ AND created_at < (p_end_date + interval '1 day')::TIMESTAMPTZ
            ), 0)
        ),
        SUM(public.get_stock_at_time(item_id, p_business_id, p_account_id, (p_end_date + interval '1 day')::TIMESTAMPTZ))
    INTO total_start_inventory, total_end_inventory
    FROM item_list il;

    total_average_inventory := (total_start_inventory + total_end_inventory) / 2.0;

    IF total_average_inventory > 0 THEN
        RETURN ROUND((total_quantity_moved_out / total_average_inventory) * 100.0, 2);
    END IF;

    RETURN 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. BREAKDOWN: get_top_stock_turnover
CREATE OR REPLACE FUNCTION public.get_top_stock_turnover(
    p_business_id UUID,
    p_account_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    item_id UUID,
    item_name TEXT,
    sku TEXT,
    units_moved NUMERIC,
    start_stock NUMERIC,
    end_stock NUMERIC,
    turnover_pct NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH item_list AS (
        SELECT DISTINCT sl.item_id, ii.name, ii.sku
        FROM core.stock_levels sl
        JOIN core.inventory_items ii ON sl.item_id = ii.id
        WHERE sl.account_id = p_account_id AND (p_business_id IS NULL OR sl.business_id = p_business_id) AND sl.is_deleted = false
    ),
    item_stats AS (
        SELECT 
            il.item_id,
            il.name,
            il.sku,
            COALESCE((
                SELECT SUM(ABS(sm.quantity_change))::NUMERIC
                FROM core.stock_movements sm
                WHERE sm.item_id = il.item_id AND sm.account_id = p_account_id AND (p_business_id IS NULL OR sm.business_id = p_business_id)
                  AND sm.quantity_change < 0
                  AND sm.created_at >= p_start_date::TIMESTAMPTZ AND sm.created_at < (p_end_date + interval '1 day')::TIMESTAMPTZ
            ), 0) as units_out,
            -- Start Stock awareness: Reconstructed + INITIAL_STOCK in period
            (public.get_stock_at_time(il.item_id, p_business_id, p_account_id, p_start_date::TIMESTAMPTZ) +
             COALESCE((
                SELECT SUM(sm2.quantity_change) FROM core.stock_movements sm2
                WHERE sm2.item_id = il.item_id AND sm2.account_id = p_account_id AND (p_business_id IS NULL OR sm2.business_id = p_business_id)
                  AND sm2.movement_type = 'INITIAL_STOCK'
                  AND sm2.created_at >= p_start_date::TIMESTAMPTZ AND sm2.created_at < (p_end_date + interval '1 day')::TIMESTAMPTZ
             ), 0)
            ) as s_stock,
            public.get_stock_at_time(il.item_id, p_business_id, p_account_id, (p_end_date + interval '1 day')::TIMESTAMPTZ) as e_stock
        FROM item_list il
    )
    SELECT 
        stats.item_id,
        stats.name,
        stats.sku,
        stats.units_out,
        stats.s_stock,
        stats.e_stock,
        CASE 
            WHEN (stats.s_stock + stats.e_stock) > 0 THEN 
                ROUND((stats.units_out / ((stats.s_stock + stats.e_stock) / 2.0)) * 100.0, 2)
            ELSE 0 
        END as pct
    FROM item_stats stats
    WHERE stats.units_out > 0
    ORDER BY pct DESC, stats.units_out DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Permissions
GRANT EXECUTE ON FUNCTION public.get_stock_at_time TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_business_aggregate_stock_turnover TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_stock_turnover TO authenticated;
