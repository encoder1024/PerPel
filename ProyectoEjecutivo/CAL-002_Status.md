# CAL-002 - Estado y Checklist (OAuth Cal.com por sucursal)

Fecha: 2026-02-27

## Backend (Edge Functions Cal.com)
- `supabase/functions/calcom-oauth-start/index.ts`
  - Genera URL OAuth con `state=calcom:<credentialId>`.
  - Valida `credentialId` contra `account_id` del usuario.
- `supabase/functions/calcom-oauth/index.ts`
  - Intercambia `code` por tokens y los guarda en `core.business_credentials`.
  - Valida `credentialId` contra `account_id` del usuario.
- `supabase/functions/calcom-token-refresh/index.ts`
  - Refresca tokens Cal.com con `refresh_token`.

## Frontend
- `src/pages/configuration/CredentialsConfig.jsx`
  - Botón “Vincular Cal.com” (usa `calcom-oauth-start`).
  - MP ahora usa `state=mp:<id>`.
- `src/pages/configuration/OAuthCallback.jsx`
  - Detecta proveedor por prefijo en `state` y llama la función correcta.
  - Manejo básico de `error` en query.

## Pendiente de verificación
- Confirmar endpoint OAuth de Cal.com (authorize/token/refresh) con documentación oficial.
  - Se usó:
    - Authorize: `https://app.cal.com/auth/oauth2/authorize`
    - Token: `https://app.cal.com/api/auth/oauth/token`
    - Refresh: `https://app.cal.com/api/auth/oauth/refreshToken`

