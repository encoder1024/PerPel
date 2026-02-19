/************************************************************************************
 *                                                                                  *
 *    SCRIPT DE CREACIÓN DE BASE DE DATOS FINAL, UNIFICADO Y CON BORRADO LÓGICO     *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

/******************************************************************************
 * PASO 1: FUNCIONES AUXILIARES Y DE AUDITORÍA
 ******************************************************************************/

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función de auditoría mejorada para soportar SOFT_DELETE
CREATE OR REPLACE FUNCTION public.log_changes()
RETURNS TRIGGER AS $$
DECLARE
  record_id_text TEXT;
  action_text TEXT;
BEGIN
  action_text := TG_OP;
  IF (TG_OP = 'UPDATE') THEN
    record_id_text = NEW.id::TEXT;
    -- Si el campo 'deleted' cambia de false a true, lo registramos como SOFT_DELETE
    IF OLD.deleted = false AND NEW.deleted = true THEN
      action_text := 'SOFT_DELETE';
    END IF;
  ELSEIF (TG_OP = 'INSERT') THEN
    record_id_text = NEW.id::TEXT;
  ELSE -- DELETE (hard delete)
    record_id_text = OLD.id::TEXT;
  END IF;

  INSERT INTO public.audit_log (user_id, action, table_name, record_id, old_data, new_data)
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


/******************************************************************************
 * PASO 2: TIPOS PERSONALIZADOS (ENUMS)
 ******************************************************************************/

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
 * PASO 3: DEFINICIÓN DE TABLAS
 ******************************************************************************/

CREATE TABLE public.user_profiles (
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
  dni TEXT UNIQUE,
  cuil_cuit TEXT UNIQUE,
  category public.user_category,
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT name_length CHECK (char_length(full_name) > 0)
);

CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
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
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT name_not_empty CHECK (char_length(name) > 0)
);

CREATE TABLE public.employee_assignments (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  deleted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, business_id)
);

CREATE TABLE public.item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  applies_to public.category_scope NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  category_id UUID REFERENCES public.item_categories(id) ON DELETE SET NULL,
  item_type public.item_type NOT NULL,
  item_status public.item_status NOT NULL,
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  duration_minutes INT,
  cost_price NUMERIC(10, 2) DEFAULT 0,
  selling_price NUMERIC(10, 2) NOT NULL,
  is_for_sale BOOLEAN DEFAULT true,
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT selling_price_must_be_positive CHECK (selling_price > 0),
  CONSTRAINT cost_price_must_be_positive CHECK (cost_price >= 0),
  CONSTRAINT name_not_empty CHECK (char_length(name) > 0)
);

CREATE TABLE public.stock_levels (
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  quantity INT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (item_id, business_id),
  CONSTRAINT quantity_must_be_non_negative CHECK (quantity >= 0)
);

CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  external_cal_id TEXT UNIQUE NOT NULL,
  client_id UUID REFERENCES public.user_profiles(id),
  employee_id UUID REFERENCES public.user_profiles(id),
  business_id UUID REFERENCES public.businesses(id),
  service_id UUID REFERENCES public.inventory_items(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  event_type_id INTEGER,
  service_notes TEXT,
  cancel_reason TEXT,
  status public.appointment_status NOT NULL DEFAULT 'PENDING',
  deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  client_id UUID NOT NULL REFERENCES auth.users(id),
  business_id UUID NOT NULL REFERENCES public.businesses(id),
  total_amount NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'ARS',  
  status public.order_status NOT NULL DEFAULT 'PENDING',
  -- Dato de mercadopago
  mercadopago_preference_id TEXT,
  -- Datos para AFIP (Requeridos para el CAE)
  customer_doc_type TEXT DEFAULT '99',
  customer_doc_number TEXT DEFAULT '0',
  customer_name TEXT DEFAULT 'Consumidor Final',
  iva_condition TEXT DEFAULT 'Consumidor Final',
  deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id),
  quantity INT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT quantity_must_be_positive CHECK (quantity > 0)
);

CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  order_id UUID UNIQUE REFERENCES public.orders(id),
  client_id UUID NOT NULL REFERENCES auth.users(id),
  business_id UUID NOT NULL REFERENCES public.businesses(id),
  total_amount NUMERIC(19, 4) NOT NULL,
  arca_cae TEXT UNIQUE, -- Código de Autorización Electrónico
  arca_status public.arca_status,
  cae_vencimiento DATE,
  cbte_tipo public.cbte_tipo, -- 1=Factura A, 6=Factura B, 11=Factura C
  punto_venta INTEGER,
  cbte_nro INTEGER,
  qr_link TEXT, -- URL generada (JSON Base64 de AFIP)
  full_pdf_url TEXT, -- Almacenamiento del PDF generado
  
  -- Control de impresión física en el negocio
  is_printed BOOLEAN DEFAULT false,
  printed_at TIMESTAMPTZ,
  printer_id TEXT,

    -- Específico para Servicios (Peluquería) no se utilizan en facturación de productos
  fch_serv_desde DATE DEFAULT CURRENT_DATE,
  fch_serv_hasta DATE DEFAULT CURRENT_DATE,
  fch_serv_vto_pago DATE DEFAULT CURRENT_DATE,
  deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  mp_payment_id TEXT UNIQUE,
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

CREATE TABLE public.cash_register_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
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

CREATE TABLE public.api_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  api_name public.external_api_name NOT NULL,
  endpoint TEXT,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  operation_name TEXT NOT NULL,
  correlation_id TEXT,
  request_payload JSONB,
  response_payload JSONB,
  status TEXT NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE public.offline_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  operation TEXT NOT NULL,
  payload JSONB NOT NULL,
  status public.sync_status NOT NULL DEFAULT 'PENDING',
  attempts INT DEFAULT 0,
  deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  deleted BOOLEAN NOT NULL DEFAULT false
);


/******************************************************************************
 * PASO 4: PRECARGA DE DATOS (EJ: CATEGORÍAS)
 ******************************************************************************/

INSERT INTO public.item_categories (name, description, applies_to)
VALUES
  ('Fragancias', 'Perfumes, colonias y aguas de tocador.', 'PERFUMERY'),
  ('Cuidado de la Piel', 'Cremas faciales, serums, limpiadores y mascarillas.', 'PERFUMERY'),
  ('Maquillaje', 'Bases, labiales, sombras, máscaras de pestañas.', 'PERFUMERY'),
  ('Cuidado Corporal', 'Cremas corporales, exfoliantes y aceites.', 'PERFUMERY'),
  ('Shampoos y Acondicionadores', 'Productos para el lavado y cuidado diario del cabello.', 'SALON'),
  ('Tratamientos Capilares', 'Mascarillas intensivas, ampollas y tratamientos de reconstrucción.', 'SALON'),
  ('Fijación y Estilizado', 'Geles, ceras, espumas, lacas y protectores térmicos.', 'SALON'),
  ('Coloración', 'Tinturas permanentes, semi-permanentes y tonalizadores.', 'SALON'),
  ('Herramientas de Estilizado', 'Secadores, planchas, rizadores y cepillos.', 'SALON'),
  ('Cuidado Capilar', 'Productos generales para el cabello que se venden en ambos negocios.', 'ALL'),
  ('Accesorios', 'Brochas, peines, hebillas y otros complementos.', 'ALL'),
  ('Kits y Promociones', 'Conjuntos de productos ofrecidos como un paquete.', 'ALL');


/******************************************************************************
 * PASO 5: ÍNDICES
 ******************************************************************************/

CREATE INDEX idx_profiles_role ON public.user_profiles(app_role);
CREATE INDEX idx_assignments_user ON public.employee_assignments(user_id);
CREATE INDEX idx_assignments_business ON public.employee_assignments(business_id);
CREATE INDEX idx_items_name ON public.inventory_items(name);
CREATE INDEX idx_items_type ON public.inventory_items(item_type);
CREATE INDEX idx_appointments_external_id ON public.appointments(external_cal_id);
CREATE INDEX idx_orders_client ON public.orders(client_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_invoices_client ON public.invoices(client_id);
CREATE INDEX idx_invoices_order ON public.invoices(order_id);
CREATE INDEX idx_apilogs_correlation ON public.api_logs(correlation_id);
CREATE INDEX idx_payments_order_id ON public.payments(order_id);
CREATE INDEX idx_payments_mp_payment_id ON public.payments(mp_payment_id);
CREATE INDEX idx_cash_sessions_business_id ON public.cash_register_sessions(business_id);
CREATE INDEX idx_cash_sessions_status ON public.cash_register_sessions(status);


/******************************************************************************
 * PASO 6: TRIGGERS
 ******************************************************************************/

CREATE TRIGGER on_profiles_update BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_businesses_update BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_items_update BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_stock_update BEFORE UPDATE ON public.stock_levels FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_appointments_update BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_orders_update BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_item_categories_update BEFORE UPDATE ON public.item_categories FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_payments_update BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_cash_register_sessions_update BEFORE UPDATE ON public.cash_register_sessions FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER audit_profiles_changes AFTER INSERT OR UPDATE OR DELETE ON public.user_profiles FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_businesses_changes AFTER INSERT OR UPDATE OR DELETE ON public.businesses FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_employee_assignments_changes AFTER INSERT OR UPDATE OR DELETE ON public.employee_assignments FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_inventory_items_changes AFTER INSERT OR UPDATE OR DELETE ON public.inventory_items FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_stock_levels_changes AFTER INSERT OR UPDATE OR DELETE ON public.stock_levels FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_appointments_changes AFTER INSERT OR UPDATE OR DELETE ON public.appointments FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_orders_changes AFTER INSERT OR UPDATE OR DELETE ON public.orders FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_invoices_changes AFTER INSERT OR UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_item_categories_changes AFTER INSERT OR UPDATE OR DELETE ON public.item_categories FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_payments_changes AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_cash_register_sessions_changes AFTER INSERT OR UPDATE OR DELETE ON public.cash_register_sessions FOR EACH ROW EXECUTE PROCEDURE public.log_changes();


/******************************************************************************
 * PASO 7: FUNCIONES DE SEGURIDAD PARA RLS
 ******************************************************************************/

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role AS $$
  SELECT app_role FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_employee_of(business_id_to_check UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employee_assignments
    WHERE user_id = auth.uid() AND business_id = business_id_to_check
  );
$$ LANGUAGE sql SECURITY DEFINER;


/******************************************************************************
 * PASO 8: APLICACIÓN DE POLÍTICAS DE SEGURIDAD (ROW LEVEL SECURITY)
 ******************************************************************************/

-- Habilitar RLS para todas las tablas
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY; ALTER TABLE public.businesses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employee_assignments ENABLE ROW LEVEL SECURITY; ALTER TABLE public.employee_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY; ALTER TABLE public.item_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY; ALTER TABLE public.inventory_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY; ALTER TABLE public.stock_levels FORCE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY; ALTER TABLE public.appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY; ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY; ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY; ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY; ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cash_register_sessions ENABLE ROW LEVEL SECURITY; ALTER TABLE public.cash_register_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE public.api_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.offline_sync_queue ENABLE ROW LEVEL SECURITY; ALTER TABLE public.offline_sync_queue FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY; ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;


--- Políticas para el borrado lógico (Soft Delete) y roles de alta jerarquía
--- El rol DEVELOPER tiene acceso total e irrestricto a todos los datos, incluyendo borrados.
CREATE POLICY "Acceso total para Desarrolladores" ON public.user_profiles FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.businesses FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.employee_assignments FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.item_categories FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.inventory_items FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.stock_levels FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.appointments FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.orders FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.order_items FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.invoices FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.payments FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.cash_register_sessions FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.api_logs FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.offline_sync_queue FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.audit_log FOR ALL USING (public.get_my_role() = 'DEVELOPER');

--- Políticas para roles de negocio (CLIENT, EMPLOYEE, OWNER, ADMIN)
--- Nota: Estas políticas se combinan con las de arriba. Un ADMIN no podrá ver registros borrados a menos que se cree una política específica para ello.

CREATE POLICY "Usuarios ven y gestionan su propio perfil (no borrados)" ON public.user_profiles FOR ALL USING (id = auth.uid() AND deleted = false) WITH CHECK (id = auth.uid());
CREATE POLICY "Admins/Owners pueden ver perfiles (no borrados)" ON public.user_profiles FOR SELECT USING (public.get_my_role() IN ('ADMIN', 'OWNER') AND deleted = false);
CREATE POLICY "Admins/Owners pueden ver TODOS los perfiles (incluyendo borrados)" ON public.user_profiles FOR SELECT USING (public.get_my_role() IN ('ADMIN', 'OWNER'));


CREATE POLICY "Usuarios autenticados ven negocios (no borrados)" ON public.businesses FOR SELECT USING (auth.role() = 'authenticated' AND deleted = false);
CREATE POLICY "Admins/Owners gestionan negocios" ON public.businesses FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER'));


CREATE POLICY "Usuarios ven items de inventario (no borrados)" ON public.inventory_items FOR SELECT USING (auth.role() = 'authenticated' AND deleted = false);
CREATE POLICY "Staff gestiona items de inventario" ON public.inventory_items FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER', 'EMPLOYEE'));


CREATE POLICY "Clientes ven sus propios turnos (no borrados)" ON public.appointments FOR SELECT USING (client_id = auth.uid() AND deleted = false);
CREATE POLICY "Empleados ven turnos de su negocio (no borrados)" ON public.appointments FOR SELECT USING (public.is_employee_of(business_id) AND deleted = false);
CREATE POLICY "Admins/Owners gestionan todos los turnos" ON public.appointments FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER'));

CREATE POLICY "Clientes gestionan sus propias órdenes (no borradas)" ON public.orders FOR ALL USING (client_id = auth.uid() AND deleted = false) WITH CHECK (client_id = auth.uid() AND deleted = false);
CREATE POLICY "Empleados ven órdenes de su negocio (no borradas)" ON public.orders FOR SELECT USING (public.is_employee_of(business_id) AND deleted = false);
CREATE POLICY "Admins/Owners gestionan todas las órdenes" ON public.orders FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER'));


--- Políticas para roles de solo lectura (AUDITOR)
CREATE POLICY "Auditores ven datos de negocio" ON public.businesses FOR SELECT USING (public.get_my_role() = 'AUDITOR');
CREATE POLICY "Auditores ven datos de inventario y stock" ON public.inventory_items FOR SELECT USING (public.get_my_role() = 'AUDITOR');
CREATE POLICY "Auditores ven datos de inventario y stock" ON public.stock_levels FOR SELECT USING (public.get_my_role() = 'AUDITOR');
CREATE POLICY "Auditores ven órdenes, items y facturas" ON public.orders FOR SELECT USING (public.get_my_role() = 'AUDITOR');
CREATE POLICY "Auditores ven órdenes, items y facturas" ON public.order_items FOR SELECT USING (public.get_my_role() = 'AUDITOR');
CREATE POLICY "Auditores ven órdenes, items y facturas" ON public.invoices FOR SELECT USING (public.get_my_role() = 'AUDITOR');
CREATE POLICY "Auditores ven los turnos" ON public.appointments FOR SELECT USING (public.get_my_role() = 'AUDITOR');
CREATE POLICY "Auditores ven los pagos" ON public.payments FOR SELECT USING (public.get_my_role() = 'AUDITOR');
CREATE POLICY "Auditores ven las sesiones de caja" ON public.cash_register_sessions FOR SELECT USING (public.get_my_role() = 'AUDITOR');


--- Políticas para tablas de LOGS
CREATE POLICY "Admins/Owners/Auditores ven el audit log" ON public.audit_log FOR SELECT USING (public.get_my_role() IN ('ADMIN', 'OWNER', 'AUDITOR'));
CREATE POLICY "Admins/Owners/Auditores ven los api logs" ON public.api_logs FOR SELECT USING (public.get_my_role() IN ('ADMIN', 'OWNER', 'AUDITOR'));
CREATE POLICY "Admins/Owners ven la cola de sincronización" ON public.offline_sync_queue FOR SELECT USING (public.get_my_role() IN ('ADMIN', 'OWNER'));

--SQL para la Creación de Vistas de Reportes

-- VISTA 1: Resumen Diario de Ventas
-- Muestra el rendimiento de ventas por día y por negocio.
CREATE OR REPLACE VIEW public.daily_sales_summary AS
SELECT
  DATE(o.created_at) AS report_date,
  b.id AS business_id,
  b.name AS business_name,
  SUM(o.total_amount) AS total_sales,
  COUNT(o.id) AS order_count,
  AVG(o.total_amount) AS average_order_value
FROM
  public.orders AS o
  JOIN public.businesses AS b ON o.business_id = b.id
WHERE
  o.status = 'PAID' AND o.deleted = false AND b.deleted = false
GROUP BY
  report_date,
  b.id,
  b.name;
-- VISTA 2: Rendimiento de Productos y Servicios
-- Analiza qué ítems (productos o servicios) son los más vendidos.
CREATE OR REPLACE VIEW public.product_performance AS
SELECT
  ii.id AS item_id,
  ii.name AS item_name,
  ii.item_type,
  o.business_id,
  b.name AS business_name,
  SUM(oi.quantity) AS total_quantity_sold,
  SUM(oi.quantity * oi.unit_price) AS total_revenue
FROM
  public.order_items AS oi
  JOIN public.inventory_items AS ii ON oi.item_id = ii.id
  JOIN public.orders AS o ON oi.order_id = o.id
  JOIN public.businesses AS b ON o.business_id = b.id
WHERE
  o.status = 'PAID' AND oi.deleted = false AND ii.deleted = false AND o.deleted = false AND b.deleted = false
GROUP BY
  ii.id,
  o.business_id,
  b.name;
-- VISTA 3: Niveles de Inventario Actual
-- Provee una vista rápida del stock actual para cada producto en cada negocio.
CREATE OR REPLACE VIEW public.current_inventory_levels AS
SELECT
  sl.item_id,
  ii.name AS item_name,
  ii.sku,
  sl.business_id,
  b.name AS business_name,
  sl.quantity AS current_quantity
FROM
  public.stock_levels AS sl
  JOIN public.inventory_items AS ii ON sl.item_id = ii.id
  JOIN public.businesses AS b ON sl.business_id = b.id
WHERE
  sl.deleted = false AND ii.deleted = false AND b.deleted = false;
-- VISTA 4: Actividad y Valor de Clientes
-- Permite identificar a los clientes más valiosos por gasto y frecuencia.
CREATE OR REPLACE VIEW public.customer_activity AS
SELECT
  o.client_id,
  up.full_name AS client_name,
  up.email AS client_email,
  SUM(o.total_amount) AS total_spent,
  COUNT(o.id) AS order_count,
  MIN(o.created_at) AS first_order_date,
  MAX(o.created_at) AS last_order_date
FROM
  public.orders AS o
  JOIN public.user_profiles AS up ON o.client_id = up.id
WHERE
  o.status = 'PAID' AND o.deleted = false AND up.deleted = false
GROUP BY
  o.client_id,
  up.full_name,
  up.email;


-- VISTA 5: Rendimiento de Empleados por Servicios
-- Mide los servicios completados y los ingresos generados por cada empleado.
CREATE OR REPLACE VIEW public.employee_service_performance AS
SELECT
  a.employee_id,
  up.full_name AS employee_name,
  a.business_id,
  b.name AS business_name,
  COUNT(a.id) AS completed_services,
  SUM(ii.selling_price) AS total_revenue_from_services
FROM
  public.appointments AS a
  JOIN public.inventory_items AS ii ON a.service_id = ii.id
  JOIN public.user_profiles AS up ON a.employee_id = up.id
    JOIN public.businesses AS b ON a.business_id = b.id
  WHERE
    a.status = 'COMPLETED' AND a.deleted = false AND ii.deleted = false AND up.deleted = false AND b.deleted = false
  GROUP BY
    a.employee_id,
    up.full_name,
    a.business_id,
    b.name;


-- VISTA 6: Vista Consolidada General ("Fuente de Verdad")
-- Ofrece una única fila con los KPIs totales de todos los negocios.
CREATE OR REPLACE VIEW public.consolidated_business_snapshot AS
SELECT
  (SELECT SUM(total_amount) FROM public.orders WHERE status = 'PAID' AND deleted = false) AS total_revenue,
  (SELECT COUNT(id) FROM public.orders WHERE status = 'PAID' AND deleted = false) AS total_orders,
  (SELECT COUNT(DISTINCT client_id) FROM public.orders WHERE status = 'PAID' AND deleted = false) AS total_active_customers,
  (SELECT SUM(quantity) FROM public.order_items WHERE deleted = false) AS total_items_sold,
  (SELECT COUNT(id) FROM public.appointments WHERE status = 'COMPLETED' AND deleted = false) AS total_completed_appointments;


COMMIT;