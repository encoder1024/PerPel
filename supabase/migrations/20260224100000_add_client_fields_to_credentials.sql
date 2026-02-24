/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260224100000_add_client_fields_to_credentials.sql                *
 *   FASE A: SOPORTE PARA CLIENT_ID Y CLIENT_SECRET (ENCRIPTADO)                   *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- 1. Añadir columnas a la tabla de credenciales
ALTER TABLE core.business_credentials 
ADD COLUMN IF NOT EXISTS client_id TEXT,
ADD COLUMN IF NOT EXISTS client_secret TEXT;

-- 2. Actualizar la función de encriptación automática (Trigger)
-- Ahora también protegerá el client_secret
CREATE OR REPLACE FUNCTION core.handle_token_encryption()
RETURNS TRIGGER AS $$
BEGIN
    -- Encriptar access_token si cambió
    IF NEW.access_token IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.access_token <> OLD.access_token) THEN
        NEW.access_token := core.encrypt_token(NEW.access_token);
    END IF;

    -- Encriptar refresh_token si cambió
    IF NEW.refresh_token IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.refresh_token <> OLD.refresh_token) THEN
        NEW.refresh_token := core.encrypt_token(NEW.refresh_token);
    END IF;

    -- NUEVO: Encriptar client_secret si cambió
    IF NEW.client_secret IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.client_secret <> OLD.client_secret) THEN
        NEW.client_secret := core.encrypt_token(NEW.client_secret);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Actualizar la función de lectura segura (RPC para el Backend)
-- Ahora también devolverá el client_id y el client_secret desencriptado
CREATE OR REPLACE FUNCTION core.get_business_credentials(
    p_business_id UUID, 
    p_api_name public.external_api_name
)
RETURNS TABLE (
    access_token TEXT,
    refresh_token TEXT,
    client_id TEXT,
    client_secret TEXT,
    expires_at TIMESTAMPTZ,
    external_user_id TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        core.decrypt_token(c.access_token),
        core.decrypt_token(c.refresh_token),
        c.client_id,
        core.decrypt_token(c.client_secret),
        c.expires_at,
        c.external_user_id
    FROM core.business_credentials c
    JOIN core.business_asign_credentials a ON a.credential_id = c.id
    WHERE a.business_id = p_business_id 
      AND c.api_name = p_api_name
      AND a.is_active = true
      AND c.is_deleted = false
      AND a.is_deleted = false
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-aplicar permisos de seguridad
REVOKE ALL ON FUNCTION core.get_business_credentials(UUID, public.external_api_name) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.get_business_credentials(UUID, public.external_api_name) TO service_role;
GRANT EXECUTE ON FUNCTION core.get_business_credentials(UUID, public.external_api_name) TO postgres;

COMMIT;
