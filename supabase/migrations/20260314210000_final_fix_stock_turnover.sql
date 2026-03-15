-- Final fix for stock turnover calculation.
-- Uses a much more reliable method: Current Stock minus movements occurred after target date.

DROP FUNCTION IF EXISTS public.calculate_business_aggregate_stock_turnover(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS public.get_stock_at_time(uuid, uuid, uuid, timestamp with time zone);

-- 1. Re-create get_stock_at_time with "Backwards Reconstruction" logic.
CREATE OR REPLACE FUNCTION public.get_stock_at_time(
    p_item_id UUID,
    p_business_id UUID, -- NULL for 'ALL'
    p_account_id UUID,
    p_target_time TIMESTAMPTZ
)
RETURNS NUMERIC AS $$
DECLARE
    v_current_stock NUMERIC := 0;
    v_movements_after NUMERIC := 0;
BEGIN
    -- A. Get Current Stock (from stock_levels table)
    SELECT COALESCE(SUM(quantity), 0)::NUMERIC INTO v_current_stock
    FROM core.stock_levels
    WHERE item_id = p_item_id
      AND account_id = p_account_id
      AND (p_business_id IS NULL OR business_id = p_business_id)
      AND is_deleted = false;

    -- B. Get sum of all changes occurred AFTER the target time until now
    -- If we subtract these changes from current stock, we get the stock AT target time.
    SELECT COALESCE(SUM(quantity_change), 0)::NUMERIC INTO v_movements_after
    FROM core.stock_movements
    WHERE item_id = p_item_id
      AND account_id = p_account_id
      AND (p_business_id IS NULL OR business_id = p_business_id)
      AND created_at >= p_target_time
      AND is_deleted = false;

    -- Formula: Stock_Then = Stock_Now - Changes_Since_Then
    RETURN v_current_stock - v_movements_after;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- 2. Main function remains similar but benefits from the improved helper.
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
    turnover_percentage NUMERIC := 0;
BEGIN
    -- 1. Units Out
    SELECT COALESCE(SUM(ABS(quantity_change)), 0)::NUMERIC
    INTO total_quantity_moved_out
    FROM core.stock_movements
    WHERE account_id = p_account_id
      AND (p_business_id IS NULL OR business_id = p_business_id)
      AND quantity_change < 0
      AND created_at >= p_start_date::TIMESTAMPTZ 
      AND created_at < (p_end_date + interval '1 day')::TIMESTAMPTZ;

    -- 2. Calculate aggregations using the improved reconstruction helper
    WITH item_list AS (
        SELECT DISTINCT item_id FROM core.stock_levels
        WHERE account_id = p_account_id 
          AND (p_business_id IS NULL OR business_id = p_business_id)
          AND is_deleted = false
    )
    SELECT 
        COALESCE(SUM(public.get_stock_at_time(item_id, p_business_id, p_account_id, p_start_date::TIMESTAMPTZ)), 0),
        COALESCE(SUM(public.get_stock_at_time(item_id, p_business_id, p_account_id, (p_end_date + interval '1 day')::TIMESTAMPTZ)), 0)
    INTO total_start_inventory, total_end_inventory
    FROM item_list;

    -- 3. Average and Result
    total_average_inventory := (total_start_inventory + total_end_inventory) / 2.0;

    IF total_average_inventory > 0 THEN
        turnover_percentage := (total_quantity_moved_out / total_average_inventory) * 100.0;
    END IF;

    RETURN ROUND(turnover_percentage, 2);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
