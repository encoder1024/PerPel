DECLARE
  record_id_text TEXT;
  action_text TEXT;
  account_id_to_log UUID;
BEGIN
  action_text := TG_OP;
  
  IF (TG_OP = 'UPDATE') THEN
    record_id_text = NEW.id::TEXT;
    account_id_to_log := NEW.account_id;
    IF OLD.deleted = false AND NEW.deleted = true THEN
      action_text := 'SOFT_DELETE';
    END IF;
  ELSEIF (TG_OP = 'INSERT') THEN
    record_id_text = NEW.id::TEXT;
    account_id_to_log := NEW.account_id;
  ELSE -- DELETE
    record_id_text = OLD.id::TEXT;
    account_id_to_log := OLD.account_id;
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