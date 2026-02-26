/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260225140000_allow_owners_to_see_applicants.sql                 *
 *   CORRECCIÓN: PERMITIR VISIBILIDAD DE PERFILES A LOS APROBADORES                *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- 1. Política para que Owners y Admins puedan ver los perfiles de quienes solicitan unirse a su cuenta
-- Sin esta política, el JOIN en el frontend devuelve NULL por restricciones de RLS
CREATE POLICY "Owners y Admins ven perfiles de solicitantes"
ON core.user_profiles
FOR SELECT
TO authenticated
USING (
    (account_id = public.get_my_account_id()) -- Ya miembros de la cuenta
    OR 
    EXISTS ( -- O personas con una solicitud pendiente para esta cuenta
        SELECT 1 FROM core.role_requests
        WHERE core.role_requests.user_id = core.user_profiles.id
        AND core.role_requests.account_id = public.get_my_account_id()
        AND core.role_requests.status = 'PENDING'
    )
);

COMMIT;
