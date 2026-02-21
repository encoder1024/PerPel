CREATE OR REPLACE FUNCTION public.adjust_stock( -- Changed from rpc.adjust_stock to public.adjust_stock
  p_item_id UUID,
  p_business_id UUID,
  p_account_id UUID,
  p_quantity_change INT,
  p_movement_type public.stock_movement_type,
  p_reason TEXT,
  p_user_id UUID DEFAULT auth.uid() -- Default to current authenticated user
)
RETURNS JSONB AS $$
DECLARE
  current_stock INT;
  new_stock INT;
  stock_level_item_id UUID; -- Changed from stock_level_id to stock_level_item_id to avoid conflict with table name
BEGIN
  -- Validate inputs
  IF p_quantity_change = 0 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Quantity change cannot be zero.');
  END IF;

  IF p_reason IS NULL OR p_reason = '' THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Reason for stock movement is mandatory.');
  END IF;

  -- Start a transaction for atomicity
  BEGIN
    -- Get current stock level for the item and business
    SELECT quantity, item_id INTO current_stock, stock_level_item_id
    FROM core.stock_levels
    WHERE item_id = p_item_id
      AND business_id = p_business_id
      AND account_id = p_account_id
    FOR UPDATE; -- Lock the row to prevent race conditions

    -- If no stock_level entry exists, consider it 0 for initial stock, otherwise error for non-initial
    IF stock_level_item_id IS NULL THEN -- Check if no row was found
        IF p_movement_type != 'INITIAL_STOCK' THEN
            RETURN jsonb_build_object('status', 'error', 'message', 'Stock level entry not found for this item and business. Use INITIAL_STOCK to create it.');
        ELSE
            current_stock := 0; -- Initial stock is 0 before this movement
            -- Insert new stock_level entry for INITIAL_STOCK
            INSERT INTO core.stock_levels (item_id, business_id, account_id, quantity)
            VALUES (p_item_id, p_business_id, p_account_id, p_quantity_change);
            new_stock := p_quantity_change;
        END IF;
    ELSE
        -- Stock level entry exists, calculate new stock
        new_stock := current_stock + p_quantity_change;
    END IF;

    -- Validate new stock level for outgoing movements
    IF p_quantity_change < 0 AND new_stock < 0 THEN
      RETURN jsonb_build_object('status', 'error', 'message', 'Insufficient stock for this operation.');
    END IF;

    -- Update stock_levels if it was an existing entry, or for INITIAL_STOCK (already inserted above)
    -- This condition ensures we don't try to update a row that was just inserted for INITIAL_STOCK
    -- and also handles updates for existing stock levels.
    IF stock_level_item_id IS NOT NULL AND p_movement_type != 'INITIAL_STOCK' THEN
      UPDATE core.stock_levels
      SET quantity = new_stock
      WHERE item_id = p_item_id
        AND business_id = p_business_id
        AND account_id = p_account_id;
    END IF;

    -- Insert record into stock_movements
    INSERT INTO core.stock_movements (
      account_id,
      item_id,
      business_id,
      from_stock_level,
      to_stock_level,
      quantity_change,
      movement_type,
      user_id,
      reason
    ) VALUES (
      p_account_id,
      p_item_id,
      p_business_id,
      current_stock,
      new_stock,
      p_quantity_change,
      p_movement_type,
      p_user_id,
      p_reason
    );

    -- If all goes well, commit transaction (implicit in plpgsql function if no errors)
    RETURN jsonb_build_object('status', 'success', 'message', 'Stock adjusted successfully.', 'new_quantity', new_stock);

  EXCEPTION
    WHEN OTHERS THEN
      -- Rollback transaction (implicit on error in plpgsql function)
      RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.adjust_stock TO authenticated;