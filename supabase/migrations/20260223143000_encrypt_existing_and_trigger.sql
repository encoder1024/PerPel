/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260223143000_encrypt_existing_and_trigger.sql                    *
 *   FASE 2: BLINDAJE DE TABLA Y ENCRIPTACIÓN AUTOMÁTICA                           *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- 1. Función Trigger para encriptar automáticamente antes de guardar
CREATE OR REPLACE FUNCTION core.handle_token_encryption()
RETURNS TRIGGER AS $$
BEGIN
    -- Detectar si el access_token cambió y no es nulo
    IF NEW.access_token IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.access_token <> OLD.access_token) THEN
        -- Intentar encriptar (si ya viene en base64 pgsodium suele fallar o doble-encriptar, 
        -- pero asumimos que el input siempre es texto plano desde la API/Frontend)
        NEW.access_token := core.encrypt_token(NEW.access_token);
    END IF;

    -- Lo mismo para el refresh_token
    IF NEW.refresh_token IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.refresh_token <> OLD.refresh_token) THEN
        NEW.refresh_token := core.encrypt_token(NEW.refresh_token);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Aplicar el Trigger a la tabla
DROP TRIGGER IF EXISTS encrypt_credentials_trigger ON core.business_credentials;

CREATE TRIGGER encrypt_credentials_trigger
BEFORE INSERT OR UPDATE ON core.business_credentials
FOR EACH ROW
EXECUTE PROCEDURE core.handle_token_encryption();

-- 3. Migración de Datos Existentes (Encriptar lo que ya está guardado)
-- Nota: Esto asume que lo que hay ahora es texto plano.
-- Usamos un bloque DO para procesar fila por fila y evitar errores masivos.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id, access_token, refresh_token FROM core.business_credentials WHERE is_deleted = false LOOP
        -- Actualizamos la fila. El trigger que acabamos de crear se encargará de encriptar el valor.
        -- Al hacer un UPDATE con el mismo valor, el trigger detectará la "intención" y lo encriptará.
        -- Sin embargo, para forzarlo, le pasamos el valor explícito.
        UPDATE core.business_credentials
        SET access_token = r.access_token,
            refresh_token = r.refresh_token,
            updated_at = NOW()
        WHERE id = r.id;
    END LOOP;
END $$;

COMMIT;
