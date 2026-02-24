/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260223144500_fix_pgsodium_permissions.sql                        *
 *   REPARACIÓN DE PERMISOS PARA ENCRIPTACIÓN                                      *
 *                                                                                  *
 ************************************************************************************/

-- 1. Otorgar permisos de uso y ejecución sobre pgsodium
GRANT USAGE ON SCHEMA pgsodium TO postgres, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgsodium TO postgres, service_role;

-- 2. Otorgar el rol especial de pgsodium para manejo de llaves
GRANT pgsodium_keyid_user TO postgres;
GRANT pgsodium_keyid_user TO service_role;

-- 3. Reintentar la encriptación de los datos existentes
BEGIN;

UPDATE core.business_credentials 
SET access_token = core.encrypt_token(access_token),
    refresh_token = core.encrypt_token(refresh_token),
    updated_at = NOW()
WHERE is_deleted = false
-- Solo encriptamos si no parece estar ya encriptado (base64 de pgsodium suele ser largo)
AND length(access_token) < 100; 

COMMIT;
