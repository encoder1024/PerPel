# Reporte de Estado de Proyecto: Integración Tiendanube
**Fecha:** 11 de marzo de 2026
**Ubicación:** ProyectoEjecutivo/Status_20260311_Tiendanube.md

## 1. Resumen de Avances (Fase 5 - E-commerce)

Se ha completado con éxito el flujo de autenticación y sincronización base. La aplicación ahora puede comunicarse bidireccionalmente con Tiendanube de forma dinámica.

### Hitos Alcanzados:
*   **OAuth Flow ERP-Tiendanube:** Implementado mediante Edge Functions (`tn-oauth-start` y `tn-oauth-callback`). El ERP genera el `code` y lo intercambia por un `access_token` permanente, configurando automáticamente los webhooks en la tienda.
*   **Gestión Dinámica de Credenciales:** La tabla `core.business_credentials` almacena secretos encriptados que son consumidos por las Edge Functions de forma segura.
*   **Monitor de Sincronización (Dashboard):** Página `/ecommerce` operativa. Permite visualizar productos, su estado de sincronización y realizar exportaciones/actualizaciones manuales.
*   **Sincronización de Stock en Tiempo Real:** Configurada mediante triggers en la DB que invocan a la EF `tn-stock-sync` ante cualquier cambio de stock en el ERP.
*   **Procesamiento de Pedidos (Webhooks):** Recepción y procesamiento automático de órdenes (`order/created`, `order/paid`). Los pedidos impactan en el ERP, crean clientes y descuentan stock.

---

## 2. Detalle del Ticket 0035: Facturación Automática (TFA)

**Objetivo:** Generar legalmente la factura electrónica en la AFIP a través de TusFacturasApp (TFA) de forma automática al detectarse el pago de una orden en Tiendanube.

### Estrategia de Implementación:

#### Fase A: Enriquecimiento de Datos Fiscales
Tiendanube no siempre garantiza los datos necesarios para una factura A o B (CUIT/DNI).
*   **Captura de Identificación:** Modificar el procesador de webhooks para extraer `customer.identification` y guardarlo en la columna `identification_number` de `core.customers`.
*   **Normalización de Condición IVA:** Determinar si el cliente es "Consumidor Final" (DNI) o "Responsable Inscripto" (CUIT) según la longitud del número de identificación recibido.

#### Fase B: Disparo de Facturación
*   **Trigger de Automatización:** En el `tn-webhook-processor`, tras confirmar el pago (`order.paid`), se realizará una invocación interna a la Edge Function `tfa-invoice-generator`.
*   **Lógica de Negocio (Defaults):**
    *   **Tipo de Comprobante:** Por defecto "Factura B" (6) para Tiendanube, a menos que el cliente posea CUIT y solicite Factura A.
    *   **Punto de Venta:** Utilizar el punto de venta configurado para E-commerce en el negocio.
    *   **Condición de Pago:** Siempre "Contado" (1) para ventas online pagadas.

#### Fase C: Persistencia y Trazabilidad
*   **Registro en ERP:** La factura generada se guardará en `core.invoices` con su CAE y vencimiento.
*   **Almacenamiento de PDF:** El PDF devuelto por TFA se descargará y subirá a Supabase Storage (`perpel_data`) para que esté disponible en el historial de órdenes del cliente.
*   **Notificación:** (Opcional) Envío automático del PDF al email del cliente capturado en el webhook.

#### Fase D: Control de Usuario (UI)
*   **Selector de Automatización:** Agregar en `ECommerceConfig.jsx` un switch por sucursal: "Facturación Automática de Pedidos Online".
*   **Monitor de Facturas:** En el dashboard de E-commerce, añadir una columna que muestre el número de factura y un link al PDF si ya fue generada.

---

## 3. Estado de los Tickets (Sprint Tiendanube)

| ID | Tarea | Estado |
| :--- | :--- | :--- |
| 0030 | Extensión de Esquema DB | **COMPLETADO** |
| 0031 | Gestión de Credenciales (OAuth) | **COMPLETADO** |
| 0032 | Exportación de Productos | **COMPLETADO** |
| 0033 | Sincronización de Stock | **COMPLETADO** |
| 0034 | Webhook Handler (Órdenes) | **COMPLETADO** |
| 0035 | Facturación Automática (TFA) | **PENDIENTE** |
| 0036 | Monitor de E-commerce | **COMPLETADO** |

---
**Próxima acción:** Implementar la captura de datos fiscales en el procesador de webhooks y conectar con el motor de TFA.
