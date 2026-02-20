CREATE OR REPLACE FUNCTION log_changes()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
  record_id_text TEXT;
  action_text TEXT;
  account_id_to_log UUID;
BEGIN
  action_text := TG_OP;
  
  -- Lógica para determinar el ID del registro y el ID de la cuenta
  IF (TG_OP = 'UPDATE') THEN
    record_id_text := NEW.id::TEXT;
    -- Si la tabla es 'accounts', la cuenta es el propio ID de la fila
    account_id_to_log := CASE WHEN TG_TABLE_NAME = 'accounts' THEN NEW.id ELSE NEW.account_id END;
    
    IF OLD.deleted = false AND NEW.deleted = true THEN
      action_text := 'SOFT_DELETE';
    END IF;

  ELSEIF (TG_OP = 'INSERT') THEN
    record_id_text := NEW.id::TEXT;
    -- Si la tabla es 'accounts', la cuenta es el propio ID de la fila
    account_id_to_log := CASE WHEN TG_TABLE_NAME = 'accounts' THEN NEW.id ELSE NEW.account_id END;

  ELSE -- DELETE
    record_id_text := OLD.id::TEXT;
    -- Si la tabla es 'accounts', la cuenta es el propio ID de la fila
    account_id_to_log := CASE WHEN TG_TABLE_NAME = 'accounts' THEN OLD.id ELSE OLD.account_id END;
  END IF;

  -- Insertar en el log de auditoría
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
$$;

CREATE OR REPLACE FUNCTION log_changes()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
  record_id_text TEXT;
  account_id_to_log UUID;
  action_text TEXT := TG_OP;
  _data JSONB;
BEGIN
  -- Usamos to_jsonb para evitar el error "record new has no field..."
  _data := to_jsonb(COALESCE(NEW, OLD));
  
  -- 1. Determinar el ID del registro
  record_id_text := (_data->>'id')::TEXT;

  -- 2. Lógica inteligente para el account_id
  -- Si es la tabla accounts, el account_id es el propio ID del registro.
  -- Si es cualquier otra tabla, busca la columna account_id.
  IF (TG_TABLE_NAME = 'accounts') THEN
    account_id_to_log := (_data->>'id')::UUID;
  ELSE
    account_id_to_log := (_data->>'account_id')::UUID;
  END IF;

  -- 3. Detectar Soft Delete
  IF (TG_OP = 'UPDATE') THEN
    IF (to_jsonb(OLD)->>'deleted')::BOOLEAN = false AND (_data->>'deleted')::BOOLEAN = true THEN
      action_text := 'SOFT_DELETE';
    END IF;
  END IF;

  -- 4. Insertar en logs
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
$$;
