-- Migration: 000027-TFA-011 - Fix invoices schema for TFA
-- Allow null client_id and fix incorrect foreign key

BEGIN;

-- 1. Quitar la restricción NOT NULL de client_id
ALTER TABLE core.invoices ALTER COLUMN client_id DROP NOT NULL;

-- 2. Eliminar la Foreign Key incorrecta hacia auth.users (si existe)
-- En el script original se llama 'invoices_client_id_fkey'
ALTER TABLE core.invoices DROP CONSTRAINT IF EXISTS invoices_client_id_fkey;

-- 3. Vincular client_id a core.customers en lugar de auth.users (Correcto para el dominio)
ALTER TABLE core.invoices 
ADD CONSTRAINT invoices_client_id_customers_fkey 
FOREIGN KEY (client_id) REFERENCES core.customers(id) ON DELETE SET NULL;

COMMIT;
