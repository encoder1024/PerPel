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
-- ¡MODIFICADO! Se añaden los nuevos roles de OWNER, AUDITOR, DEVELOPER
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
CREATE TYPE public.appointment_status AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
/******************************************************************************
 * PASO 3: DEFINICIÓN DE TABLAS
 ******************************************************************************/
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  app_role app_role,
  phone_number TEXT,
  address TEXT,
  city TEXT,
  state_province TEXT,
  zip_code TEXT,
  country TEXT,
  dni TEXT UNIQUE,
  cuil_cuit TEXT UNIQUE,
  CONSTRAINT name_length CHECK (char_length(full_name) > 0)
);
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  type business_type NOT NULL,
  address TEXT,
  tax_id TEXT,
  CONSTRAINT name_not_empty CHECK (char_length(name) > 0)
);

CREATE TABLE public.employee_assignments (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, business_id)
);
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  item_type item_type NOT NULL,
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
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
  status appointment_status NOT NULL DEFAULT 'SCHEDULED'
);
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  client_id UUID NOT NULL REFERENCES auth.users(id),
  business_id UUID NOT NULL REFERENCES public.businesses(id),
  total_amount NUMERIC(10, 2) NOT NULL,
  status order_status NOT NULL DEFAULT 'PENDING',
  mercadopago_preference_id TEXT
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
  total_amount NUMERIC(10, 2) NOT NULL,
  afip_cae TEXT,
  afip_status TEXT
);
CREATE TABLE public.api_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  api_name public.external_api_name NOT NULL,
  operation_name TEXT NOT NULL,
  correlation_id TEXT,
  request_payload JSONB,
  response_payload JSONB,
  status TEXT NOT NULL
);
CREATE TABLE public.offline_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  operation TEXT NOT NULL,
  payload JSONB NOT NULL,
  status sync_status NOT NULL DEFAULT 'PENDING',
  attempts INT DEFAULT 0
);
CREATE TABLE public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID,
  action TEXT NOT NULL,
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