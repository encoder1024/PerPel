# CAL-TR-001 - Contrato Refresh Token (Cal.com)

Fecha: 2026-02-27

## Objetivo
Definir el contrato de refresh de tokens OAuth de Cal.com para pruebas y validaciones.

## Endpoints OAuth (oficiales)
1) Authorization URL
   - `https://app.cal.com/auth/oauth2/authorize`

2) Access Token Request
   - `POST https://app.cal.com/api/auth/oauth/token`
   - Body:
     - `code`
     - `client_id`
     - `client_secret`
     - `grant_type=authorization_code`
     - `redirect_uri`
   - Response esperado:
     - `access_token`
     - `refresh_token`

3) Refresh Token Request
   - `POST https://app.cal.com/api/auth/oauth/refreshToken`
   - Headers:
     - `Authorization: Bearer <refresh_token>`
   - Body:
     - `grant_type=refresh_token`
     - `client_id`
     - `client_secret`
   - Response esperado:
     - `access_token`
     - `refresh_token`

## Notas de implementación actual
- `supabase/functions/calcom-oauth/index.ts` usa `https://api.cal.com/v2/auth/oauth2/token` con JSON.
- `supabase/functions/calcom-token-refresh/index.ts` usa el endpoint de refresh de `app.cal.com` con `x-www-form-urlencoded` y `Authorization: Bearer <refresh_token>`.

## Casos de error esperados (para tests)
- `401/400` por `refresh_token` inválido.
- `401/400` por `client_id` o `client_secret` inválidos.
- `5xx` por caída del servicio.

## Acciones pendientes
- Confirmar si el token exchange debe unificarse a `app.cal.com` o mantener `api.cal.com/v2`.
