-- Corregir la relación de employee_assignments para que apunte a user_profiles
-- Esto permite que PostgREST resuelva las uniones (joins) automáticamente.

BEGIN;

ALTER TABLE core.employee_assignments
DROP CONSTRAINT IF EXISTS employee_assignments_user_id_fkey;

ALTER TABLE core.employee_assignments
ADD CONSTRAINT employee_assignments_user_profiles_fkey 
FOREIGN KEY (user_id) REFERENCES core.user_profiles(id)
ON DELETE CASCADE;

COMMIT;
