# Plan de Implementación: Integración Facturación TusFacturasApp (TFA) (rev00)
**Basado en:** Documentación TFA API, ERS PerPel y Script DB revA0.

---

### Análisis Técnico: Transición a TusFacturasApp (TFA)

1.  **Credenciales TFA:**
    *   **Valor 1 (Hardcoded):** `apikey` (Fija en la Edge Function).
    *   **Valor 2 (DB - `client_id`):** `usertoken` del negocio (Per tenant).
    *   **Valor 3 (DB - `access_token`):** `secret` o token adicional (Encriptado).
2.  **Esquema DB:**
    *   Mantener `ALEGRA` en el ENUM `external_api_name`.
    *   Añadir `TUS_FACTURAS_APP` al ENUM.
    *   Renombrar `alegra_contact_id` a `tfa_client_id` en `core.customers`.
    *   Renombrar `alegra_item_id` a `tfa_product_id` en `core.inventory_items`.
3.  **Storage:**
    *   Se mantiene el bucket `perpel_data` y la estructura `account_id/business_id/invoices/`.

---

### Plan de Migración: 5 Tickets (TusFacturasApp)

#### Ticket: 000017-TFA-001 - Limpieza y Preparación de DB
*   **Objetivo:** Eliminar Alegra y configurar el esquema para TFA.
*   **Tareas:**
    *   Eliminar físicamente los directorios `supabase/functions/alegra-invoice-generator` y `supabase/functions/alegra-pdf-proxy`.
    *   Crear migración SQL `20260302130000_switch_to_tfa.sql`:
        *   `ALTER TYPE public.external_api_name ADD VALUE IF NOT EXISTS 'TUS_FACTURAS_APP';`
        *   `ALTER TABLE core.customers RENAME COLUMN alegra_contact_id TO tfa_client_id;`
        *   `ALTER TABLE core.inventory_items RENAME COLUMN alegra_item_id TO tfa_product_id;`
    *   Actualizar manualmente (vía SQL) un registro en `core.business_credentials` con `api_name = 'TUS_FACTURAS_APP'` para pruebas.

#### Ticket: 000018-TFA-002 - Edge Function: `tfa-invoice-generator` (Auth & Client)
*   **Objetivo:** Implementar la base de la nueva función y el mapeo de clientes.
*   **Tareas:**
    *   Crear la función con Deno.
    *   Implementar recuperación y desencriptación de credenciales (`usertoken`, `secret`) desde `core.business_credentials`.
    *   Hardcodear `apikey` en la función.
    *   Implementar lógica `findOrCreateClientTFA(customer)` consumiendo `https://www.tusfacturas.app/app/api/v2/clientes/nuevo`.

#### Ticket: 000019-TFA-003 - TFA: Emisión de Comprobante AFIP
*   **Objetivo:** Construir el payload de facturación y obtener el CAE.
*   **Tareas:**
    *   Mapear ítems al formato TFA (`producto_nombre`, `cantidad`, `importe_unitario`, `alicuota_iva`).
    *   Enviar POST a `https://www.tusfacturas.app/app/api/v2/facturacion/nuevo_comprobante`.
    *   Extraer CAE, Vencimiento, Punto de Venta y Número.
    *   Registrar en `core.invoices` y `logs.api_logs`.

#### Ticket: 000020-TFA-004 - TFA: Almacenamiento de PDF y Storage
*   **Objetivo:** Capturar el documento visual generado por TFA.
*   **Tareas:**
    *   Obtener URL del PDF de la respuesta de TFA.
    *   Descargar el archivo y subirlo al bucket `perpel_data`.
    *   Actualizar `full_pdf_url` en la base de datos.

#### Ticket: 000021-TFA-005 - Frontend: Reconexión de Hook `useInvoices`
*   **Objetivo:** Apuntar el frontend a la nueva lógica de TFA.
*   **Tareas:**
    *   Actualizar `src/hooks/useInvoices.jsx` para invocar a `tfa-invoice-generator`.
    *   Verificar mapeo de campos de respuesta en la UI.
    *   Prueba integral: Venta -> Facturación -> Visualización PDF.
