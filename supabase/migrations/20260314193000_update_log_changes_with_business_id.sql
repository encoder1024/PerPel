-- Updates the log_changes function to populate the business_id column in audit_log.
-- It uses JSONB conversion to safely handle tables that may or may not have 
-- account_id or business_id columns without throwing errors.

CREATE OR REPLACE FUNCTION public.log_changes()
RETURNS TRIGGER AS $$
DECLARE
  record_id_text TEXT;
  action_text TEXT;
  account_id_to_log UUID;
  business_id_to_log UUID;
  _data JSONB;
BEGIN
  action_text := TG_OP;

  -- 1. Convert the record to JSONB to handle fields dynamically.
  -- This prevents "record has no field" errors on tables with different schemas.
  IF (TG_OP = 'DELETE') THEN
    _data := to_jsonb(OLD);
  ELSE
    _data := to_jsonb(NEW);
  END IF;

  -- 2. Safely extract account_id and business_id.
  -- If the fields don't exist in the JSON, they will be NULL.
  account_id_to_log := (_data->>'account_id')::UUID;
  business_id_to_log := (_data->>'business_id')::UUID;

  -- 3. Special case for the 'accounts' table where 'id' is the identifier.
  IF TG_TABLE_NAME = 'accounts' THEN
    account_id_to_log := (_data->>'id')::UUID;
  END IF;

  -- 4. Handle record_id construction.
  IF (TG_TABLE_NAME = 'stock_levels') THEN
    -- Composite key for stock_levels
    record_id_text := format('item_id:%s,business_id:%s', _data->>'item_id', _data->>'business_id');
  ELSE
    -- Assume 'id' column for all other tables
    record_id_text := (_data->>'id')::TEXT;
  END IF;

  -- 5. Handle action text for soft deletes (detecting changes in 'is_deleted' flag)
  IF (TG_OP = 'UPDATE') THEN
    IF (to_jsonb(OLD)->>'is_deleted')::BOOLEAN = false AND (_data->>'is_deleted')::BOOLEAN = true THEN
      action_text := 'SOFT_DELETE';
    END IF;
  END IF;

  -- 6. Insert into audit_log including the business_id
  INSERT INTO logs.audit_log (
    user_id, 
    account_id, 
    business_id, 
    action, 
    table_name, 
    record_id, 
    old_data, 
    new_data
  )
  VALUES (
    auth.uid(),
    account_id_to_log,
    business_id_to_log,
    action_text,
    TG_TABLE_NAME,
    record_id_text,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN _data ELSE NULL END
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
