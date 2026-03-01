-- Habilitar permisos de escritura para auditoría de APIs
BEGIN;

-- 1. Asegurar permisos en el esquema
GRANT USAGE ON SCHEMA logs TO service_role;
GRANT ALL ON TABLE logs.api_logs TO service_role;
GRANT ALL ON SEQUENCE logs.api_logs_id_seq TO service_role;

-- 2. Crear política de inserción para el sistema (Service Role)
-- Nota: Como service_role usualmente se salta el RLS, pero para ser explícitos:
DROP POLICY IF EXISTS "Permitir inserción de logs para el sistema" ON logs.api_logs;
CREATE POLICY "Permitir inserción de logs para el sistema"
    ON logs.api_logs
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- 3. Permitir que el sistema también lea para verificaciones
DROP POLICY IF EXISTS "Permitir lectura de logs para el sistema" ON logs.api_logs;
CREATE POLICY "Permitir lectura de logs para el sistema"
    ON logs.api_logs
    FOR SELECT
    TO service_role
    USING (true);

COMMIT;
