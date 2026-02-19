/************************************************************************************
 *                                                                                  *
 *       SCRIPT DE CREACIÓN DE BASE DE DATOS FINAL - Versión con Roles Ampliados    *
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
CREATE OR REPLACE FUNCTION public.log_changes()
RETURNS TRIGGER AS $$
DECLARE
  record_id_text TEXT;
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    record_id_text = NEW.id::TEXT;
  ELSE
    record_id_text = OLD.id::TEXT;
  END IF;
  INSERT INTO public.audit_log (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    TG_OP::TEXT,
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
CREATE TYPE public.app_role AS ENUM (
  'OWNER',
  'ADMIN',
  'EMPLOYEE',
  'AUDITOR',
  'DEVELOPER'
);
CREATE TYPE public.external_api_name AS ENUM (
  'MERCADOPAGO',
  'ARCA',
  'INVOICING_API',
  'ONESIGNAL',
  'CAL_COM'
);
CREATE TYPE public.business_type AS ENUM ('SALON', 'PERFUMERY');
CREATE TYPE public.item_type AS ENUM ('PRODUCT', 'SERVICE');
CREATE TYPE public.order_status AS ENUM ('PENDING', 'PAID', 'ABANDONED', 'ERROR');
CREATE TYPE public.payment_method AS ENUM ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'MERCADOPAGO_QR', 'MERCADOPAGO_ONLINE');
CREATE TYPE public.sync_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
CREATE TYPE public.appointment_status AS ENUM ('SCHEDULED', 'COMPLETED', 'NO_SHOW',
 'PENDING', 
 'ACCEPTED', 
 'REJECTED', 
 'CANCELLED', 
 'AWAITING_HOST');/*Las que están en vertical son del flujo de Cal.com para el estado de una reserva.*/
CREATE TYPE public.user_category AS ENUM ('VIP', 'CASUAL', 'NEW', 'INACTIVE', 'ONTIME');
CREATE TYPE public.item_status AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUE');
CREATE TYPE public.customer_doc_type AS ENUM ('80', '96', '99'); --80=CUIT 96=DNI 99=Consumidor Final
CREATE TYPE public.cbte_tipo AS ENUM (1, 6, 11) -- 1=Factura A, 6=Factura B, 11=Factura C
CREATE TYPE public.arca_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ERROR');
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
  category public.user_category TEXT,
  CONSTRAINT name_length CHECK (char_length(full_name) > 0)
);

CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  namee TEXT NOT NULL,
  typee public.business_type NOT NULL,
  email TEXT,
  phone_number TEXT,
  street TEXT,
  city TEXT,
  state_prov TEXT,
  zip_code TEXT,
  country TEXT,
  location_coords TEXT,
  tax_id TEXT,
  CONSTRAINT name_not_empty CHECK (char_length(name) > 0)
);

CREATE TABLE public.employee_assignments (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (user_id, business_id)
);

CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  item_type item_type NOT NULL,
  item_category TEXT,
  item_status public.item_satus NOT NULL
  sku TEXT UNIQUE,
  namee TEXT NOT NULL,
  descriptionn TEXT,
  image_url TEXT,
  duration_minutes INT,
  cost_price NUMERIC(10, 2) DEFAULT 0,
  selling_price NUMERIC(10, 2) NOT NULL,
  is_for_sale BOOLEAN DEFAULT true,
  CONSTRAINT selling_price_must_be_positive CHECK (selling_price > 0),
  CONSTRAINT cost_price_must_be_positive CHECK (cost_price >= 0),
  CONSTRAINT name_not_empty CHECK (char_length(name) > 0)
);

CREATE TABLE public.stock_levels (
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  quantity INT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
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
  event_type_id INTEGER, -- ID del tipo de servicio en Cal
  service_notes TEXT,
  cancel_reason TEXT,
  statuss public.appointment_status NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  client_id UUID NOT NULL REFERENCES auth.users(id),
  business_id UUID NOT NULL REFERENCES public.businesses(id),
  total_amount NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'ARS',  
  statuss public.order_status NOT NULL DEFAULT 'PENDING',
  -- Dato de mercadopago
  mercadopago_preference_id TEXT
  -- Datos para AFIP (Requeridos para el CAE)
  customer_doc_type TEXT DEFAULT '99',        -- 80=CUIT, 96=DNI, 99=Consumidor Final
  customer_doc_number TEXT DEFAULT '0',
  customer_name TEXT DEFAULT 'Consumidor Final',
  iva_condition TEXT DEFAULT 'Consumidor Final',
);

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id),
  quantity INT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
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
  arca_status public.arca_status TEXT,
  cae_vencimiento DATE,
  cbte_tipo public.cbte_tipo INTEGER, -- 1=Factura A, 6=Factura B, 11=Factura C
  punto_venta INTEGER,
  cbte_nro INTEGER,
  qr_link TEXT, -- URL generada (JSON Base64 de AFIP)
  full_pdf_url TEXT, -- Almacenamiento del PDF generado
  
  -- Control de impresión física en el negocio
  is_printed BOOLEAN DEFAULT false,
  printed_at TIMESTAMP WITH TIME ZONE,
  printer_id TEXT,

    -- Específico para Servicios (Peluquería) no se utilizan en facturación de productos
  fch_serv_desde DATE DEFAULT CURRENT_DATE,
  fch_serv_hasta DATE DEFAULT CURRENT_DATE,
  fch_serv_vto_pago DATE DEFAULT CURRENT_DATE
);

CREATE TABLE public.api_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  api_name public.external_api_name NOT NULL,
  endpointt TEXT
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  operation_name TEXT NOT NULL,
  correlation_id TEXT,
  request_payload JSONB,
  response_payload JSONB,
  statuss TEXT NOT NULL
);

CREATE TABLE public.offline_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  operation TEXT NOT NULL,
  payload JSONB NOT NULL,
  statuss public.sync_status NOT NULL DEFAULT 'PENDING',
  attempts INT DEFAULT 0
);

CREATE TABLE public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID,
  actionn TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB
);


/******************************************************************************
 * PASO 4 Y 5: ÍNDICES Y TRIGGERS
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
CREATE TRIGGER on_profiles_update BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_businesses_update BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_items_update BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_stock_update BEFORE UPDATE ON public.stock_levels FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_appointments_update BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER on_orders_update BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_inventory_items_changes AFTER INSERT OR UPDATE OR DELETE ON public.inventory_items FOR EACH ROW EXECUTE PROCEDURpublic.log_changes();
CREATE TRIGGER audit_stock_levels_changes AFTER INSERT OR UPDATE OR DELETE ON public.stock_levels FOR EACH ROW EXECUTE PROCEDURE public.log_changes()
CREATE TRIGGER audit_appointments_changes AFTER INSERT OR UPDATE OR DELETE ON public.appointments FOR EACH ROW EXECUTE PROCEDURE public.log_changes()
CREATE TRIGGER audit_orders_changes AFTER INSERT OR UPDATE OR DELETE ON public.orders FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_invoices_changes AFTER INSERT OR UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
/******************************************************************************
 * PASO 6: FUNCIONES DE SEGURIDAD PARA RLS
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
 * PASO 7: APLICACIÓN DE POLÍTICAS DE SEGURIDAD (ROW LEVEL SECURITY)
 ******************************************************************************/
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY; ALTER TABLE public.businesses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employee_assignments ENABLE ROW LEVEL SECURITY; ALTER TABLE public.employee_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY; ALTER TABLE public.inventory_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY; ALTER TABLE public.stock_levels FORCE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY; ALTER TABLE public.appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY; ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY; ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY; ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE public.api_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.offline_sync_queue ENABLE ROW LEVEL SECURITY; ALTER TABLE public.offline_sync_queue FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY; ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;
--- Políticas para roles de alta jerarquía (OWNER, ADMIN, DEVELOPER)
CREATE POLICY "Acceso total para Desarrolladores" ON public.user_profiles FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.businesses FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.employee_assignments FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.inventory_items FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.stock_levels FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.appointments FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.orders FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.order_items FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.invoices FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.api_logs FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.offline_sync_queue FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Acceso total para Desarrolladores" ON public.audit_log FOR ALL USING (public.get_my_role() = 'DEVELOPER');
--- Políticas para roles de negocio (CLIENT, EMPLOYEE, OWNER, ADMIN)
CREATE POLICY "Usuarios gestionan su propio perfil" ON public.user_profiles FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Admins/Owners gestionan perfiles" ON public.user_profiles FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER'));
CREATE POLICY "Usuarios autenticados ven los negocios" ON public.businesses FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins/Owners gestionan negocios" ON public.businesses FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER'));
CREATE POLICY "Usuarios ven items de inventario" ON public.inventory_items FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Staff gestiona items de inventario" ON public.inventory_items FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER', 'EMPLOYEE'));
CREATE POLICY "Clientes ven sus propios turnos" ON public.appointments FOR SELECT USING (client_id = auth.uid());
CREATE POLICY "Empleados ven turnos de su negocio" ON public.appointments FOR SELECT USING (public.is_employee_of(business_id));
CREATE POLICY "Admins/Owners gestionan todos los turnos" ON public.appointments FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER'));
CREATE POLICY "Clientes gestionan sus propias órdenes" ON public.orders FOR ALL USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());
CREATE POLICY "Empleados ven órdenes de su negocio" ON public.orders FOR SELECT USING (public.is_employee_of(business_id));
CREATE POLICY "Admins/Owners gestionan todas las órdenes" ON public.orders FOR ALL USING (public.get_my_role() IN ('ADMIN', 'OWNER'));
--- Políticas para roles de solo lectura (AUDITOR)
CREATE POLICY "Auditores ven datos de negocio" ON public.businesses FOR SELECT USING (public.get_my_role() = 'AUDITOR');
CREATE POLICY "Auditores ven datos de inventario y stock" ON public.inventory_items FOR SELECT USING (public.get_my_role() = 'AUDITOR');
CREATE POLICY "Auditores ven datos de inventario y stock" ON public.stock_levels FOR SELECT USING (public.get_my_role() = 'AUDITOR');
CREATE POLICY "Auditores ven órdenes, items y facturas" ON public.orders FOR SELECT USING (public.get_my_role() = 'AUDITOR');
CREATE POLICY "Auditores ven órdenes, items y facturas" ON public.order_items FOR SELECT USING (public.get_my_role() = 'AUDITOR');
CREATE POLICY "Auditores ven órdenes, items y facturas" ON public.invoices FOR SELECT USING (public.get_my_role() = 'AUDITOR');
CREATE POLICY "Auditores ven los turnos" ON public.appointments FOR SELECT USING (public.get_my_role() = 'AUDITOR');
--- Políticas para tablas de LOGS
CREATE POLICY "Admins/Owners/Auditores ven el audit log" ON public.audit_log FOR SELECT USING (public.get_my_role() IN ('ADMIN', 'OWNER', 'AUDITOR'))
CREATE POLICY "Admins/Owners/Auditores ven los api logs" ON public.api_logs FOR SELECT USING (public.get_my_role() IN ('ADMIN', 'OWNER', 'AUDITOR'));
CREATE POLICY "Admins/Owners ven la cola de sincronización" ON public.offline_sync_queue FOR SELECT USING (public.get_my_role() IN ('ADMIN', 'OWNER')
COMMIT;

/******************************************************************************
 * SCRIPT COMPLETO PARA LA TABLA DE CATEGORÍAS
 ******************************************************************************/

-- 1. Creación de ENUM y la Tabla (si no existen)
-- ----------------------------------------------------------------

CREATE TYPE public.category_scope AS ENUM ('SALON', 'PERFUMERY', 'ALL');

CREATE TABLE public.item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  namee TEXT NOT NULL UNIQUE,
  descriptionn TEXT,
  applies_to public.category_scope NOT NULL
);


-- 2. Precarga de Categorías por Defecto
-- ----------------------------------------------------------------

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


-- 3. Aplicación de Triggers para Auditoría y Timestamps
-- ----------------------------------------------------------------

-- Trigger para actualizar el campo 'updated_at'
CREATE TRIGGER on_item_categories_update
  BEFORE UPDATE ON public.item_categories
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_updated_at();

-- Trigger para registrar cambios en la tabla de auditoría
CREATE TRIGGER audit_item_categories_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.item_categories
  FOR EACH ROW
  EXECUTE PROCEDURE public.log_changes();


-- 4. Aplicación de Políticas de Seguridad (ROW LEVEL SECURITY)
-- ----------------------------------------------------------------

-- Activar y forzar RLS en la tabla
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_categories FORCE ROW LEVEL SECURITY;

-- Política para que cualquier usuario autenticado pueda leer las categorías
CREATE POLICY "Cualquier usuario autenticado puede ver las categorías"
  ON public.item_categories FOR SELECT USING (auth.role() = 'authenticated');

-- Política para que el personal (Owner, Admin, Empleado) pueda gestionar las categorías
CREATE POLICY "Staff puede gestionar categorías"
  ON public.item_categories FOR ALL USING (public.get_my_role() IN ('OWNER', 'ADMIN', 'EMPLOYEE'));

-- Política para que el desarrollador tenga acceso total
CREATE POLICY "Acceso total para Desarrolladores"
  ON public.item_categories FOR ALL USING (public.get_my_role() = 'DEVELOPER');
/******************************************************************************
 * SCRIPT COMPLETO PARA LA TABLA DE PAGOS (PAYMENTS)
 ******************************************************************************/

-- 1. Creación de ENUMs específicos para esta tabla
-- ----------------------------------------------------------------

CREATE TYPE public.payment_status AS ENUM ('in_process', 'approved', 'rejected', 'cancelled');
CREATE TYPE public.payment_point_type AS ENUM ('online', 'point'); -- 'point' es el Postnet/dispositivo físico


-- 2. Creación de la Tabla `payments` (Versión mejorada)
-- ----------------------------------------------------------------

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  mp_payment_id TEXT UNIQUE,                  -- ID de transacción de MP
  amount NUMERIC(19,4) NOT NULL,
  status public.payment_status NOT NULL,      -- 'approved', 'rejected', 'in_process'
  payment_type public.payment_point_type,     -- 'online' o 'point' (Postnet)
  payment_method_id TEXT,                     -- visa, master, mercadopago, etc.
  device_id TEXT,                             -- ID del Point físico si aplica
  card_last_four TEXT,
  installments INTEGER DEFAULT 1,
  raw_response JSONB,                         -- Todo el JSON de MP por seguridad
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT amount_is_positive CHECK (amount > 0)
);


-- 3. Creación de Índices
-- ----------------------------------------------------------------

CREATE INDEX idx_payments_order_id ON public.payments(order_id);
CREATE INDEX idx_payments_mp_payment_id ON public.payments(mp_payment_id);


-- 4. Aplicación de Triggers para Auditoría y Timestamps
-- ----------------------------------------------------------------

-- Trigger para actualizar el campo 'updated_at'
CREATE TRIGGER on_payments_update
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_updated_at();

-- Trigger para registrar cambios en la tabla de auditoría
CREATE TRIGGER audit_payments_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE PROCEDURE public.log_changes();


-- 5. Aplicación de Políticas de Seguridad (ROW LEVEL SECURITY)
-- ----------------------------------------------------------------

-- Activar y forzar RLS en la tabla
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;

-- Política para que los clientes vean los pagos de sus propias órdenes
CREATE POLICY "Clientes pueden ver sus propios pagos"
  ON public.payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = payments.order_id AND orders.client_id = auth.uid()
  ));

-- Política para que los empleados vean los pagos de los negocios a los que están asignados
CREATE POLICY "Empleados pueden ver los pagos de su negocio"
  ON public.payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = payments.order_id AND public.is_employee_of(o.business_id)
  ));

-- Política para que Admins y Owners gestionen todos los pagos
CREATE POLICY "Admins/Owners pueden gestionar todos los pagos"
  ON public.payments FOR ALL
  USING (public.get_my_role() IN ('OWNER', 'ADMIN'));

-- Política para que los auditores vean todos los pagos
CREATE POLICY "Auditores pueden ver todos los pagos"
  ON public.payments FOR SELECT
  USING (public.get_my_role() = 'AUDITOR');

-- Política para que el desarrollador tenga acceso total
CREATE POLICY "Acceso total para Desarrolladores"
  ON public.payments FOR ALL
  USING (public.get_my_role() = 'DEVELOPER');

/******************************************************************************
 * SCRIPT COMPLETO PARA LA TABLA DE SESIONES DE CAJA (CASH_REGISTER_SESSIONS)
 ******************************************************************************/

-- 1. Creación de ENUM específico para esta tabla
-- ----------------------------------------------------------------

CREATE TYPE public.session_status AS ENUM ('OPEN', 'CLOSED');


-- 2. Creación de la Tabla `cash_register_sessions`
-- ----------------------------------------------------------------

CREATE TABLE public.cash_register_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  opened_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  closed_by_user_id UUID REFERENCES auth.users(id),

  opening_balance NUMERIC(10, 2) NOT NULL,
  closing_balance NUMERIC(10, 2),
  calculated_cash_in NUMERIC(10, 2), -- Suma de pagos en efectivo durante la sesión

  status public.session_status NOT NULL DEFAULT 'OPEN',
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(), -- Coincide con la apertura
  updated_at TIMESTAMPTZ DEFAULT NOW(), -- Se actualiza al cerrar

  CONSTRAINT opening_balance_not_negative CHECK (opening_balance >= 0)
);


-- 3. Creación de Índices
-- ----------------------------------------------------------------

CREATE INDEX idx_cash_sessions_business_id ON public.cash_register_sessions(business_id);
CREATE INDEX idx_cash_sessions_status ON public.cash_register_sessions(status);


-- 4. Aplicación de Triggers para Auditoría y Timestamps
-- ----------------------------------------------------------------

-- Trigger para actualizar el campo 'updated_at'
CREATE TRIGGER on_cash_register_sessions_update
  BEFORE UPDATE ON public.cash_register_sessions
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_updated_at();

-- Trigger para registrar cambios en la tabla de auditoría
CREATE TRIGGER audit_cash_register_sessions_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.cash_register_sessions
  FOR EACH ROW
  EXECUTE PROCEDURE public.log_changes();


-- 5. Aplicación de Políticas de Seguridad (ROW LEVEL SECURITY)
-- ----------------------------------------------------------------

-- Activar y forzar RLS en la tabla
ALTER TABLE public.cash_register_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_register_sessions FORCE ROW LEVEL SECURITY;

-- Política para que los empleados gestionen las cajas de los negocios a los que están asignados
CREATE POLICY "Empleados pueden gestionar las cajas de su negocio"
  ON public.cash_register_sessions FOR ALL
  USING (public.is_employee_of(business_id));

-- Política para que Admins y Owners gestionen todas las cajas
-- Esta política se suma a la anterior. Un Owner/Admin puede gestionar aunque no esté
-- directamente asignado a ese negocio específico en la tabla `employee_assignments`.
CREATE POLICY "Admins/Owners pueden gestionar todas las cajas"
  ON public.cash_register_sessions FOR ALL
  USING (public.get_my_role() IN ('OWNER', 'ADMIN'));

-- Política para que los auditores vean todas las sesiones de caja
CREATE POLICY "Auditores pueden ver todas las sesiones de caja"
  ON public.cash_register_sessions FOR SELECT
  USING (public.get_my_role() = 'AUDITOR');

-- Política para que el desarrollador tenga acceso total
CREATE POLICY "Acceso total para Desarrolladores"
  ON public.cash_register_sessions FOR ALL
  USING (public.get_my_role() = 'DEVELOPER');