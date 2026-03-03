-- Migration: 000022-TFA-006 - Add default_punto_venta to businesses
-- Add explicit column for fiscal configuration

BEGIN;

ALTER TABLE core.businesses 
ADD COLUMN IF NOT EXISTS default_punto_venta INTEGER DEFAULT 1;

COMMENT ON COLUMN core.businesses.default_punto_venta IS 'Punto de venta fiscal predeterminado para la facturación electrónica.';

COMMIT;
