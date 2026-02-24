/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260223160000_secure_credential_access.sql                        *
 *   FASE 3: ACCESO SEGURO DESDE BACKEND Y LÓGICA DE RENOVACIÓN                    *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

/**
 * Recupera las credenciales desencriptadas para un negocio y API específica.
 * Esta función está diseñada para ser invocada ÚNICAMENTE por el backend (Edge Functions).
 */
CREATE OR REPLACE FUNCTION core.get_business_credentials(
    p_business_id UUID, 
    p_api_name public.external_api_name
)
RETURNS TABLE (
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    external_user_id TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        core.decrypt_token(c.access_token),
        core.decrypt_token(c.refresh_token),
        c.expires_at,
        c.external_user_id
    FROM core.business_credentials c
    JOIN core.business_asign_credentials a ON a.credential_id = c.id
    WHERE a.business_id = p_business_id 
      AND c.api_name = p_api_name
      AND a.is_active = true
      AND c.is_deleted = false
      AND a.is_deleted = false
    LIMIT 1; -- En caso de múltiples, tomamos la primera activa
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SEGURIDAD CRÍTICA:
-- 1. Quitamos permisos a todos los usuarios (incluyendo autenticados)
REVOKE ALL ON FUNCTION core.get_business_credentials(UUID, public.external_api_name) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.get_business_credentials(UUID, public.external_api_name) FROM authenticated;
REVOKE ALL ON FUNCTION core.get_business_credentials(UUID, public.external_api_name) FROM anon;

-- 2. Otorgamos permiso únicamente al rol de servicio (Edge Functions / Backend)
GRANT EXECUTE ON FUNCTION core.get_business_credentials(UUID, public.external_api_name) TO service_role;
GRANT EXECUTE ON FUNCTION core.get_business_credentials(UUID, public.external_api_name) TO postgres;

COMMIT;
