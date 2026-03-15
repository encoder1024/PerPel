-- Helper function to get stock level at a specific time
CREATE OR REPLACE FUNCTION get_stock_at_time(
    p_item_id UUID,
    p_business_id UUID,
    p_account_id UUID,
    p_target_time TIMESTAMPTZ
)
RETURNS INT AS $$
DECLARE
    stock_level INT;
BEGIN
    SELECT to_stock_level INTO stock_level
    FROM core.stock_movements
    WHERE item_id = p_item_id
      AND business_id = p_business_id
      AND account_id = p_account_id
      AND created_at < p_target_time
      AND is_deleted = false
    ORDER BY created_at DESC
    LIMIT 1;

    IF stock_level IS NULL THEN
        SELECT quantity INTO stock_level
        FROM core.stock_levels
        WHERE item_id = p_item_id
          AND business_id = p_business_id
          AND account_id = p_account_id
          AND is_deleted = false;
    END IF;

    RETURN COALESCE(stock_level, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- Function to calculate aggregate stock turnover percentage for a business (or all businesses if p_business_id is NULL) for a given period.
CREATE OR REPLACE FUNCTION calculate_business_aggregate_stock_turnover(
    p_business_id UUID, -- Pass NULL for 'ALL' businesses
    p_account_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS NUMERIC AS $$
DECLARE
    total_cogs NUMERIC := 0;
    total_start_inventory INT := 0;
    total_end_inventory INT := 0;
    total_average_inventory NUMERIC := 0;
    turnover_percentage NUMERIC := 0;
    stock_item record;                    -- *** CORRECTLY DECLARED RECORD VARIABLE FOR LOOP ***
BEGIN
    -- 1. Calculate Total COGS
    SELECT COALESCE(SUM(oi.quantity * ii.cost_price), 0)
    INTO total_cogs
    FROM core.order_items oi
    JOIN core.inventory_items ii ON oi.item_id = ii.id
    JOIN core.orders o ON oi.order_id = o.id
    WHERE o.account_id = p_account_id
      AND (p_business_id IS NULL OR o.business_id = p_business_id)
      AND o.status = 'PAID'
      AND o.created_at >= p_start_date::TIMESTAMPTZ
      AND o.created_at < (p_end_date + interval '1 day')::TIMESTAMPTZ;

    -- 2. Calculate Total Inventory at the start of the period
    FOR stock_item IN ( -- *** USING THE DECLARED RECORD VARIABLE 'stock_item' ***
        SELECT DISTINCT item_id FROM core.stock_levels
        WHERE account_id = p_account_id AND (p_business_id IS NULL OR business_id = p_business_id) AND is_deleted = false
    ) LOOP
        total_start_inventory := total_start_inventory + get_stock_at_time(stock_item.item_id, p_business_id, p_account_id,
p_start_date::TIMESTAMPTZ);
    END LOOP;

    -- 3. Calculate Total Inventory at the end of the period
    FOR stock_item IN ( -- *** USING THE DECLARED RECORD VARIABLE 'stock_item' ***
        SELECT DISTINCT item_id FROM core.stock_levels
        WHERE account_id = p_account_id AND (p_business_id IS NULL OR business_id = p_business_id) AND is_deleted = false
    ) LOOP
        total_end_inventory := total_end_inventory + get_stock_at_time(stock_item.item_id, p_business_id, p_account_id, (p_end_date + interval '1
day')::TIMESTAMPTZ);
    END LOOP;

    -- 4. Calculate Total Average Inventory
    total_average_inventory := (total_start_inventory + total_end_inventory) / 2.0;

    -- 5. Calculate Turnover Percentage
    IF total_average_inventory > 0 THEN
        turnover_percentage := (total_cogs / total_average_inventory) * 100;
    END IF;

    RETURN ROUND(turnover_percentage, 2);

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error calculating business aggregate stock turnover: %', SQLERRM;
    RETURN 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


------------------------------------------------///------------------------------------------------

-- Helper function to get stock level at a specific time (no changes here)
CREATE OR REPLACE FUNCTION get_stock_at_time(
    p_item_id UUID,
    p_business_id UUID,
    p_account_id UUID,
    p_target_time TIMESTAMPTZ
)
RETURNS INT AS $$
DECLARE
    stock_level INT;
BEGIN
    SELECT to_stock_level INTO stock_level
    FROM core.stock_movements
    WHERE item_id = p_item_id
      AND business_id = p_business_id
      AND account_id = p_account_id
      AND created_at < p_target_time
      AND is_deleted = false
    ORDER BY created_at DESC
    LIMIT 1;

    IF stock_level IS NULL THEN
        SELECT quantity INTO stock_level
        FROM core.stock_levels
        WHERE item_id = p_item_id
          AND business_id = p_business_id
          AND account_id = p_account_id
          AND is_deleted = false;
    END IF;

    RETURN COALESCE(stock_level, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- Function to calculate aggregate stock turnover percentage (LOOP-LESS VERSION)
CREATE OR REPLACE FUNCTION calculate_business_aggregate_stock_turnover(
    p_business_id UUID, -- Pass NULL for 'ALL' businesses
    p_account_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS NUMERIC AS $$
DECLARE
    total_quantity_moved_out NUMERIC := 0;
    total_start_inventory INT := 0;
    total_end_inventory INT := 0;
    total_average_inventory NUMERIC := 0;
    turnover_percentage NUMERIC := 0;
BEGIN
    -- 1. Calculate Total Quantity Moved Out
    SELECT COALESCE(SUM(ABS(quantity_change)), 0)
    INTO total_quantity_moved_out
    FROM core.stock_movements
    WHERE account_id = p_account_id
      AND (p_business_id IS NULL OR business_id = p_business_id)
      AND quantity_change < 0
      AND created_at >= p_start_date::TIMESTAMPTZ
      AND created_at < (p_end_date + interval '1 day')::TIMESTAMPTZ;

    -- 2. Calculate Total Start Inventory without loops
    WITH item_levels AS (
        SELECT DISTINCT item_id
        FROM core.stock_levels
        WHERE account_id = p_account_id
          AND (p_business_id IS NULL OR business_id = p_business_id)
          AND is_deleted = false
    )
    SELECT COALESCE(SUM(get_stock_at_time(item_levels.item_id, p_business_id, p_account_id, p_start_date::TIMESTAMPTZ)), 0)
    INTO total_start_inventory
    FROM item_levels;

    -- 3. Calculate Total End Inventory without loops
    WITH item_levels AS (
        SELECT DISTINCT item_id
        FROM core.stock_levels
        WHERE account_id = p_account_id
          AND (p_business_id IS NULL OR business_id = p_business_id)
          AND is_deleted = false
    )
    SELECT COALESCE(SUM(get_stock_at_time(item_levels.item_id, p_business_id, p_account_id, (p_end_date + interval '1 day')::TIMESTAMPTZ)), 0)
    INTO total_end_inventory
    FROM item_levels;

    -- 4. Calculate Total Average Inventory
    total_average_inventory := (total_start_inventory + total_end_inventory) / 2.0;

    -- 5. Calculate Turnover Percentage
    IF total_average_inventory > 0 THEN
        turnover_percentage := (total_quantity_moved_out / total_average_inventory) * 100;
    END IF;

    RETURN ROUND(turnover_percentage, 2);

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error calculating business aggregate stock turnover: %', SQLERRM;
    RETURN 0;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;