/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260225150000_fix_log_changes_robust.sql                         *
 *   CORRECCIÓN: FUNCIÓN log_changes DINÁMICA Y ROBUSTA                          *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

CREATE OR REPLACE FUNCTION public.log_changes()
RETURNS TRIGGER AS $$
DECLARE
  record_id_text TEXT;
  action_text TEXT;
  account_id_to_log UUID;
  _data JSONB;
BEGIN
  action_text := TG_OP;
  
  -- 1. Determinar qué registro usar y convertir a JSONB
  IF (TG_OP = 'DELETE') THEN
    _data := to_jsonb(OLD);
  ELSE
    _data := to_jsonb(NEW);
  END IF;

  -- 2. Obtener el ID del registro (siempre existe como 'id')
  record_id_text := (_data->>'id')::TEXT;

  -- 3. Determinar el account_id para el log
  -- Caso especial: en la tabla 'accounts', el 'id' es el identificador de la cuenta.
  IF TG_TABLE_NAME = 'accounts' THEN
    account_id_to_log := (_data->>'id')::UUID;
  ELSE
    -- En las demás tablas buscamos la columna 'account_id' de forma segura
    account_id_to_log := (_data->>'account_id')::UUID;
  END IF;

  -- 4. Detección de SOFT_DELETE (usando is_deleted)
  IF (TG_OP = 'UPDATE') THEN
    IF (to_jsonb(OLD)->>'is_deleted')::BOOLEAN = false AND (_data->>'is_deleted')::BOOLEAN = true THEN
      action_text := 'SOFT_DELETE';
    END IF;
  END IF;

  -- 5. Insertar en el log de auditoría
  -- Se usa SECURITY DEFINER para asegurar permisos sobre el esquema logs
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

COMMIT;
