/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260224120000_add_credential_lock_mechanism.sql                   *
 *   FASE 5: MECANISMO DE BLOQUEO PARA EVITAR RACE CONDITIONS EN RENOVACIÓN        *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- 1. Añadir la columna is_locked a business_credentials
ALTER TABLE core.business_credentials
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

-- 2. Crear función RPC para BLOQUEAR una credencial
CREATE OR REPLACE FUNCTION core.lock_credential(p_credential_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE core.business_credentials
    SET is_locked = true
    WHERE id = p_credential_id AND is_locked = false; -- Solo si no está ya bloqueada

    RETURN FOUND; -- Retorna true si se bloqueó, false si ya estaba bloqueada o no existe
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Crear función RPC para DESBLOQUEAR una credencial
CREATE OR REPLACE FUNCTION core.unlock_credential(p_credential_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE core.business_credentials
    SET is_locked = false
    WHERE id = p_credential_id;

    RETURN FOUND; -- Retorna true si se desbloqueó, false si no existe
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Asegurar que solo el service_role (y postgres) pueda ejecutar estas funciones de bloqueo
REVOKE ALL ON FUNCTION core.lock_credential(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.unlock_credential(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.lock_credential(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION core.lock_credential(UUID) TO postgres;
GRANT EXECUTE ON FUNCTION core.unlock_credential(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION core.unlock_credential(UUID) TO postgres;

COMMIT;
