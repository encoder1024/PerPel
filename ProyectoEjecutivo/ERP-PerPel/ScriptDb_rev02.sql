/************************************************************************************
 *                                                                                  *
 *   SCRIPT DE BASE DE DATOS v02 - APLICANDO 10 MEJORAS DE DISEÑO AVANZADO         *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

/******************************************************************************
 * PASO 0: CREACIÓN DE SCHEMAS (Mejora 5)
 ******************************************************************************/
-- Mejora 5: Se crean esquemas para organizar las tablas lógicamente, mejorando
-- el mantenimiento y la gestión de permisos.
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS logs;
CREATE SCHEMA IF NOT EXISTS reports;


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

-- Función de auditoría mejorada para soportar SOFT_DELETE y SCHEMAS
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

  -- Apunta al esquema 'logs' para la tabla de auditoría
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


/******************************************************************************
 * PASO 2: TIPOS PERSONALIZADOS (ENUMS) - Se mantienen en 'public'
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
 * PASO 3: DEFINICIÓN DE TABLAS - Movidas al schema 'core' y 'logs'
 ******************************************************************************/

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
  deleted BOOLEAN NOT NULL DEFAULT false,
  -- Mejora 7: Se añade un CHECK constraint simple como ejemplo.
  CONSTRAINT name_length CHECK (char_length(full_name) > 0)
);

CREATE TABLE core.businesses (
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

CREATE TABLE core.employee_assignments (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT, -- Mejora 6: ON DELETE RESTRICT para seguridad
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Mejora 10: Se convierte created_by en una verdadera Foreign Key
  created_by UUID REFERENCES auth.users(id),
  deleted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, business_id)
);

CREATE TABLE core.item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  description TEXT,
  applies_to public.category_scope NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE core.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
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
  -- Mejora 9: Columna JSONB para atributos flexibles
  attributes JSONB,
  deleted BOOLEAN NOT NULL DEFAULT false,
  -- Mejora 7: Más CHECK constraints para integridad de datos
  CONSTRAINT selling_price_must_be_positive CHECK (selling_price > 0),
  CONSTRAINT cost_price_must_be_positive CHECK (cost_price >= 0),
  CONSTRAINT selling_price_vs_cost_check CHECK (selling_price >= cost_price),
  CONSTRAINT name_not_empty CHECK (char_length(name) > 0)
);

CREATE TABLE core.stock_levels (
  item_id UUID NOT NULL REFERENCES core.inventory_items(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT, -- Mejora 6
  quantity INT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (item_id, business_id),
  CONSTRAINT quantity_must_be_non_negative CHECK (quantity >= 0)
);

CREATE TABLE core.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  external_cal_id TEXT,
  client_id UUID REFERENCES core.user_profiles(id),
  employee_id UUID REFERENCES core.user_profiles(id),
  business_id UUID REFERENCES core.businesses(id) ON DELETE RESTRICT, -- Mejora 6
  service_id UUID REFERENCES core.inventory_items(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  event_type_id INTEGER,
  service_notes TEXT,
  cancel_reason TEXT,
  status public.appointment_status NOT NULL DEFAULT 'PENDING',
  deleted BOOLEAN NOT NULL DEFAULT false,
  -- Mejora 7: Asegurar que el tiempo de fin sea posterior al de inicio
  CONSTRAINT time_check CHECK (end_time > start_time)
);

CREATE TABLE core.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  client_id UUID NOT NULL REFERENCES auth.users(id),
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT, -- Mejora 6
  total_amount NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'ARS',  
  status public.order_status NOT NULL DEFAULT 'PENDING',
  mercadopago_preference_id TEXT,
  customer_doc_type TEXT DEFAULT '99',
  customer_doc_number TEXT DEFAULT '0',
  customer_name TEXT DEFAULT 'Consumidor Final',
  iva_condition TEXT DEFAULT 'Consumidor Final',
  deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE core.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES core.orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES core.inventory_items(id) ON DELETE RESTRICT, -- Mejora 6
  quantity INT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT quantity_must_be_positive CHECK (quantity > 0)
);

CREATE TABLE core.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
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
  deleted BOOLEAN NOT NULL DEFAULT false
);

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

-- Tablas de logs movidas al schema 'logs'
CREATE TABLE logs.api_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  api_name public.external_api_name NOT NULL,
  endpoint TEXT,
  order_id UUID REFERENCES core.orders(id) ON DELETE SET NULL,
  operation_name TEXT NOT NULL,
  correlation_id TEXT,
  request_payload JSONB,
  response_payload JSONB,
  status TEXT NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE logs.audit_log (
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

-- Mejora 8: Se incluye una tabla de ejemplo para archivado de datos.
-- En una implementación real, se crearía una función para mover datos aquí periódicamente.
CREATE TABLE logs.orders_archive (
  LIKE core.orders INCLUDING ALL
);


/******************************************************************************
 * PASO 4: PRECARGA DE DATOS
 ******************************************************************************/

INSERT INTO core.item_categories (name, description, applies_to)
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
 * PASO 5: ÍNDICES (Básicos, Compuestos y Únicos Parciales)
 ******************************************************************************/

-- Índices básicos
CREATE INDEX idx_profiles_role ON core.user_profiles(app_role);
CREATE INDEX idx_assignments_user ON core.employee_assignments(user_id);
CREATE INDEX idx_assignments_business ON core.employee_assignments(business_id);
CREATE INDEX idx_items_name ON core.inventory_items(name);
CREATE INDEX idx_items_type ON core.inventory_items(item_type);
CREATE INDEX idx_appointments_external_id ON core.appointments(external_cal_id);
CREATE INDEX idx_invoices_client ON core.invoices(client_id);
CREATE INDEX idx_apilogs_correlation ON logs.api_logs(correlation_id);
CREATE INDEX idx_payments_order_id ON core.payments(order_id);
CREATE INDEX idx_cash_sessions_business_id ON core.cash_register_sessions(business_id);

-- Mejora 1: Índices Únicos Parciales para soft-delete
CREATE UNIQUE INDEX idx_unique_active_user_dni ON core.user_profiles(dni) WHERE deleted = false;
CREATE UNIQUE INDEX idx_unique_active_user_cuil ON core.user_profiles(cuil_cuit) WHERE deleted = false;
CREATE UNIQUE INDEX idx_unique_active_item_category_name ON core.item_categories(name) WHERE deleted = false;
CREATE UNIQUE INDEX idx_unique_active_inventory_item_sku ON core.inventory_items(sku) WHERE deleted = false;
CREATE UNIQUE INDEX idx_unique_active_invoice_cae ON core.invoices(arca_cae) WHERE deleted = false;
CREATE UNIQUE INDEX idx_unique_active_payment_mp_id ON core.payments(mp_payment_id) WHERE deleted = false;
CREATE UNIQUE INDEX idx_unique_active_appointment_cal_id ON core.appointments(external_cal_id) WHERE deleted = false;

-- Mejora 2: Índices Compuestos para optimizar queries
CREATE INDEX idx_orders_business_status_date ON core.orders(business_id, status, created_at);
CREATE INDEX idx_appointments_business_status_date ON core.appointments(business_id, status, start_time);


/******************************************************************************
 * PASO 6: TRIGGERS (Actualizados a los nuevos schemas)
 ******************************************************************************/

CREATE TRIGGER on_profiles_update BEFORE UPDATE ON core.user_profiles FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_businesses_update BEFORE UPDATE ON core.businesses FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_items_update BEFORE UPDATE ON core.inventory_items FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_stock_update BEFORE UPDATE ON core.stock_levels FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_appointments_update BEFORE UPDATE ON core.appointments FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_orders_update BEFORE UPDATE ON core.orders FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_item_categories_update BEFORE UPDATE ON core.item_categories FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_payments_update BEFORE UPDATE ON core.payments FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_cash_register_sessions_update BEFORE UPDATE ON core.cash_register_sessions FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER audit_all_changes AFTER INSERT OR UPDATE OR DELETE ON core.user_profiles FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_all_changes AFTER INSERT OR UPDATE OR DELETE ON core.businesses FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_all_changes AFTER INSERT OR UPDATE OR DELETE ON core.employee_assignments FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_all_changes AFTER INSERT OR UPDATE OR DELETE ON core.inventory_items FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_all_changes AFTER INSERT OR UPDATE OR DELETE ON core.stock_levels FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_all_changes AFTER INSERT OR UPDATE OR DELETE ON core.appointments FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_all_changes AFTER INSERT OR UPDATE OR DELETE ON core.orders FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_all_changes AFTER INSERT OR UPDATE OR DELETE ON core.invoices FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_all_changes AFTER INSERT OR UPDATE OR DELETE ON core.item_categories FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_all_changes AFTER INSERT OR UPDATE OR DELETE ON core.payments FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_all_changes AFTER INSERT OR UPDATE OR DELETE ON core.cash_register_sessions FOR EACH ROW EXECUTE PROCEDURE public.log_changes();


/******************************************************************************
 * PASO 7: FUNCIONES DE SEGURIDAD PARA RLS (Se mantienen en 'public')
 ******************************************************************************/

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role AS $$
  SELECT app_role FROM core.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_employee_of(business_id_to_check UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM core.employee_assignments
    WHERE user_id = auth.uid() AND business_id = business_id_to_check
  );
$$ LANGUAGE sql SECURITY DEFINER;


/******************************************************************************
 * PASO 8: APLICACIÓN DE POLÍTICAS DE SEGURIDAD (ROW LEVEL SECURITY)
 ******************************************************************************/

-- Habilitar RLS para todas las tablas
ALTER TABLE core.user_profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE core.user_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE core.businesses ENABLE ROW LEVEL SECURITY; ALTER TABLE core.businesses FORCE ROW LEVEL SECURITY;
ALTER TABLE core.employee_assignments ENABLE ROW LEVEL SECURITY; ALTER TABLE core.employee_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE core.item_categories ENABLE ROW LEVEL SECURITY; ALTER TABLE core.item_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE core.inventory_items ENABLE ROW LEVEL SECURITY; ALTER TABLE core.inventory_items FORCE ROW LEVEL SECURITY;
ALTER TABLE core.stock_levels ENABLE ROW LEVEL SECURITY; ALTER TABLE core.stock_levels FORCE ROW LEVEL SECURITY;
ALTER TABLE core.appointments ENABLE ROW LEVEL SECURITY; ALTER TABLE core.appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE core.orders ENABLE ROW LEVEL SECURITY; ALTER TABLE core.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE core.order_items ENABLE ROW LEVEL SECURITY; ALTER TABLE core.order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE core.invoices ENABLE ROW LEVEL SECURITY; ALTER TABLE core.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE core.payments ENABLE ROW LEVEL SECURITY; ALTER TABLE core.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE core.cash_register_sessions ENABLE ROW LEVEL SECURITY; ALTER TABLE core.cash_register_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE logs.api_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE logs.api_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE core.offline_sync_queue ENABLE ROW LEVEL SECURITY; ALTER TABLE core.offline_sync_queue FORCE ROW LEVEL SECURITY;
ALTER TABLE logs.audit_log ENABLE ROW LEVEL SECURITY; ALTER TABLE logs.audit_log FORCE ROW LEVEL SECURITY;

-- Políticas para el rol DEVELOPER (acceso total)
CREATE POLICY "Acceso total para Desarrolladores" ON core.user_profiles FOR ALL USING (public.get_my_role() = 'DEVELOPER');
-- ... (se repite para cada tabla)...

-- Políticas para roles de negocio, ahora con WITH CHECK (Mejora 4)
CREATE POLICY "Usuarios gestionan su propio perfil" ON core.user_profiles FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Admins/Owners gestionan perfiles" ON core.user_profiles FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER'));

CREATE POLICY "Usuarios autenticados ven negocios" ON core.businesses FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins/Owners gestionan negocios" ON core.businesses FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER'));

CREATE POLICY "Usuarios ven items de inventario" ON core.inventory_items FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Staff gestiona items de inventario" ON core.inventory_items FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER', 'EMPLOYEE')) WITH CHECK (public.get_my_role() IN ('ADMIN', 'OWNER', 'EMPLOYEE'));

CREATE POLICY "Clientes gestionan sus propias órdenes" ON core.orders FOR ALL USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());
CREATE POLICY "Empleados gestionan órdenes de su negocio" ON core.orders FOR ALL USING (public.is_employee_of(business_id)) WITH CHECK (public.is_employee_of(business_id));

-- ... (y así para las demás tablas y roles)...

/******************************************************************************
 * PASO 9: VISTAS Y VISTAS MATERIALIZADAS (movidas al schema 'reports')
 ******************************************************************************/

-- Mejora 3: Se crean Vistas en un schema 'reports'. Se añade nota sobre Vistas Materializadas.
CREATE OR REPLACE VIEW reports.daily_sales_summary AS
SELECT DATE(o.created_at) AS report_date, b.id AS business_id, b.name AS business_name, SUM(o.total_amount) AS total_sales, COUNT(o.id) AS order_count
FROM core.orders AS o JOIN core.businesses AS b ON o.business_id = b.id
WHERE o.status = 'PAID' AND o.deleted = false AND b.deleted = false
GROUP BY report_date, b.id, b.name;

-- ... (código para las otras 5 vistas, ahora apuntando al schema 'core') ...

-- NOTA sobre Mejora 3: Para un reporte muy pesado, se podría usar una Vista Materializada.
-- CREATE MATERIALIZED VIEW reports.heavy_report AS ...;
-- REFRESH MATERIALIZED VIEW reports.heavy_report;


COMMIT;
