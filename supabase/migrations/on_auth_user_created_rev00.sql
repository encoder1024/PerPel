CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE PROCEDURE core.handle_new_user();

-- 1. Asegurar que el rol que ejecuta (postgres) tenga acceso al esquema
GRANT USAGE ON SCHEMA core TO postgres, authenticated, anon;

-- 2. Dar permisos de inserción a las tablas específicas para el proceso de registro
GRANT INSERT ON core.accounts TO postgres, authenticated, anon;
GRANT INSERT ON core.user_profiles TO postgres, authenticated, anon;

-- 3. (IMPORTANTE) Si usas secuencias para los IDs, dales permiso también
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core TO postgres, authenticated, anon;

-- 4. Modificar la función para que siempre use el path correcto
ALTER FUNCTION core.handle_new_user() SET search_path = core, public;

-----------------------------------------///---------------------------------------------
-- Comando para borrar la función y el trigger cuando no funciona:

DROP FUNCTION IF EXISTS core.handle_new_user() CASCADE;