-- Cal.com: Ajustes mínimos para estados de turnos
-- Fecha: 2026-02-27

BEGIN;

-- 1) Asegurar estado RESCHEDULED en el enum appointment_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'appointment_status'
      AND n.nspname = 'public'
      AND e.enumlabel = 'RESCHEDULED'
  ) THEN
    ALTER TYPE public.appointment_status ADD VALUE 'RESCHEDULED';
  END IF;
END $$;

COMMIT;

