-- Migration: 000010-ALEGRA-001 - Alineación de Modelos de Datos y Storage Jerárquico
-- Add mapping columns for Alegra and setup unified storage structure

BEGIN;

-- 1. Add mapping columns to core.customers
ALTER TABLE core.customers 
ADD COLUMN IF NOT EXISTS alegra_contact_id TEXT;

COMMENT ON COLUMN core.customers.alegra_contact_id IS 'ID del contacto en la API de Alegra para sincronización fiscal.';

-- 2. Add mapping column to core.inventory_items
ALTER TABLE core.inventory_items 
ADD COLUMN IF NOT EXISTS alegra_item_id TEXT;

COMMENT ON COLUMN core.inventory_items.alegra_item_id IS 'ID del producto/servicio en la API de Alegra para sincronización de ítems.';

-- 3. Setup Unified Storage Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('perpel_data', 'perpel_data', false)
ON CONFLICT (id) DO NOTHING;

-- 4. RLS Policies for perpel_data Bucket
-- Estructura: {account_id}/{business_id}/{invoices|pictures}/filename

CREATE POLICY "Allow authenticated users to upload to their account folders"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'perpel_data' AND
  (storage.foldername(name))[1] = (SELECT account_id::text FROM core.user_profiles WHERE id = auth.uid()) AND
  (storage.foldername(name))[3] IN ('invoices', 'pictures')
);

CREATE POLICY "Allow users to read from their account folders"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'perpel_data' AND
  (storage.foldername(name))[1] = (SELECT account_id::text FROM core.user_profiles WHERE id = auth.uid())
);

COMMIT;
