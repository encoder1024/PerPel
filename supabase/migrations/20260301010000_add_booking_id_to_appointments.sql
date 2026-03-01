/***************************************************************************************
 * MIGRACIÓN: 20260301010000_add_booking_id_to_appointments.sql
 * Agrega external_booking_id para guardar el bookingId numérico que usa Cal.com v1.
 ***************************************************************************************/

BEGIN;

ALTER TABLE core.appointments
  ADD COLUMN IF NOT EXISTS external_booking_id TEXT;

COMMIT;
