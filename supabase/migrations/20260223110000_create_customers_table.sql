/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260223110000_create_customers_table.sql                          *
 *   FASE 4: GESTIÓN CENTRALIZADA DE CLIENTES Y DATOS FISCALES                     *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- 1. Crear la tabla de clientes en el esquema core
CREATE TABLE IF NOT EXISTS core.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
    business_id UUID REFERENCES core.businesses(id) ON DELETE SET NULL, -- Dónde se registró originalmente
    
    -- Datos de Identificación y Categoría
    full_name TEXT NOT NULL,
    category public.user_category DEFAULT 'NEW',
    email TEXT,
    phone_number TEXT,
    
    -- Datos Fiscales (Compatibles con AFIP/Alegra)
    doc_type public.customer_doc_type DEFAULT '99', -- 80=CUIT, 96=DNI, 99=Consumidor Final
    doc_number TEXT DEFAULT '0',
    iva_condition TEXT DEFAULT 'Consumidor Final', -- Responsable Inscripto, Monotributista, etc.
    
    -- Ubicación
    address TEXT,
    city TEXT,
    state_prov TEXT,
    zip_code TEXT,
    
    -- Otros
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    
    -- Restricción para evitar duplicados de documento dentro de la misma cuenta
    CONSTRAINT unique_customer_doc_per_account UNIQUE (account_id, doc_type, doc_number)
);

-- 2. Índices para búsqueda rápida (Nombre y Documento)
CREATE INDEX IF NOT EXISTS idx_customers_account_id ON core.customers(account_id);
CREATE INDEX IF NOT EXISTS idx_customers_doc_number ON core.customers(doc_number);
CREATE INDEX IF NOT EXISTS idx_customers_business_id ON core.customers(business_id);

-- 3. Habilitar RLS
ALTER TABLE core.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.customers FORCE ROW LEVEL SECURITY;

-- 4. Políticas RLS
-- El OWNER y ADMIN pueden gestionar todos los clientes de su cuenta
-- El EMPLOYEE puede ver y crear clientes para realizar ventas
CREATE POLICY "Usuarios acceden a clientes de su cuenta" 
ON core.customers 
FOR ALL 
USING (account_id = public.get_my_account_id());

-- 5. Triggers de Auditoría y Timestamps
CREATE TRIGGER on_customers_update 
    BEFORE UPDATE ON core.customers 
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER audit_customers_changes 
    AFTER INSERT OR UPDATE OR DELETE ON core.customers 
    FOR EACH ROW EXECUTE PROCEDURE public.log_changes();

COMMIT;
