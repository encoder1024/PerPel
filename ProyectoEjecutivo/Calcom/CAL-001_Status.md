# CAL-001 - Estado y Checklist (Cal.com)

Fecha: 2026-02-27

## Mapping de estados Cal.com → ERP
- `BOOKING_CREATED` → `SCHEDULED`
- `BOOKING_RESCHEDULED` → `RESCHEDULED`
- `BOOKING_CANCELLED` → `CANCELLED`
- `BOOKING_NO_SHOW` → `NO_SHOW`

## Checklist de DB (ScriptDb_revA0.sql)
- `core.appointments` incluye:
  - `external_cal_id`, `status`, `start_time`, `end_time`, `business_id`, `account_id` ✔
  - Índice único por `(account_id, external_cal_id)` con `is_deleted = false` ✔
  - Trigger audit + updated_at ✔
  - RLS habilitado ✔
  - **Policy RLS específica**: pendiente → migración Cal.com incluida ✔

## Migraciones creadas (Cal.com)
- `supabase/migrations/CalCom/20260227_calcom_appointments.sql`
  - Agrega `RESCHEDULED` al enum `appointment_status` (si no existe).
- `supabase/migrations/CalCom/20260227_calcom_appointments_rls.sql`
  - Crea policy: `"Usuarios solo gestionan turnos de su cuenta"`.

## RxDB
- `appointments` agregado a `src/services/db.js` (DB `perpel_db_v5`) ✔

