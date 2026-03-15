/*****************************************************************************************
 * MIGRACIÓN: 20260314100000_add_business_id_to_audit_log.sql                         *
 * Descripción: Añade la columna business_id a la tabla de auditoría y actualiza        *
 * la función log_changes para capturar automáticamente el negocio afectado.            *
 *****************************************************************************************/

BEGIN;

-- 1. Agregar columna business_id a logs.audit_log
ALTER TABLE logs.audit_log 
ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES core.businesses(id) ON DELETE SET NULL;

-- 2. Índice para mejorar el filtrado por negocio en reportes
CREATE INDEX IF NOT EXISTS idx_audit_log_business_id ON logs.audit_log(business_id);

-- 3. Actualizar función public.log_changes()
CREATE OR REPLACE FUNCTION public.log_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_old_data JSONB := NULL;
    v_new_data JSONB := NULL;
    v_business_id UUID := NULL;
    v_account_id UUID := NULL;
BEGIN
    -- Determinar Account ID (Prioridad: NEW, luego OLD)
    BEGIN
        v_account_id := COALESCE(NEW.account_id, OLD.account_id);
    EXCEPTION WHEN OTHERS THEN
        v_account_id := public.get_my_account_id();
    END;

    -- Capturar datos según la operación
    IF (TG_OP = 'UPDATE') THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
    ELSIF (TG_OP = 'DELETE') THEN
        v_old_data := to_jsonb(OLD);
    ELSIF (TG_OP = 'INSERT') THEN
        v_new_data := to_jsonb(NEW);
    END IF;

    -- LÓGICA DE DETECCIÓN DE BUSINESS_ID:
    -- Intentamos extraer el business_id del registro NEW (o OLD si es DELETE)
    BEGIN
        IF (TG_OP = 'DELETE') THEN
            v_business_id := OLD.business_id;
        ELSE
            v_business_id := NEW.business_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Si la tabla no tiene la columna business_id, v_business_id queda NULL
        v_business_id := NULL;
    END;

    -- Insertar el log en el esquema logs
    INSERT INTO logs.audit_log (
        account_id,
        user_id,
        business_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        timestamp
    ) VALUES (
        v_account_id,
        auth.uid(),
        v_business_id,
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id)::text,
        v_old_data,
        v_new_data,
        NOW()
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
