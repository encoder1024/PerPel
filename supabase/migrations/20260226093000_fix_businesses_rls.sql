-- Habilitar gestión completa de sucursales para OWNER y ADMIN
-- Cambio quirúrgico basado en ScriptDb_revA0.sql
BEGIN;

-- 1. Eliminar la política de solo lectura existente identificada en revA0
DROP POLICY IF EXISTS "Allow authenticated users to read their own businesses" ON core.businesses;

-- 2. Crear política para ver (todos los autenticados de la cuenta)
-- Mantenemos la lógica de la original pero con un nombre más descriptivo en español si se desea, 
-- o conservamos el estilo. Vamos a usar nombres claros.
CREATE POLICY "Usuarios pueden ver negocios de su cuenta"
    ON core.businesses
    FOR SELECT
    TO authenticated
    USING (account_id = public.get_my_account_id());

-- 3. Crear política para gestión completa (INSERT, UPDATE, DELETE) solo para OWNER y ADMIN
CREATE POLICY "Owners y Admins pueden gestionar negocios de su cuenta"
    ON core.businesses
    FOR ALL
    TO authenticated
    USING (
        account_id = public.get_my_account_id() 
        AND (public.get_my_role() = 'OWNER'::app_role OR public.get_my_role() = 'ADMIN'::app_role)
    )
    WITH CHECK (
        account_id = public.get_my_account_id() 
        AND (public.get_my_role() = 'OWNER'::app_role OR public.get_my_role() = 'ADMIN'::app_role)
    );

COMMIT;
