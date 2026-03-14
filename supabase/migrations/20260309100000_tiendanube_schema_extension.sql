-- MIGRACIÓN: 0030-TIN-0001 - Extensión del Esquema para Tiendanube (v2 - Atributos Extendidos)
-- Descripción: Creación de tablas para productos, variantes, categorías y mapa de sincronización.
-- Incluye todos los atributos de variante requeridos para el CRUD de Tiendanube.
-- Cumplimiento: ISO 9000 (Triggers de Auditoría) y Multi-tenancy (RLS).

BEGIN;

-- 1. Extender ENUM de APIs externas (si no existe)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'external_api_name' AND e.enumlabel = 'TIENDANUBE') THEN
        ALTER TYPE public.external_api_name ADD VALUE 'TIENDANUBE';
    END IF;
END $$;

-- 2. Tabla: Metadatos de Producto Tiendanube
CREATE TABLE IF NOT EXISTS core.inventory_items_tn (
    item_id UUID PRIMARY KEY REFERENCES core.inventory_items(id) ON DELETE CASCADE,
    tn_product_id BIGINT, -- ID oficial del producto en TN
    account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE CASCADE,
    handle TEXT,
    description_html TEXT,
    published BOOLEAN DEFAULT true,
    brand TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT false
);

-- 3. Tabla: Variantes de Tiendanube (Con Atributos de CSV/API)
CREATE TABLE IF NOT EXISTS core.tiendanube_item_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES core.inventory_items(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE CASCADE,
    tn_variant_id BIGINT, -- ID retornado por TN
    
    -- Identificación y SEO
    identificador_de_url TEXT,
    nombre TEXT,
    categorias TEXT,
    sku TEXT,
    codigo_de_barras TEXT,
    mostrar_en_tienda BOOLEAN DEFAULT true,
    envio_sin_cargo BOOLEAN DEFAULT false,
    descripcion TEXT,
    tags TEXT,
    titulo_para_seo TEXT,
    descripcion_para_seo TEXT,
    
    -- Propiedades
    nombre_de_propiedad_1 TEXT,
    valor_de_propiedad_1 TEXT,
    nombre_de_propiedad_2 TEXT,
    valor_de_propiedad_2 TEXT,
    nombre_de_propiedad_3 TEXT,
    valor_de_propiedad_3 TEXT,
    
    -- Precios y Costos
    precio NUMERIC(15, 2),
    precio_promocional NUMERIC(15, 2),
    costo NUMERIC(15, 2),
    
    -- Físicos y Stock
    peso_kg NUMERIC(10, 3),
    alto_cm NUMERIC(10, 2),
    ancho_cm NUMERIC(10, 2),
    profundidad_cm NUMERIC(10, 2),
    stock INTEGER DEFAULT 0,
    
    -- Atributos de Marca y Clasificación
    marca TEXT,
    producto_fasico TEXT,
    mpn_numero_de_pieza_del_fabricante TEXT,
    sexo TEXT,
    rango_de_edad TEXT,
    
    -- Media
    imagen_url TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT false
);

-- 4. Tabla: Mapa de Sincronización Global
CREATE TABLE IF NOT EXISTS core.tiendanube_sync_map (
    item_id UUID PRIMARY KEY REFERENCES core.inventory_items(id) ON DELETE CASCADE,
    tn_product_id BIGINT NOT NULL,
    account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE CASCADE,
    sync_status TEXT DEFAULT 'PENDING' CHECK (sync_status IN ('SYNCED', 'PENDING', 'ERROR')),
    last_sync_at TIMESTAMPTZ,
    error_log TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT false
);

-- 5. Tabla: Categorías Tiendanube
CREATE TABLE IF NOT EXISTS core.tiendanube_categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES core.item_categories(id) ON DELETE SET NULL, -- Puede ser NULL si la categoría de TN no existe localmente aún
    account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE CASCADE,
    tn_category_id BIGINT NOT NULL,
    tn_parent_id BIGINT DEFAULT 0, -- 0 si es raíz, según Categories.json
    tn_subcategories_ids BIGINT[] DEFAULT '{}', -- Array de IDs de hijos en TN
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT false
);

-- 6. Aplicar Triggers de updated_at
CREATE TRIGGER set_updated_at_items_tn BEFORE UPDATE ON core.inventory_items_tn FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER set_updated_at_variants_tn BEFORE UPDATE ON core.tiendanube_item_variants FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER set_updated_at_sync_map_tn BEFORE UPDATE ON core.tiendanube_sync_map FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER set_updated_at_categorias_tn BEFORE UPDATE ON core.tiendanube_categorias FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- 7. Aplicar Triggers de Auditoría (ISO 9000)
CREATE TRIGGER audit_items_tn_changes AFTER INSERT OR UPDATE OR DELETE ON core.inventory_items_tn FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_variants_tn_changes AFTER INSERT OR UPDATE OR DELETE ON core.tiendanube_item_variants FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_sync_map_tn_changes AFTER INSERT OR UPDATE OR DELETE ON core.tiendanube_sync_map FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
CREATE TRIGGER audit_categorias_tn_changes AFTER INSERT OR UPDATE OR DELETE ON core.tiendanube_categorias FOR EACH ROW EXECUTE PROCEDURE public.log_changes();

-- 8. Habilitar RLS y Crear Políticas
ALTER TABLE core.inventory_items_tn ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.tiendanube_item_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.tiendanube_sync_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.tiendanube_categorias ENABLE ROW LEVEL SECURITY;

-- Políticas para OWNER y ADMIN (Acceso a su propia cuenta)
CREATE POLICY "Acceso Tiendanube por Cuenta" ON core.inventory_items_tn
    FOR ALL USING (account_id = public.get_my_account_id() AND public.get_my_role() IN ('OWNER', 'ADMIN'));

CREATE POLICY "Acceso Variantes Tiendanube por Cuenta" ON core.tiendanube_item_variants
    FOR ALL USING (account_id = public.get_my_account_id() AND public.get_my_role() IN ('OWNER', 'ADMIN'));

CREATE POLICY "Acceso Sync Map Tiendanube por Cuenta" ON core.tiendanube_sync_map
    FOR ALL USING (account_id = public.get_my_account_id() AND public.get_my_role() IN ('OWNER', 'ADMIN'));

CREATE POLICY "Acceso Categorias Tiendanube por Cuenta" ON core.tiendanube_categorias
    FOR ALL USING (account_id = public.get_my_account_id() AND public.get_my_role() IN ('OWNER', 'ADMIN'));

COMMIT;
