-- Migración para habilitar la relación entre logs de auditoría y perfiles de usuario
BEGIN;

-- 1. Agregar la restricción de clave foránea a la tabla audit_log
-- Esto permite que PostgREST detecte la relación y permita joins automáticos
ALTER TABLE logs.audit_log
DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;

ALTER TABLE logs.audit_log
ADD CONSTRAINT audit_log_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES core.user_profiles(id)
ON DELETE SET NULL;

-- 2. Comentario informativo
COMMENT ON CONSTRAINT audit_log_user_id_fkey ON logs.audit_log IS 'Relación para trazabilidad de usuarios en el registro de auditoría';

COMMIT;
