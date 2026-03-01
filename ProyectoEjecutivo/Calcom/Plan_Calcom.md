# Plan de Implementación Cal.com (5 Fases)

Fecha: 2026-02-27

Este plan define el trabajo backend + frontend para integrar Cal.com con OAuth por sucursal (`business_id`), sincronización de turnos y soporte offline-first.  
Restricción: cada API debe tener funciones exclusivas (no reutilizar funciones de MercadoPago).

---

## Fase 1: Modelo de datos y contratos
Objetivo: Base sólida multi-tenant por sucursal.

Backend (DB)
- Confirmar/crear tablas:
  - `core.business_credentials` (tokens OAuth).
  - `core.business_asign_credentials` (asignación credencial ↔ business_id).
  - `core.appointments` (con `external_cal_id`, `status`, `start_time`, `end_time`, `business_id`, `employee_id`, `account_id`).
  - `core.offline_sync_queue`.
- Definir mapping de estados Cal.com → ERP:
  - `BOOKING_CREATED` → `SCHEDULED`
  - `BOOKING_RESCHEDULED` → `RESCHEDULED`
  - `BOOKING_CANCELLED` → `CANCELLED`
  - `BOOKING_NO_SHOW` → `NO_SHOW`
- Revisar índices y RLS para `appointments`.

Frontend
- Definir esquema RxDB para `appointments` con `external_cal_id`, `status`, `start_time`, `end_time`, `business_id`.

Entregable: esquema actualizado + mapping de estados.

---

## Fase 2: OAuth por sucursal (Cal.com)
Objetivo: Conectar cada `business_id` a su cuenta Cal.com.

Backend (Edge Functions exclusivas Cal.com)
- `cal_oauth_start`: genera URL OAuth con `state` = `credential_id` o `business_id`.
- `cal_oauth_callback`: intercambia `code` → tokens y guarda en `core.business_credentials`.
- `cal_token_refresh`: refresco automático del token.

Frontend
- UI en configuración (similar a MP) exclusiva para Cal.com.
- Botón “Conectar Cal.com” por sucursal.

Entregable: vínculo OAuth funcionando por sucursal.

---

## Fase 3: Webhooks Cal.com → Supabase
Objetivo: Sincronizar eventos Cal.com hacia `core.appointments`.

Backend
- Edge Function `cal_webhook` dedicada.
- Validación de firma / secret.
- Manejo de eventos:
  - `BOOKING_CREATED`
  - `BOOKING_RESCHEDULED`
  - `BOOKING_CANCELLED`
  - `BOOKING_NO_SHOW`
- Guardar/actualizar en `core.appointments`.
- Log en `logs.api_logs`.

Frontend
- Vista de turnos mostrando últimos cambios.

Entregable: DB se actualiza automáticamente con eventos Cal.com.

---

## Fase 4: Offline-first (RxDB)
Objetivo: Turnos accesibles sin internet.

Frontend
- Colección RxDB `appointments`.
- Extender `syncService` para `appointments`.
- Si no hay internet, registrar turnos en RxDB y encolar en `offline_sync_queue`.

Backend
- Edge Function `cal_booking_create` para crear reservas remotas al volver la conexión.

Entregable: turnos offline + sincronización deferred.

---

## Fase 5: UX + notificaciones (OneSignal)
Objetivo: Experiencia sin spam de avisos.

Backend
- Notificar solo OWNER/ADMIN.
- Evitar duplicar si Cal.com ya envía email (flag en preferencias).
- Disparadores por evento clave.

Frontend
- Preferencias de notificación por tipo de evento.

Entregable: alertas controladas y coherentes.

---

# Arquitectura modular simple para 5 APIs

Principio: cada API en módulos aislados, compartiendo únicamente:
- `core.business_credentials`
- `core.business_asign_credentials`
- `logs.api_logs`

Estructura sugerida:
```
/supabase/functions/
  cal_oauth_start/
  cal_oauth_callback/
  cal_webhook/
  cal_booking_create/

  mp_oauth_callback/
  mp_webhook/
  mp_point_intent/

  alegra_invoice_create/
  alegra_sync_items/

  onesignal_dispatch/

  mercadoshops_sync/
```

Reglas
- Cada API escribe solo su dominio lógico.
- No se reutilizan funciones entre APIs.
- Logs unificados en `logs.api_logs`.

