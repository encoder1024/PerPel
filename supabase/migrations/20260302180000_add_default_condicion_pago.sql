-- Migration: 000026-TFA-010 - Add default_condicion_pago to businesses
-- Add support for storing the default payment condition per business

BEGIN;

ALTER TABLE core.businesses 
ADD COLUMN IF NOT EXISTS default_condicion_pago INTEGER DEFAULT 1; -- 1: Contado (Generalmente)

COMMENT ON COLUMN core.businesses.default_condicion_pago IS 'Condición de pago predeterminada para el negocio según TFA.';

COMMIT;
