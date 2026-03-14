# Detalle de Ticket: 0030-TIN-0001 - Extensión del Esquema DB
**Estado:** Pendiente de Ejecución
**Relación:** Subtarea del Plan General Tiendanube

## 1. Tablas a Crear en Schema `core`

### 1.1 `core.inventory_items_tn` (Metadatos de Producto TN)
Extiende la información del producto base para los requerimientos de la tienda online.
- `item_id` (UUID, PK, FK -> `core.inventory_items`)
- `tn_product_id` (BIGINT): ID oficial del producto en Tiendanube.
- `account_id` (UUID, FK -> `core.accounts`)
- `business_id` (UUID, FK -> `core.businesses`)
- `handle` (TEXT): URL amigable del producto.
- `description_html` (TEXT): Descripción enriquecida.
- `published` (BOOLEAN): Estado de visibilidad en TN.
- `brand` (TEXT): Marca comercial.
- `created_at`, `updated_at`, `is_deleted`

### 1.2 `core.tiendanube_item_variants` (Variantes TN)
Maneja las múltiples variantes por producto con soporte para el esquema completo de Tiendanube.
- `id` (UUID, PK)
- `item_id` (UUID, FK -> `core.inventory_items`)
- `account_id`, `business_id` (UUID, FK)
- `tn_variant_id` (BIGINT): ID retornado por la API de TN.
- **Atributos de Identificación y SEO:**
    - `identificador_de_url` (TEXT)
    - `nombre` (TEXT)
    - `categorias` (TEXT)
    - `sku` (TEXT)
    - `codigo_de_barras` (TEXT)
    - `mostrar_en_tienda` (BOOLEAN)
    - `envio_sin_cargo` (BOOLEAN)
    - `descripcion` (TEXT)
    - `tags` (TEXT)
    - `titulo_para_seo` (TEXT)
    - `descripcion_para_seo` (TEXT)
- **Propiedades de Variante (hasta 3):**
    - `nombre_de_propiedad_1`, `valor_de_propiedad_1` (TEXT)
    - `nombre_de_propiedad_2`, `valor_de_propiedad_2` (TEXT)
    - `nombre_de_propiedad_3`, `valor_de_propiedad_3` (TEXT)
- **Precios y Costos:**
    - `precio` (NUMERIC)
    - `precio_promocional` (NUMERIC)
    - `costo` (NUMERIC)
- **Logística y Físicos:**
    - `peso_kg` (NUMERIC)
    - `alto_cm`, `ancho_cm`, `profundidad_cm` (NUMERIC)
    - `stock` (INTEGER)
- **Atributos de Marca y Fabricante:**
    - `marca` (TEXT)
    - `producto_fasico` (TEXT)
    - `mpn_numero_de_pieza_del_fabricante` (TEXT)
    - `sexo` (TEXT)
    - `rango_de_edad` (TEXT)
- **Media:**
    - `imagen_url` (TEXT)
- `created_at`, `updated_at`, `is_deleted`

### 1.3 `core.tiendanube_sync_map` (Mapa de Sincronización)
Rastrea el estado global de sincronización producto-tienda.
- `item_id` (UUID, PK, FK -> `core.inventory_items`)
- `tn_product_id` (BIGINT): ID del producto padre en TN.
- `account_id`, `business_id` (UUID, FK)
- `sync_status` (TEXT): 'SYNCED', 'PENDING', 'ERROR'.
- `last_sync_at` (TIMESTAMPTZ)
- `error_log` (TEXT): Detalle de fallos para el frontend.
- `created_at`, `updated_at`, `is_deleted`

### 1.4 `core.tiendanube_categorias` (Mapeo de Categorías)
Vincula las categorías locales con las de Tiendanube.
- `id` (UUID, PK)
- `category_id` (UUID, FK -> `core.item_categories`)
- `account_id`, `business_id` (UUID, FK)
- `tn_category_id` (BIGINT): ID oficial de la categoría en TN.
- `name` (TEXT): Nombre en Tiendanube.
- `created_at`, `updated_at`, `is_deleted`

---

## 2. Lógica de Negocio y Seguridad

### 2.1 Triggers de Auditoría (ISO 9000)
Se aplicará el trigger `public.log_changes()` en las 4 tablas.

### 2.2 Políticas RLS
Habilitar acceso total a `OWNER` y `ADMIN` sobre registros de su propia cuenta.

---

## 3. Integraciones de Backend

### 3.1 Webhooks (Obligatorios)
- `tn-webhook-handler`:
    - `order.paid`: Dispara creación de pago en el ERP y factura en TFA.
    - `product.updated`: (OBLIGATORIO) Sincroniza cambios hechos desde el panel de TN hacia el ERP para mantener la integridad.
