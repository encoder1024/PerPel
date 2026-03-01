-- Cal.com: asegurar acceso del service_role al schema core
-- Fecha: 2026-02-27

BEGIN;

GRANT USAGE ON SCHEMA core TO service_role;

COMMIT;

