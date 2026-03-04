# Plan de Implementación: Integración Facturación Alegra (rev00)
**Basado en:** Documentación Alegra API, ERS PerPel y Script DB revA0.

---

### Ticket: 000010-ALEGRA-001 - Alineación de Modelos de Datos (Customers & Invoices)
*   **Objetivo:** Asegurar que los datos fiscales fluyan desde el cliente hasta la factura en Supabase.
*   **Tareas:**
    *   Verificar que `core.customers` tenga los campos `doc_type` (ENUM), `doc_number` e `iva_condition` necesarios para Alegra/AFIP.
    *   Añadir el campo `alegra_contact_id` a `core.customers` para el mapeo con la API de Alegra.
    *   Asegurar que `core.inventory_items` tenga `alegra_item_id` para sincronización de catálogo.
    *   Configurar el Bucket de Storage `invoices` siguiendo la jerarquía: `invoices/{account_id}/{business_id}/{order_id}/`.
    *   **Validación:** Probar subida manual de un PDF de prueba a la estructura de carpetas definida.

### Ticket: 000011-ALEGRA-002 - Edge Function "Alegra Sync" (Invoice Generator)
*   **Objetivo:** Procesar la orden y generar el comprobante legal siguiendo el esquema `revA0`.
*   **Tareas:**
    *   **Carga de Datos:** Obtener la orden vinculada a `core.customers` para extraer CUIT/DNI y condición de IVA.
    *   **Lógica Alegra:** Realizar el POST a `/invoices` con `stamp: true`. Mapear `cbte_tipo` (1, 6, 11) según la condición de IVA del cliente.
    *   **Registro en `core.invoices`:** Guardar: `arca_cae`, `cae_vencimiento`, `punto_venta`, `cbte_nro`, `arca_status` ('APPROVED') y `full_pdf_url`.
    *   **Persistencia:** Descargar el PDF de la URL de Alegra y subirlo al Storage de Supabase.
    *   **Logs:** Registrar en `logs.api_logs` el request y response completo.

### Ticket: 000012-ALEGRA-003 - Hook `useInvoices.jsx` y Lógica de Negocio
*   **Objetivo:** Centralizar la lógica de facturación y comunicación con Supabase en el frontend.
*   **Tareas:**
    *   Implementar `fetchInvoices` con filtros por `business_id` y `arca_status`.
    *   Implementar `generateInvoice(orderId)` que invoque la Edge Function mediante `supabase.functions.invoke`.
    *   Implementar `getInvoiceDownloadUrl(invoiceId)` para obtener la URL firmada del PDF desde el Storage.
    *   Gestionar estados de carga y errores con notificaciones MUI.

### Ticket: 000013-ALEGRA-004 - UI Invoices - DataGrid de Comprobantes
*   **Objetivo:** Interfaz principal para la gestión de comprobantes emitidos.
*   **Tareas:**
    *   Desarrollar la página en `src/pages/invoices/Invoices.jsx` usando MUI DataGrid.
    *   Columnas: Fecha, Nro Comprobante (`punto_venta` - `cbte_nro`), Tipo (`cbte_tipo`), Cliente, Monto Total y Estado ARCA.
    *   Implementar filtros rápidos y búsqueda por cliente.

### Ticket: 000014-ALEGRA-005 - Modal de Detalle Fiscal y Auditoría
*   **Objetivo:** Visualización detallada de la información contable y el rastro de auditoría.
*   **Tareas:**
    *   Mostrar metadatos: CAE, Vencimiento CAE, ítems detallados (`core.order_items`).
    *   Integrar visor de PDF o descarga directa desde el Storage.
    *   Sección de "Historial de API" consultando `logs.api_logs` para la orden vinculada.
    *   Acciones de "Compartir" (WhatsApp/Email).

### Ticket: 000015-ALEGRA-006 - Gestión de Órdenes Pendientes de Facturación
*   **Objetivo:** Permitir la emisión manual de facturas para ventas ya cobradas.
*   **Tareas:**
    *   Crear modal que liste órdenes en `core.orders` donde `status = 'PAID'` pero sin entrada en `core.invoices`.
    *   Botón de "Emitir Factura Electrónica" con validación previa de datos fiscales del cliente.
    *   Manejo de reintentos en caso de errores de la API Alegra.

### Ticket: 000016-ALEGRA-007 - Configuración de Credenciales y Automatización
*   **Objetivo:** Gestión segura de tokens y triggers de comportamiento.
*   **Tareas:**
    *   Utilizar `core.business_credentials` para almacenar el API Token de Alegra por negocio/cuenta.
    *   Actualizar la Edge Function para buscar credenciales dinámicamente según el `account_id`.
    *   Configurar el acceso a "Facturación" en el menú lateral y rutas de la SPA.
    *   Implementar toggle de "Facturación Automática" en `FacturacionConfig.jsx`.
