# Cal.com Webhook (Edge Function)

## Endpoint
`/functions/v1/calcom-webhook`

## Método
`POST`

## Seguridad
Si defines `CALCOM_WEBHOOK_SECRET`, la función exige el header:
```
x-calcom-secret: <tu_secret>
```
Si no está definido, no se valida secreto.

## Variables de entorno
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CALCOM_WEBHOOK_SECRET` (opcional)

## Eventos soportados
- `BOOKING_CREATED` → `SCHEDULED`
- `BOOKING_RESCHEDULED` → `RESCHEDULED`
- `BOOKING_CANCELLED` → `CANCELLED`
- `BOOKING_NO_SHOW` → `NO_SHOW`

## Payload esperado (mínimo)
```json
{
  "triggerEvent": "BOOKING_CREATED",
  "payload": {
    "id": "cal_event_id",
    "startTime": "2026-02-27T12:00:00.000Z",
    "endTime": "2026-02-27T12:30:00.000Z",
    "metadata": {
      "business_id": "uuid-del-negocio",
      "account_id": "uuid-de-la-cuenta",
      "supabase_user_id": "uuid-del-cliente",
      "service_id": "uuid-del-servicio"
    }
  }
}
```

## Comportamiento
- Resuelve `account_id` desde:
  - `metadata.account_id`
  - o `metadata.supabase_user_id`
  - o `business_id`.
- Upsert en `core.appointments` por `(account_id, external_cal_id)`.
- Log en `logs.api_logs` con `api_name = CAL_COM`.

