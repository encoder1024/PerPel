-- Función RPC para validar códigos de registro saltando RLS
-- Permite que usuarios nuevos encuentren una cuenta para solicitar acceso
BEGIN;

CREATE OR REPLACE FUNCTION public.get_account_by_code(p_code TEXT)
RETURNS TABLE (id UUID, account_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER -- Bypassa RLS
SET search_path = core, public
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.account_name
  FROM core.accounts a
  WHERE a.registration_code = p_code
    AND a.is_deleted = false;
END;
$$;

-- Otorgar permisos de ejecución a usuarios autenticados
REVOKE EXECUTE ON FUNCTION public.get_account_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_account_by_code(TEXT) TO authenticated;

-- Comentario descriptivo
COMMENT ON FUNCTION public.get_account_by_code(TEXT) IS 'Busca una cuenta por su código de registro saltando RLS. Usado durante el onboarding de usuarios.';

COMMIT;
