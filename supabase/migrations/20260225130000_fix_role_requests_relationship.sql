/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260225130000_fix_role_requests_relationship.sql                  *
 *   CORRECCIÓN: VINCULAR role_requests CON user_profiles PARA LA API              *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- 1. Eliminar la restricción antigua que apunta a auth.users
-- Esto libera la columna para que la API pueda ver la relación con user_profiles
ALTER TABLE core.role_requests 
DROP CONSTRAINT IF EXISTS role_requests_user_id_fkey;

-- 2. Crear la nueva relación hacia core.user_profiles
-- Esto permite que el join .select('*, user_id(...)') funcione en el frontend
ALTER TABLE core.role_requests 
ADD CONSTRAINT role_requests_user_profiles_fkey 
FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;

COMMIT;
