-- Fixes the stock turnover calculation to use NUMERIC types for intermediate values.
-- This prevents integer division truncation that was causing the result to be 0%.

CREATE OR REPLACE FUNCTION public.calculate_business_aggregate_stock_turnover(
    p_business_id UUID, -- Pass NULL for 'ALL' businesses
    p_account_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS NUMERIC AS $$
DECLARE
    total_quantity_moved_out NUMERIC := 0;
    total_start_inventory NUMERIC := 0; -- Changed from INT to NUMERIC
    total_end_inventory NUMERIC := 0;   -- Changed from INT to NUMERIC
    total_average_inventory NUMERIC := 0;
    turnover_percentage NUMERIC := 0;
BEGIN
    -- 1. Calculate Total Quantity Moved Out (Numerator)
    -- We sum the absolute value of all negative stock movements in the period.
    SELECT COALESCE(SUM(ABS(quantity_change)), 0)::NUMERIC
    INTO total_quantity_moved_out
    FROM core.stock_movements
    WHERE account_id = p_account_id
      AND (p_business_id IS NULL OR business_id = p_business_id)
      AND quantity_change < 0
      AND created_at >= p_start_date::TIMESTAMPTZ 
      AND created_at < (p_end_date + interval '1 day')::TIMESTAMPTZ;

    -- 2. Calculate Total Inventory at the START of the period
    -- Uses get_stock_at_time for each item to reconstruct historical stock levels.
    WITH item_levels AS (
        SELECT DISTINCT item_id 
        FROM core.stock_levels
        WHERE account_id = p_account_id 
          AND (p_business_id IS NULL OR business_id = p_business_id) 
          AND is_deleted = false
    )
    SELECT COALESCE(SUM(get_stock_at_time(item_levels.item_id, p_business_id, p_account_id, p_start_date::TIMESTAMPTZ)), 0)::NUMERIC
    INTO total_start_inventory
    FROM item_levels;

    -- 3. Calculate Total Inventory at the END of the period
    WITH item_levels AS (
        SELECT DISTINCT item_id 
        FROM core.stock_levels
        WHERE account_id = p_account_id 
          AND (p_business_id IS NULL OR business_id = p_business_id) 
          AND is_deleted = false
    )
    SELECT COALESCE(SUM(get_stock_at_time(item_levels.item_id, p_business_id, p_account_id, (p_end_date + interval '1 day')::TIMESTAMPTZ)), 0)::NUMERIC
    INTO total_end_inventory
    FROM item_levels;

    -- 4. Calculate Average Inventory (Denominator)
    -- Using 2.0 to ensure the result is treated as numeric.
    total_average_inventory := (total_start_inventory + total_end_inventory) / 2.0;

    -- 5. Calculate Turnover Percentage
    -- Multiply by 100.0 before dividing to maintain precision.
    IF total_average_inventory > 0 THEN
        turnover_percentage := (total_quantity_moved_out / total_average_inventory) * 100.0;
    END IF;

    -- Return the calculated percentage, rounded to 2 decimal places.
    RETURN ROUND(turnover_percentage, 2);

EXCEPTION WHEN OTHERS THEN
    -- Log errors and return 0 to indicate failure without breaking the UI.
    RAISE NOTICE 'Error in calculate_business_aggregate_stock_turnover: %', SQLERRM;
    RETURN 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
