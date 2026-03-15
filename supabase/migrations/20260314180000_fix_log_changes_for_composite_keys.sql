-- Fixes the generic log_changes trigger function to handle tables
-- with composite primary keys and no 'id' column, such as 'stock_levels'.
CREATE OR REPLACE FUNCTION public.log_changes()
RETURNS TRIGGER AS $$
DECLARE
  record_id_text TEXT;
  action_text TEXT;
  account_id_to_log UUID;
BEGIN
  action_text := TG_OP;

  -- Determine the account_id for logging
  IF (TG_OP = 'DELETE') THEN
    account_id_to_log := OLD.account_id;
  ELSE
    account_id_to_log := NEW.account_id;
  END IF;

  -- Handle record_id construction based on the table
  IF (TG_TABLE_NAME = 'stock_levels') THEN
    -- For stock_levels, use the composite primary key to create an identifier
    IF (TG_OP IN ('UPDATE', 'INSERT')) THEN
      record_id_text := format('item_id:%s,business_id:%s', NEW.item_id, NEW.business_id);
    ELSE -- DELETE
      record_id_text := format('item_id:%s,business_id:%s', OLD.item_id, OLD.business_id);
    END IF;
  ELSE
    -- For all other tables, assume an 'id' column exists
    IF (TG_OP IN ('UPDATE', 'INSERT')) THEN
      record_id_text := NEW.id::TEXT;
    ELSE -- DELETE
      record_id_text := OLD.id::TEXT;
    END IF;
  END IF;

  -- Handle action text for soft deletes
  IF (TG_OP = 'UPDATE' AND OLD.deleted = false AND NEW.deleted = true) THEN
    action_text := 'SOFT_DELETE';
  END IF;

  INSERT INTO logs.audit_log (user_id, account_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    account_id_to_log,
    action_text,
    TG_TABLE_NAME,
    record_id_text,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
