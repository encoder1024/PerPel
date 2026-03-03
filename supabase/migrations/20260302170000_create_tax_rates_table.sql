-- Migration: 000025-TFA-009 - Tax Rates Table
-- Create local tax rates table to avoid unstable TFA reference calls

BEGIN;

CREATE TABLE IF NOT EXISTS core.tax_rates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    value NUMERIC(5,2) NOT NULL,
    tfa_id TEXT NOT NULL, -- El ID que espera TusFacturasApp
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar valores oficiales de TFA Argentina
INSERT INTO core.tax_rates (name, value, tfa_id) VALUES
('IVA 27%', 27.00, '6'),
('IVA 21%', 21.00, '5'),
('IVA 10.5%', 10.50, '4'),
('IVA 0%', 0.00, '3'),
('IVA Exento', 0.00, '-1'),
('IVA No Gravado', 0.00, '-2')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE core.tax_rates IS 'Tabla local de alícuotas de IVA para cálculos y facturación.';

COMMIT;
