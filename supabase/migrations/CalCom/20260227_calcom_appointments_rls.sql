-- Cal.com: RLS para core.appointments (multi-tenant por cuenta)
-- Fecha: 2026-02-27

BEGIN;

-- Crear policy solo si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'core'
      AND tablename = 'appointments'
      AND policyname = 'Usuarios solo gestionan turnos de su cuenta'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Usuarios solo gestionan turnos de su cuenta"
        ON core.appointments
        FOR ALL
        USING (account_id = public.get_my_account_id())
        WITH CHECK (account_id = public.get_my_account_id());
    $sql$;
  END IF;
END $$;

COMMIT;

