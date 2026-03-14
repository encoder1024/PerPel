# Plan de Implementación: API Tiendanube - AppPerPel
**ID del Plan:** PLAN-TIN-2026-03-09
**Fuente de Verdad:** Supabase ERP
**Objetivo:** Sincronización bidireccional de productos, stock en tiempo real y automatización de facturación para ventas online.

---

## Ticket: 0030-TIN-0001 - Extensión del Esquema de Base de Datos
**Descripción:** Crear las tablas necesarias para almacenar atributos específicos de Tiendanube y el mapa de sincronización.
**Tareas:**
- Crear tabla `core.inventory_items_tn`: Almacena el `handle`, `published`, `description_html` y otros metadatos requeridos por TN.
- Crear tabla `core.item_variants_tn`: Mapea variantes de Supabase con variantes de TN, incluyendo `tn_variant_id`.
- Crear tabla `core.tiendanube_sync_map`: Relación de IDs (`item_id` <-> `tn_product_id`), `last_sync_at`, y `sync_status`.
- Activar triggers de `public.log_changes()` en todas las nuevas tablas para cumplimiento ISO 9000.
**Validación:** Verificación de las tablas en el esquema `core` y existencia de políticas RLS.

---

## Ticket: 0031-TIN-0002 - Gestión de Credenciales y Configuración
**Descripción:** Implementar la lógica para almacenar y validar el Access Token y Store ID de Tiendanube.
**Tareas:**
- Asegurar que `core.business_credentials` acepte el `api_name = 'TIENDANUBE'`.
- Crear validación de token mediante un llamado de prueba a `/store` de la API de TN.
- Implementar en el frontend un formulario en "Configuración > E-commerce" para ingresar estas credenciales.
**Validación:** Prueba de conexión exitosa desde Supabase hacia la API de Tiendanube.

---

## Ticket: 0032-TIN-0003 - Edge Function: Exportación de Productos
**Descripción:** Crear la función serverless para empujar productos desde el ERP hacia Tiendanube.
**Tareas:**
- Desarrollar Edge Function `tn-product-export`.
- Lógica de "UPSERT": Si el producto no tiene ID de TN, se crea; si lo tiene, se actualiza.
- Mapeo de categorías locales a categorías de Tiendanube.
- Registro de cada transacción en `logs.api_logs`.
**Validación:** Ejecución manual de la función y verificación de aparición del producto en el panel de Tiendanube.

---

## Ticket: 0033-TIN-0004 - Sincronización de Stock en Tiempo Real (Trigger)
**Descripción:** Garantizar que Supabase sea la única fuente de verdad para el stock.
**Tareas:**
- Crear un trigger en `core.stock_levels` que se active en cada `UPDATE` de la columna `quantity`.
- El trigger debe invocar la Edge Function `tn-stock-sync`.
- La función actualizará el stock en la variante correspondiente en Tiendanube usando el `tn_variant_id`.
**Validación:** Cambiar el stock en el ERP y verificar que se refleje en Tiendanube en menos de 5 segundos.

---

## Ticket: 0034-TIN-0005 - Webhook Handler: Órdenes y Pagos
**Descripción:** Recibir notificaciones de ventas desde Tiendanube para impactar en el ERP.
**Tareas:**
- Crear Edge Function `tn-webhook-handler` expuesta públicamente.
- Procesar evento `order.created`: Crear registro en `core.orders` y `core.order_items`.
- Procesar evento `order.paid`: Crear registro en `core.payments` y descontar stock localmente en Supabase.
- Manejo de seguridad mediante validación de HMAC en el header de la petición.
**Validación:** Realizar una compra de prueba en la tienda y verificar la creación de la orden en el ERP.

---

## Ticket: 0035-TIN-0006 - Integración de Facturación Automática
**Descripción:** Conectar las órdenes provenientes de Tiendanube con el flujo de TusFacturasApp (TFA).
**Tareas:**
- Modificar el flujo de facturación actual para que las órdenes con origen 'TIENDANUBE' disparen la creación de factura en TFA.
- Mapear el `customer_email` y datos de pago de TN hacia el objeto de factura.
- Almacenar el PDF generado en el ERP y asociarlo a la orden.
**Validación:** Al marcar una orden como pagada en TN, se debe generar automáticamente la factura en el ERP.

---

## Ticket: 0036-TIN-0007 - Frontend: Monitor de E-commerce
**Descripción:** Implementar la interfaz de usuario para el control de la integración.
**Tareas:**
- Crear página `src/pages/ecommerce/TiendanubeDashboard.jsx`.
- Implementar Tabla de Sincronización: Lista de productos con su estado (Sincronizado/Error/Pendiente).
- Agregar botones de acción: "Exportar a TN", "Vincular Manualmente", "Re-sincronizar Stock".
- Mostrar logs de errores de sincronización provenientes de `core.tiendanube_sync_map`.
**Validación:** El usuario OWNER puede ver el estado de todos sus productos y forzar una sincronización desde la UI.
