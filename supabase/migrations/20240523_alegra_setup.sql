-- 1. Mapeo de IDs de Alegra en nuestras tablas existentes
ALTER TABLE core.inventory_items ADD COLUMN IF NOT EXISTS alegra_item_id TEXT;
ALTER TABLE core.user_profiles ADD COLUMN IF NOT EXISTS alegra_contact_id TEXT;

-- 2. Cola de Facturas Pendientes (Punto 9 de la estrategia)
-- Para reintentos automáticos si la API de Alegra está caída.
CREATE TABLE IF NOT EXISTS core.pending_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES core.orders(id) ON DELETE CASCADE,
  account_id UUID REFERENCES core.accounts(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  attempts INT DEFAULT 0,
  last_error TEXT,
  status TEXT DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RPC: Validar Stock Real en Alegra (Punto 7)
-- Nota: Esta función marcará la intención, la validación final ocurre en la Edge Function.
CREATE OR REPLACE FUNCTION public.check_stock_availability(p_item_id UUID, p_quantity INT)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_stock INT;
BEGIN
  SELECT quantity INTO v_current_stock 
  FROM core.stock_levels 
  WHERE item_id = p_item_id;
  
  RETURN v_current_stock >= p_quantity;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 4. RPC: Mapeo de Contactos (Punto 3)
CREATE OR REPLACE FUNCTION public.get_alegra_contact(p_user_id UUID)
RETURNS TEXT AS $$
  SELECT alegra_contact_id FROM core.user_profiles WHERE id = p_user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
