/************************************************************************************
 *                                                                                  *
 *     SCRIPT DE BASE DE DATOS v03 - REESTRUCTURADO POR TABLA Y VERBOSO             *
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
BEGIN
  action_text := TG_OP;
  IF (TG_OP = 'UPDATE') THEN
    record_id_text = NEW.id::TEXT;
    IF OLD.deleted = false AND NEW.deleted = true THEN
      action_text := 'SOFT_DELETE';
    END IF;
  ELSEIF (TG_OP = 'INSERT') THEN
    record_id_text = NEW.id::TEXT;
  ELSE
    record_id_text = OLD.id::TEXT;
  END IF;
  INSERT INTO logs.audit_log (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    action_text,
    TG_TABLE_NAME,
    record_id_text,
    CASE WHEN TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- FUNCIONES DE SEGURIDAD PARA RLS
----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role AS $$
  SELECT app_role FROM core.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_employee_of(business_id_to_check UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM core.employee_assignments
    WHERE user_id = auth.uid() AND business_id = business_id_to_check AND deleted = false
  );
$$ LANGUAGE sql SECURITY DEFINER;


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
 * PASO 2: ESTRUCTURA DE TABLAS (AGRUPADO POR TABLA)
 ******************************************************************************/

---
--- TABLA: user_profiles
---
CREATE TABLE core.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
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
CREATE INDEX idx_profiles_role ON core.user_profiles(app_role);
CREATE UNIQUE INDEX idx_unique_active_user_dni ON core.user_profiles(dni) WHERE deleted = false;
CREATE UNIQUE INDEX idx_unique_active_user_cuil ON core.user_profiles(cuil_cuit) WHERE deleted = false;
CREATE TRIGGER on_profiles_update BEFORE UPDATE ON core.user_profiles FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_profiles_changes AFTER INSERT OR UPDATE OR DELETE ON core.user_profiles FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.user_profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE core.user_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total para Desarrolladores" ON core.user_profiles FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Usuarios ven y gestionan su propio perfil (no borrados)" ON core.user_profiles FOR ALL USING (id = auth.uid() AND deleted = false) WITH CHECK (id = auth.uid());
CREATE POLICY "Admins/Owners pueden ver TODOS los perfiles (incluyendo borrados)" ON core.user_profiles FOR SELECT USING (public.get_my_role() IN ('ADMIN', 'OWNER'));

---
--- TABLA: businesses
---
CREATE TABLE core.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE TRIGGER on_businesses_update BEFORE UPDATE ON core.businesses FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_businesses_changes AFTER INSERT OR UPDATE OR DELETE ON core.businesses FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.businesses ENABLE ROW LEVEL SECURITY; ALTER TABLE core.businesses FORCE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total para Desarrolladores" ON core.businesses FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Usuarios autenticados ven negocios (no borrados)" ON core.businesses FOR SELECT USING (auth.role() = 'authenticated' AND deleted = false);
CREATE POLICY "Admins/Owners gestionan negocios" ON core.businesses FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER'));
CREATE POLICY "Auditores ven datos de negocio" ON core.businesses FOR SELECT USING (public.get_my_role() = 'AUDITOR');

---
--- TABLA: employee_assignments
---
CREATE TABLE core.employee_assignments (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, business_id)
);
CREATE INDEX idx_assignments_user ON core.employee_assignments(user_id);
CREATE INDEX idx_assignments_business ON core.employee_assignments(business_id);
CREATE TRIGGER on_employee_assignments_update BEFORE UPDATE ON core.employee_assignments FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_employee_assignments_changes AFTER INSERT OR UPDATE OR DELETE ON core.employee_assignments FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.employee_assignments ENABLE ROW LEVEL SECURITY; ALTER TABLE core.employee_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total para Desarrolladores" ON core.employee_assignments FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Admins/Owners gestionan asignaciones" ON core.employee_assignments FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER'));
CREATE POLICY "Empleados ven sus propias asignaciones" ON core.employee_assignments FOR SELECT USING (user_id = auth.uid());

---
--- TABLA: item_categories
---
CREATE TABLE core.item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  applies_to public.category_scope NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX idx_unique_active_item_category_name ON core.item_categories(name) WHERE deleted = false;
CREATE TRIGGER on_item_categories_update BEFORE UPDATE ON core.item_categories FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_item_categories_changes AFTER INSERT OR UPDATE OR DELETE ON core.item_categories FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.item_categories ENABLE ROW LEVEL SECURITY; ALTER TABLE core.item_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total para Desarrolladores" ON core.item_categories FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Cualquier usuario autenticado puede ver las categorías" ON core.item_categories FOR SELECT USING (auth.role() = 'authenticated' AND deleted = false);
CREATE POLICY "Staff puede gestionar categorías" ON core.item_categories FOR ALL USING (public.get_my_role() IN ('OWNER', 'ADMIN', 'EMPLOYEE'));

---
--- TABLA: inventory_items
---
CREATE TABLE core.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_items_name ON core.inventory_items(name);
CREATE INDEX idx_items_type ON core.inventory_items(item_type);
CREATE UNIQUE INDEX idx_unique_active_inventory_item_sku ON core.inventory_items(sku) WHERE deleted = false;
CREATE TRIGGER on_items_update BEFORE UPDATE ON core.inventory_items FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_inventory_items_changes AFTER INSERT OR UPDATE OR DELETE ON core.inventory_items FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.inventory_items ENABLE ROW LEVEL SECURITY; ALTER TABLE core.inventory_items FORCE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total para Desarrolladores" ON core.inventory_items FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Usuarios ven items de inventario (no borrados)" ON core.inventory_items FOR SELECT USING (auth.role() = 'authenticated' AND deleted = false);
CREATE POLICY "Staff gestiona items de inventario" ON core.inventory_items FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER', 'EMPLOYEE')) WITH CHECK (public.get_my_role() IN ('ADMIN', 'OWNER', 'EMPLOYEE'));
CREATE POLICY "Auditores ven datos de inventario y stock" ON core.inventory_items FOR SELECT USING (public.get_my_role() = 'AUDITOR');

---
--- TABLA: stock_levels
---
CREATE TABLE core.stock_levels (
  item_id UUID NOT NULL REFERENCES core.inventory_items(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  quantity INT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (item_id, business_id),
  CONSTRAINT quantity_must_be_non_negative CHECK (quantity >= 0)
);
CREATE TRIGGER on_stock_update BEFORE UPDATE ON core.stock_levels FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_stock_levels_changes AFTER INSERT OR UPDATE OR DELETE ON core.stock_levels FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.stock_levels ENABLE ROW LEVEL SECURITY; ALTER TABLE core.stock_levels FORCE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total para Desarrolladores" ON core.stock_levels FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Staff puede ver el stock de su negocio" ON core.stock_levels FOR SELECT USING (public.is_employee_of(business_id));
CREATE POLICY "Admins/Owners gestionan el stock" ON core.stock_levels FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER'));
CREATE POLICY "Auditores ven datos de inventario y stock" ON core.stock_levels FOR SELECT USING (public.get_my_role() = 'AUDITOR');

---
--- TABLA: appointments
---
CREATE TABLE core.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_cal_id TEXT,
  client_id UUID REFERENCES core.user_profiles(id),
  employee_id UUID REFERENCES core.user_profiles(id),
  business_id UUID REFERENCES core.businesses(id) ON DELETE RESTRICT,
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
CREATE INDEX idx_appointments_external_id ON core.appointments(external_cal_id);
CREATE UNIQUE INDEX idx_unique_active_appointment_cal_id ON core.appointments(external_cal_id) WHERE deleted = false;
CREATE INDEX idx_appointments_business_status_date ON core.appointments(business_id, status, start_time);
CREATE TRIGGER on_appointments_update BEFORE UPDATE ON core.appointments FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_appointments_changes AFTER INSERT OR UPDATE OR DELETE ON core.appointments FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.appointments ENABLE ROW LEVEL SECURITY; ALTER TABLE core.appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total para Desarrolladores" ON core.appointments FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Clientes ven sus propios turnos (no borrados)" ON core.appointments FOR SELECT USING (client_id = auth.uid() AND deleted = false);
CREATE POLICY "Empleados ven turnos de su negocio (no borrados)" ON core.appointments FOR SELECT USING (public.is_employee_of(business_id) AND deleted = false);
CREATE POLICY "Admins/Owners gestionan todos los turnos" ON core.appointments FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER'));
CREATE POLICY "Auditores ven los turnos" ON core.appointments FOR SELECT USING (public.get_my_role() = 'AUDITOR');

---
--- TABLA: orders
---
CREATE TABLE core.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_orders_client ON core.orders(client_id);
CREATE INDEX idx_orders_status ON core.orders(status);
CREATE INDEX idx_orders_business_status_date ON core.orders(business_id, status, created_at);
CREATE TRIGGER on_orders_update BEFORE UPDATE ON core.orders FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_orders_changes AFTER INSERT OR UPDATE OR DELETE ON core.orders FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.orders ENABLE ROW LEVEL SECURITY; ALTER TABLE core.orders FORCE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total para Desarrolladores" ON core.orders FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Clientes gestionan sus propias órdenes (no borradas)" ON core.orders FOR ALL USING (client_id = auth.uid() AND deleted = false) WITH CHECK (client_id = auth.uid() AND deleted = false);
CREATE POLICY "Empleados gestionan órdenes de su negocio" ON core.orders FOR ALL USING (public.is_employee_of(business_id)) WITH CHECK (public.is_employee_of(business_id));
CREATE POLICY "Admins/Owners gestionan todas las órdenes" ON core.orders FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER'));
CREATE POLICY "Auditores ven órdenes, items y facturas" ON core.orders FOR SELECT USING (public.get_my_role() = 'AUDITOR');

---
--- TABLA: order_items
---
CREATE TABLE core.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE POLICY "Acceso total para Desarrolladores" ON core.order_items FOR ALL USING (public.get_my_role() = 'DEVELOPER');
-- El acceso a order_items se hereda de la orden a la que pertenecen
CREATE POLICY "Usuarios acceden a items de órdenes que pueden ver" ON core.order_items FOR ALL USING (
  (SELECT count(*) FROM core.orders WHERE id = order_id) > 0
);
CREATE POLICY "Auditores ven órdenes, items y facturas" ON core.order_items FOR SELECT USING (public.get_my_role() = 'AUDITOR');


---
--- TABLA: invoices
---
CREATE TABLE core.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_invoices_client ON core.invoices(client_id);
CREATE INDEX idx_invoices_order ON core.invoices(order_id);
CREATE UNIQUE INDEX idx_unique_active_invoice_cae ON core.invoices(arca_cae) WHERE deleted = false;
CREATE TRIGGER on_invoices_update BEFORE UPDATE ON core.invoices FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_invoices_changes AFTER INSERT OR UPDATE OR DELETE ON core.invoices FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.invoices ENABLE ROW LEVEL SECURITY; ALTER TABLE core.invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total para Desarrolladores" ON core.invoices FOR ALL USING (public.get_my_role() = 'DEVELOPER');
-- (Políticas similares a orders, basadas en business_id y client_id)
CREATE POLICY "Clientes ven sus propias facturas (no borradas)" ON core.invoices FOR SELECT USING (client_id = auth.uid() AND deleted = false);
CREATE POLICY "Staff gestiona facturas de su negocio" ON core.invoices FOR ALL USING (public.is_employee_of(business_id)) WITH CHECK (public.is_employee_of(business_id));
CREATE POLICY "Admins/Owners gestionan todas las facturas" ON core.invoices FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER'));
CREATE POLICY "Auditores ven órdenes, items y facturas" ON core.invoices FOR SELECT USING (public.get_my_role() = 'AUDITOR');


---
--- TABLA: payments
---
CREATE TABLE core.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_payments_order_id ON core.payments(order_id);
CREATE INDEX idx_payments_mp_payment_id ON core.payments(mp_payment_id);
CREATE UNIQUE INDEX idx_unique_active_payment_mp_id ON core.payments(mp_payment_id) WHERE deleted = false;
CREATE TRIGGER on_payments_update BEFORE UPDATE ON core.payments FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_payments_changes AFTER INSERT OR UPDATE OR DELETE ON core.payments FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.payments ENABLE ROW LEVEL SECURITY; ALTER TABLE core.payments FORCE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total para Desarrolladores" ON core.payments FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Clientes pueden ver sus propios pagos" ON core.payments FOR SELECT USING ((EXISTS ( SELECT 1 FROM core.orders WHERE (core.orders.id = payments.order_id) AND (core.orders.client_id = auth.uid()))) AND (deleted = false));
CREATE POLICY "Empleados pueden ver los pagos de su negocio" ON core.payments FOR SELECT USING ((EXISTS ( SELECT 1 FROM core.orders o WHERE (o.id = payments.order_id) AND (public.is_employee_of(o.business_id)))) AND (deleted = false));
CREATE POLICY "Admins/Owners pueden gestionar todos los pagos" ON core.payments FOR ALL USING (public.get_my_role() IN ('OWNER', 'ADMIN'));
CREATE POLICY "Auditores pueden ver todos los pagos" ON core.payments FOR SELECT USING (public.get_my_role() = 'AUDITOR');


---
--- TABLA: cash_register_sessions
---
CREATE TABLE core.cash_register_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX idx_cash_sessions_business_id ON core.cash_register_sessions(business_id);
CREATE INDEX idx_cash_sessions_status ON core.cash_register_sessions(status);
CREATE TRIGGER on_cash_register_sessions_update BEFORE UPDATE ON core.cash_register_sessions FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_cash_register_sessions_changes AFTER INSERT OR UPDATE OR DELETE ON core.cash_register_sessions FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.cash_register_sessions ENABLE ROW LEVEL SECURITY; ALTER TABLE core.cash_register_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total para Desarrolladores" ON core.cash_register_sessions FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Empleados pueden gestionar las cajas de su negocio" ON core.cash_register_sessions FOR ALL USING (public.is_employee_of(business_id)) WITH CHECK (public.is_employee_of(business_id));
CREATE POLICY "Admins/Owners pueden gestionar todas las cajas" ON core.cash_register_sessions FOR ALL USING (public.get_my_role() IN ('OWNER', 'ADMIN'));
CREATE POLICY "Auditores pueden ver las sesiones de caja" ON core.cash_register_sessions FOR SELECT USING (public.get_my_role() = 'AUDITOR');

---
--- TABLA: api_logs (Schema: logs)
---
CREATE TABLE logs.api_logs (
  id BIGSERIAL PRIMARY KEY,
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
CREATE INDEX idx_apilogs_correlation ON logs.api_logs(correlation_id);
CREATE TRIGGER on_api_logs_update BEFORE UPDATE ON logs.api_logs FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_api_logs_changes AFTER INSERT OR UPDATE OR DELETE ON logs.api_logs FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE logs.api_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE logs.api_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total para Desarrolladores" ON logs.api_logs FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Admins/Owners/Auditores ven los api logs" ON logs.api_logs FOR SELECT USING (public.get_my_role() IN ('ADMIN', 'OWNER', 'AUDITOR'));

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
CREATE TRIGGER on_audit_log_update BEFORE UPDATE ON logs.audit_log FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
-- No creamos un trigger de auditoría para la tabla de auditoría para evitar bucles infinitos.
ALTER TABLE logs.audit_log ENABLE ROW LEVEL SECURITY; ALTER TABLE logs.audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total para Desarrolladores" ON logs.audit_log FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Admins/Owners/Auditores ven el audit log" ON logs.audit_log FOR SELECT USING (public.get_my_role() IN ('ADMIN', 'OWNER', 'AUDITOR'));


/******************************************************************************
 * PASO 3: PRECARGA DE DATOS
 ******************************************************************************/

INSERT INTO core.item_categories (name, description, applies_to, deleted)
VALUES
  ('Fragancias', 'Perfumes, colonias y aguas de tocador.', 'PERFUMERY', false),
  ('Cuidado de la Piel', 'Cremas faciales, serums, limpiadores y mascarillas.', 'PERFUMERY', false),
  ('Maquillaje', 'Bases, labiales, sombras, máscaras de pestañas.', 'PERFUMERY', false),
  ('Cuidado Corporal', 'Cremas corporales, exfoliantes y aceites.', 'PERFUMERY', false),
  ('Shampoos y Acondicionadores', 'Productos para el lavado y cuidado diario del cabello.', 'SALON', false),
  ('Tratamientos Capilares', 'Mascarillas intensivas, ampollas y tratamientos de reconstrucción.', 'SALON', false),
  ('Fijación y Estilizado', 'Geles, ceras, espumas, lacas y protectores térmicos.', 'SALON', false),
  ('Coloración', 'Tinturas permanentes, semi-permanentes y tonalizadores.', 'SALON', false),
  ('Herramientas de Estilizado', 'Secadores, planchas, rizadores y cepillos.', 'SALON', false),
  ('Cuidado Capilar', 'Productos generales para el cabello que se venden en ambos negocios.', 'ALL', false),
  ('Accesorios', 'Brochas, peines, hebillas y otros complementos.', 'ALL', false),
  ('Kits y Promociones', 'Conjuntos de productos ofrecidos como un paquete.', 'ALL', false);


/******************************************************************************
 * PASO 4: VISTAS DE REPORTES (Schema: reports)
 ******************************************************************************/

CREATE OR REPLACE VIEW reports.daily_sales_summary AS
SELECT DATE(o.created_at) AS report_date, b.id AS business_id, b.name AS business_name, SUM(o.total_amount) AS total_sales, COUNT(o.id) AS order_count, AVG(o.total_amount) AS average_order_value
FROM core.orders AS o JOIN core.businesses AS b ON o.business_id = b.id
WHERE o.status = 'PAID' AND o.deleted = false AND b.deleted = false
GROUP BY report_date, b.id, b.name;

CREATE OR REPLACE VIEW reports.product_performance AS
SELECT ii.id AS item_id, ii.name AS item_name, ii.item_type, o.business_id, b.name AS business_name, SUM(oi.quantity) AS total_quantity_sold, SUM(oi.quantity * oi.unit_price) AS total_revenue
FROM core.order_items AS oi
JOIN core.inventory_items AS ii ON oi.item_id = ii.id
JOIN core.orders AS o ON oi.order_id = o.id
JOIN core.businesses AS b ON o.business_id = b.id
WHERE o.status = 'PAID' AND oi.deleted = false AND ii.deleted = false AND o.deleted = false AND b.deleted = false
GROUP BY ii.id, o.business_id, b.name;

CREATE OR REPLACE VIEW reports.current_inventory_levels AS
SELECT sl.item_id, ii.name AS item_name, ii.sku, sl.business_id, b.name AS business_name, sl.quantity AS current_quantity
FROM core.stock_levels AS sl
JOIN core.inventory_items AS ii ON sl.item_id = ii.id
JOIN core.businesses AS b ON sl.business_id = b.id
WHERE sl.deleted = false AND ii.deleted = false AND b.deleted = false;

CREATE OR REPLACE VIEW reports.customer_activity AS
SELECT o.client_id, up.full_name AS client_name, up.email AS client_email, SUM(o.total_amount) AS total_spent, COUNT(o.id) AS order_count, MIN(o.created_at) AS first_order_date, MAX(o.created_at) AS last_order_date
FROM core.orders AS o
JOIN core.user_profiles AS up ON o.client_id = up.id
WHERE o.status = 'PAID' AND o.deleted = false AND up.deleted = false
GROUP BY o.client_id, up.full_name, up.email;

CREATE OR REPLACE VIEW reports.employee_service_performance AS
SELECT a.employee_id, up.full_name AS employee_name, a.business_id, b.name AS business_name, COUNT(a.id) AS completed_services, SUM(ii.selling_price) AS total_revenue_from_services
FROM core.appointments AS a
JOIN core.inventory_items AS ii ON a.service_id = ii.id
JOIN core.user_profiles AS up ON a.employee_id = up.id
JOIN core.businesses AS b ON a.business_id = b.id
WHERE a.status = 'COMPLETED' AND a.deleted = false AND ii.deleted = false AND up.deleted = false AND b.deleted = false
GROUP BY a.employee_id, up.full_name, a.business_id, b.name;

CREATE OR REPLACE VIEW reports.consolidated_business_snapshot AS
SELECT
  (SELECT SUM(total_amount) FROM core.orders WHERE status = 'PAID' AND deleted = false) AS total_revenue,
  (SELECT COUNT(id) FROM core.orders WHERE status = 'PAID' AND deleted = false) AS total_orders,
  (SELECT COUNT(DISTINCT client_id) FROM core.orders WHERE status = 'PAID' AND deleted = false) AS total_active_customers,
  (SELECT SUM(quantity) FROM core.order_items WHERE deleted = false) AS total_items_sold,
  (SELECT COUNT(id) FROM core.appointments WHERE status = 'COMPLETED' AND deleted = false) AS total_completed_appointments;

COMMIT;