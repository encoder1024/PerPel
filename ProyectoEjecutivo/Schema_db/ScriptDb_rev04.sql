
--Primero se ejecuta esto apra crear la DB casi completa y luego al final del archivo están las 3 RSL que faltan crear.

/************************************************************************************
 *                                                                                  *
 *   SCRIPT DE BASE DE DATOS v04 - ARQUITECTURA MULTI-TENANT POR CUENTA (SAAS)     *
 *                      (Versión Final, Completa y Explícita)                     *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

/******************************************************************************
 * PASO 1: DEFINICIONES GLOBALES (SCHEMAS, FUNCIONES Y ENUMS)
 ******************************************************************************/

-- SCHEMAS
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS logs;
CREATE SCHEMA IF NOT EXISTS reports;

-- FUNCIONES AUXILIARES Y DE AUDITORÍA
----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.log_changes()
RETURNS TRIGGER AS $$
DECLARE
  record_id_text TEXT;
  action_text TEXT;
  account_id_to_log UUID;
BEGIN
  action_text := TG_OP;
  
  IF (TG_OP = 'UPDATE') THEN
    record_id_text = NEW.id::TEXT;
    account_id_to_log := NEW.account_id;
    IF OLD.deleted = false AND NEW.deleted = true THEN
      action_text := 'SOFT_DELETE';
    END IF;
  ELSEIF (TG_OP = 'INSERT') THEN
    record_id_text = NEW.id::TEXT;
    account_id_to_log := NEW.account_id;
  ELSE -- DELETE
    record_id_text = OLD.id::TEXT;
    account_id_to_log := OLD.account_id;
  END IF;

  INSERT INTO logs.audit_log (user_id, account_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    account_id_to_log,
    action_text,
    TG_TABLE_NAME,
    record_id_text,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- TIPOS PERSONALIZADOS (ENUMS)
----------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('OWNER', 'ADMIN', 'EMPLOYEE', 'AUDITOR', 'DEVELOPER');
CREATE TYPE public.external_api_name AS ENUM ('MERCADOPAGO', 'ARCA', 'INVOICING_API', 'ONESIGNAL', 'CAL_COM');
CREATE TYPE public.business_type AS ENUM ('SALON', 'PERFUMERY');
CREATE TYPE public.item_type AS ENUM ('PRODUCT', 'SERVICE');
CREATE TYPE public.order_status AS ENUM ('PENDING', 'PAID', 'ABANDONED', 'ERROR');
CREATE TYPE public.payment_method AS ENUM ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'MERCADOPAGO_QR', 'MERCADOPAGO_ONLINE');
CREATE TYPE public.sync_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
CREATE TYPE public.appointment_status AS ENUM ('SCHEDULED', 'COMPLETED', 'NO_SHOW', 'PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'AWAITING_HOST');
CREATE TYPE public.user_category AS ENUM ('VIP', 'CASUAL', 'NEW', 'INACTIVE', 'ONTIME');
CREATE TYPE public.item_status AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUE');
CREATE TYPE public.customer_doc_type AS ENUM ('80', '96', '99');
CREATE TYPE public.cbte_tipo AS ENUM ('1', '6', '11');
CREATE TYPE public.arca_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ERROR');
CREATE TYPE public.category_scope AS ENUM ('SALON', 'PERFUMERY', 'ALL');
CREATE TYPE public.payment_status AS ENUM ('in_process', 'approved', 'rejected', 'cancelled');
CREATE TYPE public.payment_point_type AS ENUM ('online', 'point');
CREATE TYPE public.session_status AS ENUM ('OPEN', 'CLOSED');


/******************************************************************************
 * PASO 2: ESTRUCTURA DE TABLAS (AGRUPADO POR TABLA CON MULTI-TENANCY)
 ******************************************************************************/
---
--- TABLA: accounts
---
CREATE TABLE core.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  account_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE TRIGGER on_accounts_update BEFORE UPDATE ON core.accounts FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_accounts_changes AFTER INSERT OR UPDATE OR DELETE ON core.accounts FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.accounts ENABLE ROW LEVEL SECURITY; ALTER TABLE core.accounts FORCE ROW LEVEL SECURITY;
--CREATE POLICY "Dueños pueden ver y gestionar su propia cuenta" ON core.accounts FOR ALL USING (id = public.get_my_account_id() AND owner_user_id = auth.uid());
--CREATE POLICY "Acceso total para Desarrolladores" ON core.accounts FOR ALL USING (public.get_my_role() = 'DEVELOPER');

---
--- TABLA: user_profiles
---
CREATE TABLE core.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  app_role public.app_role,
  email TEXT,
  phone_number TEXT,
  street TEXT,
  city TEXT,
  state_prov TEXT,
  zip_code TEXT,
  country TEXT,
  dni TEXT,
  cuil_cuit TEXT,
  category public.user_category,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT name_length CHECK (char_length(full_name) > 0)
);
CREATE INDEX idx_profiles_account_role ON core.user_profiles(account_id, app_role);
CREATE UNIQUE INDEX idx_unique_active_user_dni ON core.user_profiles(account_id, dni) WHERE deleted = false;
CREATE UNIQUE INDEX idx_unique_active_user_cuil ON core.user_profiles(account_id, cuil_cuit) WHERE deleted = false;
CREATE TRIGGER on_profiles_update BEFORE UPDATE ON core.user_profiles FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_profiles_changes AFTER INSERT OR UPDATE OR DELETE ON core.user_profiles FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.user_profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE core.user_profiles FORCE ROW LEVEL SECURITY;
--CREATE POLICY "Usuarios solo acceden a perfiles de su propia cuenta" ON core.user_profiles FOR ALL USING (account_id = public.get_my_account_id());
CREATE POLICY "Usuarios pueden actualizar su propio perfil" ON core.user_profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- FUNCIONES DE SEGURIDAD PARA RLS ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_account_id()
RETURNS UUID AS $$
  SELECT account_id FROM core.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role AS $$
  SELECT app_role FROM core.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;


---
--- TABLA: businesses
---
CREATE TABLE core.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.business_type NOT NULL,
  email TEXT,
  phone_number TEXT,
  street TEXT,
  city TEXT,
  state_prov TEXT,
  zip_code TEXT,
  country TEXT,
  location_coords TEXT,
  tax_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT name_not_empty CHECK (char_length(name) > 0)
);
CREATE INDEX idx_businesses_account_id ON core.businesses(account_id);
CREATE TRIGGER on_businesses_update BEFORE UPDATE ON core.businesses FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_businesses_changes AFTER INSERT OR UPDATE OR DELETE ON core.businesses FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.businesses ENABLE ROW LEVEL SECURITY; ALTER TABLE core.businesses FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo acceden a negocios de su propia cuenta" ON core.businesses FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: employee_assignments
---
CREATE TABLE core.employee_assignments (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (account_id, user_id, business_id)
);
CREATE INDEX idx_assignments_account_user ON core.employee_assignments(account_id, user_id);
CREATE TRIGGER on_employee_assignments_update BEFORE UPDATE ON core.employee_assignments FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_employee_assignments_changes AFTER INSERT OR UPDATE OR DELETE ON core.employee_assignments FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.employee_assignments ENABLE ROW LEVEL SECURITY; ALTER TABLE core.employee_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo gestionan asignaciones de su cuenta" ON core.employee_assignments FOR ALL USING (account_id = public.get_my_account_id());

-- FUNCIONES DE SEGURIDAD PARA RLS ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_employee_of(business_id_to_check UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM core.employee_assignments
    WHERE user_id = auth.uid() 
      AND business_id = business_id_to_check 
      AND account_id = public.get_my_account_id()
      AND deleted = false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

---
--- TABLA: item_categories
---
CREATE TABLE core.item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  applies_to public.category_scope NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX idx_unique_active_item_category_name ON core.item_categories(account_id, name) WHERE deleted = false;
CREATE TRIGGER on_item_categories_update BEFORE UPDATE ON core.item_categories FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_item_categories_changes AFTER INSERT OR UPDATE OR DELETE ON core.item_categories FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.item_categories ENABLE ROW LEVEL SECURITY; ALTER TABLE core.item_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo gestionan categorias de su cuenta" ON core.item_categories FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: inventory_items
---
CREATE TABLE core.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  category_id UUID REFERENCES core.item_categories(id) ON DELETE SET NULL,
  item_type public.item_type NOT NULL,
  item_status public.item_status NOT NULL,
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  duration_minutes INT,
  cost_price NUMERIC(10, 2) DEFAULT 0,
  selling_price NUMERIC(10, 2) NOT NULL,
  is_for_sale BOOLEAN DEFAULT true,
  attributes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT selling_price_must_be_positive CHECK (selling_price > 0),
  CONSTRAINT cost_price_must_be_positive CHECK (cost_price >= 0),
  CONSTRAINT selling_price_vs_cost_check CHECK (selling_price >= cost_price),
  CONSTRAINT name_not_empty CHECK (char_length(name) > 0)
);
CREATE INDEX idx_items_account_name ON core.inventory_items(account_id, name);
CREATE UNIQUE INDEX idx_unique_active_inventory_item_sku ON core.inventory_items(account_id, sku) WHERE deleted = false;
CREATE TRIGGER on_items_update BEFORE UPDATE ON core.inventory_items FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_inventory_items_changes AFTER INSERT OR UPDATE OR DELETE ON core.inventory_items FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.inventory_items ENABLE ROW LEVEL SECURITY; ALTER TABLE core.inventory_items FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo gestionan items de su cuenta" ON core.inventory_items FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: stock_levels
---
CREATE TABLE core.stock_levels (
  item_id UUID NOT NULL REFERENCES core.inventory_items(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  quantity INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (account_id, item_id, business_id),
  CONSTRAINT quantity_must_be_non_negative CHECK (quantity >= 0)
);
CREATE TRIGGER on_stock_update BEFORE UPDATE ON core.stock_levels FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_stock_levels_changes AFTER INSERT OR UPDATE OR DELETE ON core.stock_levels FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.stock_levels ENABLE ROW LEVEL SECURITY; ALTER TABLE core.stock_levels FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo gestionan stock de su cuenta" ON core.stock_levels FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: appointments
---
CREATE TABLE core.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  external_cal_id TEXT,
  client_id UUID REFERENCES core.user_profiles(id),
  employee_id UUID REFERENCES core.user_profiles(id),
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  service_id UUID REFERENCES core.inventory_items(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  event_type_id INTEGER,
  service_notes TEXT,
  cancel_reason TEXT,
  status public.appointment_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT time_check CHECK (end_time > start_time)
);
CREATE UNIQUE INDEX idx_unique_active_appointment_cal_id ON core.appointments(account_id, external_cal_id) WHERE deleted = false;
CREATE INDEX idx_appointments_account_status_date ON core.appointments(account_id, status, start_time);
CREATE TRIGGER on_appointments_update BEFORE UPDATE ON core.appointments FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_appointments_changes AFTER INSERT OR UPDATE OR DELETE ON core.appointments FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.appointments ENABLE ROW LEVEL SECURITY; ALTER TABLE core.appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo gestionan turnos de su cuenta" ON core.appointments FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: orders
---
CREATE TABLE core.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id),
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  total_amount NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'ARS',
  status public.order_status NOT NULL DEFAULT 'PENDING',
  mercadopago_preference_id TEXT,
  customer_doc_type TEXT DEFAULT '99',
  customer_doc_number TEXT DEFAULT '0',
  customer_name TEXT DEFAULT 'Consumidor Final',
  iva_condition TEXT DEFAULT 'Consumidor Final',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_orders_account_status_date ON core.orders(account_id, status, created_at);
CREATE TRIGGER on_orders_update BEFORE UPDATE ON core.orders FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_orders_changes AFTER INSERT OR UPDATE OR DELETE ON core.orders FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.orders ENABLE ROW LEVEL SECURITY; ALTER TABLE core.orders FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo acceden a órdenes de su propia cuenta" ON core.orders FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: order_items
---
CREATE TABLE core.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES core.orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES core.inventory_items(id) ON DELETE RESTRICT,
  quantity INT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT quantity_must_be_positive CHECK (quantity > 0)
);
CREATE TRIGGER on_order_items_update BEFORE UPDATE ON core.order_items FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_order_items_changes AFTER INSERT OR UPDATE OR DELETE ON core.order_items FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.order_items ENABLE ROW LEVEL SECURITY; ALTER TABLE core.order_items FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo acceden a items de órdenes de su cuenta" ON core.order_items FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: invoices
---
CREATE TABLE core.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  order_id UUID UNIQUE REFERENCES core.orders(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES auth.users(id),
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  total_amount NUMERIC(19, 4) NOT NULL,
  arca_cae TEXT,
  arca_status public.arca_status,
  cae_vencimiento DATE,
  cbte_tipo public.cbte_tipo,
  punto_venta INTEGER,
  cbte_nro INTEGER,
  qr_link TEXT,
  full_pdf_url TEXT,
  is_printed BOOLEAN DEFAULT false,
  printed_at TIMESTAMPTZ,
  printer_id TEXT,
  fch_serv_desde DATE DEFAULT CURRENT_DATE,
  fch_serv_hasta DATE DEFAULT CURRENT_DATE,
  fch_serv_vto_pago DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX idx_unique_active_invoice_cae ON core.invoices(account_id, arca_cae) WHERE deleted = false;
CREATE TRIGGER on_invoices_update BEFORE UPDATE ON core.invoices FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_invoices_changes AFTER INSERT OR UPDATE OR DELETE ON core.invoices FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.invoices ENABLE ROW LEVEL SECURITY; ALTER TABLE core.invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo acceden a facturas de su cuenta" ON core.invoices FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: payments
---
CREATE TABLE core.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES core.orders(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  mp_payment_id TEXT,
  amount NUMERIC(19,4) NOT NULL,
  status public.payment_status NOT NULL,
  payment_type public.payment_point_type,
  payment_method_id TEXT,
  device_id TEXT,
  card_last_four TEXT,
  installments INTEGER DEFAULT 1,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT amount_is_positive CHECK (amount > 0)
);
CREATE INDEX idx_payments_account_order_id ON core.payments(account_id, order_id);
CREATE UNIQUE INDEX idx_unique_active_payment_mp_id ON core.payments(account_id, mp_payment_id) WHERE deleted = false;
CREATE TRIGGER on_payments_update BEFORE UPDATE ON core.payments FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_payments_changes AFTER INSERT OR UPDATE OR DELETE ON core.payments FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.payments ENABLE ROW LEVEL SECURITY; ALTER TABLE core.payments FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo acceden a pagos de su cuenta" ON core.payments FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: cash_register_sessions
---
CREATE TABLE core.cash_register_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  opened_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  closed_by_user_id UUID REFERENCES auth.users(id),
  opening_balance NUMERIC(10, 2) NOT NULL,
  closing_balance NUMERIC(10, 2),
  calculated_cash_in NUMERIC(10, 2),
  status public.session_status NOT NULL DEFAULT 'OPEN',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT opening_balance_not_negative CHECK (opening_balance >= 0)
);
CREATE INDEX idx_cash_sessions_account_business_status ON core.cash_register_sessions(account_id, business_id, status);
CREATE TRIGGER on_cash_register_sessions_update BEFORE UPDATE ON core.cash_register_sessions FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_cash_register_sessions_changes AFTER INSERT OR UPDATE OR DELETE ON core.cash_register_sessions FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.cash_register_sessions ENABLE ROW LEVEL SECURITY; ALTER TABLE core.cash_register_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY "Empleados solo gestionan cajas de su cuenta" ON core.cash_register_sessions FOR ALL USING (account_id = public.get_my_account_id()) WITH CHECK (public.is_employee_of(business_id));

---
--- TABLA: api_logs (Schema: logs)
---
CREATE TABLE logs.api_logs (
  id BIGSERIAL PRIMARY KEY,
  account_id UUID REFERENCES core.accounts(id) ON DELETE SET NULL,
  api_name public.external_api_name NOT NULL,
  endpoint TEXT,
  order_id UUID REFERENCES core.orders(id) ON DELETE SET NULL,
  operation_name TEXT NOT NULL,
  correlation_id TEXT,
  request_payload JSONB,
  response_payload JSONB,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_apilogs_account_correlation ON logs.api_logs(account_id, correlation_id);
CREATE TRIGGER on_api_logs_update BEFORE UPDATE ON logs.api_logs FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_api_logs_changes AFTER INSERT OR UPDATE OR DELETE ON logs.api_logs FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE logs.api_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE logs.api_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY "Admins/Owners pueden ver logs de su cuenta" ON logs.api_logs FOR SELECT USING (account_id = public.get_my_account_id() AND public.get_my_role() IN ('ADMIN', 'OWNER'));
---
--- TABLA: offline_sync_queue (Schema: core)
---
CREATE TABLE core.offline_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  operation TEXT NOT NULL,
  payload JSONB NOT NULL,
  status public.sync_status NOT NULL DEFAULT 'PENDING',
  attempts INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE TRIGGER on_offline_sync_queue_update BEFORE UPDATE ON core.offline_sync_queue FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_offline_sync_queue_changes AFTER INSERT OR UPDATE OR DELETE ON core.offline_sync_queue FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.offline_sync_queue ENABLE ROW LEVEL SECURITY; ALTER TABLE core.offline_sync_queue FORCE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total para Desarrolladores" ON core.offline_sync_queue FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Admins/Owners ven la cola de sincronización" ON core.offline_sync_queue FOR SELECT USING (public.get_my_role() IN ('ADMIN', 'OWNER'));

---
--- TABLA: audit_log (Schema: logs)
---
CREATE TABLE logs.audit_log (
  id BIGSERIAL PRIMARY KEY,
  account_id UUID REFERENCES core.accounts(id) ON DELETE SET NULL,
  user_id UUID,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_audit_log_account_id ON logs.audit_log(account_id);
CREATE TRIGGER on_audit_log_update BEFORE UPDATE ON logs.audit_log FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
ALTER TABLE logs.audit_log ENABLE ROW LEVEL SECURITY; ALTER TABLE logs.audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY "Admins/Owners/Auditores pueden ver el audit log de su cuenta" ON logs.audit_log FOR SELECT USING (account_id = public.get_my_account_id() AND public.get_my_role() IN ('ADMIN', 'OWNER', 'AUDITOR'));

/******************************************************************************
 * PASO 3: PRECARGA DE DATOS
 ******************************************************************************/

-- La precarga de datos ahora debe estar asociada a una cuenta específica.
-- Esto se haría mediante una función Edge después de que un usuario se registre y cree su cuenta.
-- Ejemplo conceptual:
-- INSERT INTO core.item_categories (account_id, name, description, applies_to)
-- VALUES
--  ('el_id_de_la_nueva_cuenta', 'Fragancias', 'Perfumes...', 'PERFUMERY');
-- INSERT INTO core.item_categories (name, description, applies_to, deleted)
-- VALUES
--   ('Fragancias', 'Perfumes, colonias y aguas de tocador.', 'PERFUMERY', false),
--   ('Cuidado de la Piel', 'Cremas faciales, serums, limpiadores y mascarillas.', 'PERFUMERY', false),
--   ('Maquillaje', 'Bases, labiales, sombras, máscaras de pestañas.', 'PERFUMERY', false),
--   ('Cuidado Corporal', 'Cremas corporales, exfoliantes y aceites.', 'PERFUMERY', false),
--   ('Shampoos y Acondicionadores', 'Productos para el lavado y cuidado diario del cabello.', 'SALON', false),
--   ('Tratamientos Capilares', 'Mascarillas intensivas, ampollas y tratamientos de reconstrucción.', 'SALON', false),
--   ('Fijación y Estilizado', 'Geles, ceras, espumas, lacas y protectores térmicos.', 'SALON', false),
--   ('Coloración', 'Tinturas permanentes, semi-permanentes y tonalizadores.', 'SALON', false),
--   ('Herramientas de Estilizado', 'Secadores, planchas, rizadores y cepillos.', 'SALON', false),
--   ('Cuidado Capilar', 'Productos generales para el cabello que se venden en ambos negocios.', 'ALL', false),
--   ('Accesorios', 'Brochas, peines, hebillas y otros complementos.', 'ALL', false),
--   ('Kits y Promociones', 'Conjuntos de productos ofrecidos como un paquete.', 'ALL', false);


/******************************************************************************
 * PASO 4: VISTAS DE REPORTES (Schema: reports)
 ******************************************************************************/

--SQL Actualizado para las Vistas de Reportes (Multi-Tenant)

-- VISTA 1: Resumen Diario de Ventas (El Patrón)
-- Muestra el rendimiento de ventas por día, por negocio y por cuenta.
CREATE OR REPLACE VIEW reports.daily_sales_summary AS
SELECT
  o.account_id,
  DATE(o.created_at) AS report_date,
  o.business_id,
  b.name AS business_name,
  SUM(o.total_amount) AS total_sales,
  COUNT(o.id) AS order_count,
  AVG(o.total_amount) AS average_order_value
FROM
  core.orders AS o
  JOIN core.businesses AS b ON o.business_id = b.id
WHERE
  o.status = 'PAID' AND o.deleted = false AND b.deleted = false
GROUP BY
  o.account_id,
  report_date,
  o.business_id,
  b.name;


-- VISTA 2: Rendimiento de Productos y Servicios
-- Analiza qué ítems son los más vendidos, segregado por cuenta y negocio.
CREATE OR REPLACE VIEW reports.product_performance AS
SELECT
  o.account_id,
  o.business_id,
  b.name AS business_name,
  ii.id AS item_id,
  ii.name AS item_name,
  ii.item_type,
  SUM(oi.quantity) AS total_quantity_sold,
  SUM(oi.quantity * oi.unit_price) AS total_revenue
FROM
  core.order_items AS oi
  JOIN core.inventory_items AS ii ON oi.item_id = ii.id
  JOIN core.orders AS o ON oi.order_id = o.id
  JOIN core.businesses AS b ON o.business_id = b.id
WHERE
  o.status = 'PAID' AND oi.deleted = false AND ii.deleted = false AND o.deleted = false AND b.deleted = false
GROUP BY
  o.account_id,
  o.business_id,
  b.name,
  ii.id;


-- VISTA 3: Niveles de Inventario Actual
-- Provee una vista rápida del stock actual, segregado por cuenta y negocio.
CREATE OR REPLACE VIEW reports.current_inventory_levels AS
SELECT
  sl.account_id,
  sl.business_id,
  b.name AS business_name,
  sl.item_id,
  ii.name AS item_name,
  ii.sku,
  sl.quantity AS current_quantity
FROM
  core.stock_levels AS sl
  JOIN core.inventory_items AS ii ON sl.item_id = ii.id
  JOIN core.businesses AS b ON sl.business_id = b.id
WHERE
  sl.deleted = false AND ii.deleted = false AND b.deleted = false;


-- VISTA 4: Actividad y Valor de Clientes
-- Identifica a los clientes más valiosos por gasto y frecuencia, dentro de cada cuenta.
CREATE OR REPLACE VIEW reports.customer_activity AS
SELECT
  o.account_id,
  o.client_id,
  up.full_name AS client_name,
  up.email AS client_email,
  SUM(o.total_amount) AS total_spent,
  COUNT(o.id) AS order_count,
  MIN(o.created_at) AS first_order_date,
  MAX(o.created_at) AS last_order_date
FROM
  core.orders AS o
  JOIN core.user_profiles AS up ON o.client_id = up.id
WHERE
  o.status = 'PAID' AND o.deleted = false AND up.deleted = false
GROUP BY
  o.account_id,
  o.client_id,
  up.full_name,
  up.email;


-- VISTA 5: Rendimiento de Empleados por Servicios
-- Mide los servicios completados y los ingresos por empleado, dentro de cada cuenta y negocio.
CREATE OR REPLACE VIEW reports.employee_service_performance AS
SELECT
  a.account_id,
  a.business_id,
  b.name AS business_name,
  a.employee_id,
  up.full_name AS employee_name,
  COUNT(a.id) AS completed_services,
  SUM(ii.selling_price) AS total_revenue_from_services
FROM
  core.appointments AS a
  JOIN core.inventory_items AS ii ON a.service_id = ii.id
  JOIN core.user_profiles AS up ON a.employee_id = up.id
  JOIN core.businesses AS b ON a.business_id = b.id
WHERE
  a.status = 'COMPLETED' AND a.deleted = false AND ii.deleted = false AND up.deleted = false AND b.deleted = false
GROUP BY
  a.account_id,
  a.business_id,
  b.name,
  a.employee_id,
  up.full_name;


-- VISTA 6: Vista Consolidada General por Cuenta ("Fuente de Verdad")
-- Ofrece una fila con los KPIs totales por cada cuenta (tenant).
CREATE OR REPLACE VIEW reports.consolidated_business_snapshot AS
SELECT
  a.id AS account_id,
  a.account_name,
  (SELECT SUM(o.total_amount) FROM core.orders o WHERE o.status = 'PAID' AND o.deleted = false AND o.account_id = a.id) AS total_revenue,
  (SELECT COUNT(o.id) FROM core.orders o WHERE o.status = 'PAID' AND o.deleted = false AND o.account_id = a.id) AS total_orders,
  (SELECT COUNT(DISTINCT o.client_id) FROM core.orders o WHERE o.status = 'PAID' AND o.deleted = false AND o.account_id = a.id) AS
total_active_customers,
  (SELECT SUM(oi.quantity) FROM core.order_items oi WHERE oi.deleted = false AND oi.account_id = a.id) AS total_items_sold,
  (SELECT COUNT(ap.id) FROM core.appointments ap WHERE ap.status = 'COMPLETED' AND ap.deleted = false AND ap.account_id = a.id) AS
total_completed_appointments
FROM
  core.accounts AS a
WHERE
  a.deleted = false;

COMMIT;

--Final primer tamo de código para crear la DB.
------------------------------------------------------------------//-----------------------------------------------------------

--Estas tres RSL se ejecutan al final, luego de generar las tablas necesarias en la DB:

CREATE POLICY "Usuarios solo acceden a perfiles de su propia cuenta" ON core.user_profiles FOR ALL USING (account_id = public.get_my_account_id());
CREATE POLICY "Dueños pueden ver y gestionar su propia cuenta" ON core.accounts FOR ALL USING (id = public.get_my_account_id() AND owner_user_id = auth.uid());
CREATE POLICY "Acceso total para Desarrolladores" ON core.accounts FOR ALL USING (public.get_my_role() = 'DEVELOPER');