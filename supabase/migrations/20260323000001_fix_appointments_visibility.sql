-- Migration: Fix Appointments Visibility for Employees
-- Date: 2026-03-23
-- Description: Allows all authenticated users to read business_asign_credentials from their own account.
-- This is necessary for employees to know which businesses have Cal.com enabled.

BEGIN;

-- 1. Add a SELECT policy for all authenticated users on business_asign_credentials
DROP POLICY IF EXISTS "Todos los usuarios de la cuenta pueden ver asignaciones de credenciales" ON core.business_asign_credentials;
CREATE POLICY "Todos los usuarios de la cuenta pueden ver asignaciones de credenciales" 
    ON core.business_asign_credentials FOR SELECT 
    USING (account_id = public.get_my_account_id());

COMMIT;
