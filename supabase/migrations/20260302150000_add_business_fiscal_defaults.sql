-- Migration: 000023-TFA-007 - Advanced Business Fiscal Defaults
-- Add more columns to core.businesses for TFA integration

BEGIN;

ALTER TABLE core.businesses 
ADD COLUMN IF NOT EXISTS default_comprobante_tipo TEXT DEFAULT '11',
ADD COLUMN IF NOT EXISTS tfa_concepto INTEGER DEFAULT 1; -- 1: Productos, 2: Servicios, 3: Ambos

COMMENT ON COLUMN core.businesses.default_comprobante_tipo IS 'Tipo de comprobante predeterminado (1:A, 6:B, 11:C).';
COMMENT ON COLUMN core.businesses.tfa_concepto IS 'Concepto de facturación TFA (1:Prod, 2:Serv, 3:Ambos).';

COMMIT;
