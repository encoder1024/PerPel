-- Migration: 000024-TFA-008 - Factura A Support Fields
-- Support for mandatory Factura A fields in TFA

BEGIN;

ALTER TABLE core.businesses 
ADD COLUMN IF NOT EXISTS tfa_provincia_id INTEGER DEFAULT 2, -- 2: Buenos Aires
ADD COLUMN IF NOT EXISTS tfa_rubro TEXT DEFAULT 'Ventas',
ADD COLUMN IF NOT EXISTS tfa_moneda TEXT DEFAULT 'PES';

COMMENT ON COLUMN core.businesses.tfa_provincia_id IS 'ID de provincia según tabla de referencia de TFA.';
COMMENT ON COLUMN core.businesses.tfa_rubro IS 'Rubro por defecto para los comprobantes en TFA.';

COMMIT;
