/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260224140000_add_columns_to_role_requests.sql                    *
 *   FASE 1.1: AÑADIR COLUMNAS A core.role_requests                               *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- Añadir columna registration_code_used a core.role_requests
ALTER TABLE core.role_requests
ADD COLUMN IF NOT EXISTS registration_code_used TEXT;

-- Añadir columna created_at a core.role_requests (si no existe)
-- Es importante usar ADD COLUMN IF NOT EXISTS para evitar errores si ya existiera
ALTER TABLE core.role_requests
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

COMMIT;
