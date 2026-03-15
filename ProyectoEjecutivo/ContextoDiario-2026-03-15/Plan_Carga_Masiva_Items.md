# Plan de Implementación: Carga Masiva de Ítems y Sincronización con Tiendanube

**Fecha:** 2026-03-15
**Objetivo:** Implementar una funcionalidad que permita a los administradores cargar productos de forma masiva mediante un archivo Excel, integrándolos con el inventario local y la plataforma Tiendanube.

---

### Ticket 1: Frontend - Interfaz de Carga Masiva
**Tarea:** Añadir el botón "Carga Masiva" y el modal de selección de archivos.
- **Ubicación:** `src/pages/inventory/Inventory.jsx`.
- **Descripción:**
    - Insertar botón "Carga Masiva" en la cabecera de la página.
    - Implementar `BulkUploadModal` que permita arrastrar o seleccionar un archivo `.xlsx`.
    - Utilizar la librería `xlsx` (SheetJS) para parsear el archivo en el cliente y convertirlo a un array de objetos JSON.
    - Validar que las columnas mínimas requeridas existan antes de proceder.
- **Entregable:** Interfaz visual lista para capturar y pre-procesar el archivo Excel.

---

### Ticket 2: Backend - Función RPC de Inserción Masiva
**Tarea:** Crear la función RPC `bulk_upsert_inventory_items` en Supabase.
- **Parámetros:** `p_items JSONB` (Array de objetos con el mapeo del Excel).
- **Lógica:**
    1.  Iterar sobre el JSON.
    2.  Insertar en `core.inventory_items` (datos base: nombre, sku, precio, costo, etc.).
    3.  Si "Mostrar en tienda" es "SI":
        - Insertar/Actualizar en `core.inventory_items_tn` (metadatos de tienda).
        - Insertar/Actualizar en `core.tiendanube_item_variants` (detalles técnicos, SEO, variantes).
    4.  Manejar la vinculación unívoca por `sku` y `account_id`.
- **Entregable:** Función SQL optimizada para carga masiva respetando la integridad referencial.

---

### Ticket 3: Frontend - Procesamiento y Resumen de Carga
**Tarea:** Conectar el modal con la RPC y mostrar resultados.
- **Descripción:**
    - Enviar los datos parseados a `bulk_upsert_inventory_items`.
    - Mostrar un resumen al finalizar: "X ítems creados en inventario", "Y ítems preparados para Tiendanube".
    - Presentar el botón de acción: "Sincronizar ahora con Tiendanube".
- **Entregable:** Flujo de carga funcional con feedback en tiempo real para el usuario.

---

### Ticket 4: Backend - Edge Function para Sincronización con Tiendanube
**Tarea:** Implementar la Edge Function `tn-bulk-sync`.
- **Descripción:**
    - Recibir una lista de `item_ids`.
    - Consultar las credenciales del negocio para Tiendanube.
    - Iterar sobre cada ítem y realizar la llamada a la API de Tiendanube (`POST /products`).
    - Actualizar `core.tiendanube_sync_map` con el estado de la sincronización y el `tn_product_id` devuelto.
    - Manejar límites de tasa (rate limits) de la API de Tiendanube mediante pequeñas pausas entre peticiones.
- **Entregable:** Servicio de sincronización externa robusto y auditable.

---

### Ticket 5: Frontend - Validación Final y Seguimiento de Sincronización
**Tarea:** Implementar el seguimiento de la sincronización en la UI.
- **Descripción:**
    - Al dar OK a la sincronización masiva, llamar a `tn-bulk-sync`.
    - Mostrar una barra de progreso o lista de estados mientras se procesan los productos uno a uno.
    - Permitir cerrar el modal y seguir trabajando, informando el resultado mediante una notificación global.
- **Entregable:** Experiencia de usuario completa y profesional para la gestión masiva de catálogo.
