-- Migration: 000017-TFA-001 - Switch Invoicing API to TusFacturasApp
-- Clean up Alegra specific SQL and setup TFA schema

BEGIN;

-- 1. CLEAN UP: Drop Alegra specific functions
DROP FUNCTION IF EXISTS public.get_alegra_contact(UUID);

-- 2. SCHEMA UPDATE: Add TUS_FACTURAS_APP to enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'external_api_name' AND e.enumlabel = 'TUS_FACTURAS_APP') THEN
        ALTER TYPE public.external_api_name ADD VALUE 'TUS_FACTURAS_APP';
    END IF;
END
$$;

-- 3. SCHEMA UPDATE: Rename and Refactor mapping columns on core.customers
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'customers' AND column_name = 'alegra_contact_id') THEN
        ALTER TABLE core.customers RENAME COLUMN alegra_contact_id TO tfa_client_id;
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'customers' AND column_name = 'tfa_client_id') THEN
        ALTER TABLE core.customers ADD COLUMN tfa_client_id TEXT;
    END IF;
END
$$;

COMMENT ON COLUMN core.customers.tfa_client_id IS 'ID del cliente en la API de TusFacturasApp para sincronización fiscal.';

-- 4. SCHEMA UPDATE: Handle items mapping on core.inventory_items
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'inventory_items' AND column_name = 'alegra_item_id') THEN
        ALTER TABLE core.inventory_items RENAME COLUMN alegra_item_id TO tfa_product_id;
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'inventory_items' AND column_name = 'tfa_product_id') THEN
        ALTER TABLE core.inventory_items ADD COLUMN tfa_product_id TEXT;
    END IF;
END
$$;

COMMENT ON COLUMN core.inventory_items.tfa_product_id IS 'ID del producto/servicio en la API de TusFacturasApp para sincronización de ítems.';

COMMIT;
