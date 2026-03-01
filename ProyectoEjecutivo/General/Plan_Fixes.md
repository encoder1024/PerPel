# Plan de Fixes (7 Branches)

Fecha: 2026-02-26

Este documento resume el plan priorizado de fixes por branch. El grupo **chore/auth-loading-stability** ya fue resuelto en esta sesión.

## Orden recomendado
1) fix/schema-sync-is_deleted  
2) fix/mp-multitenant-tokens  
3) fix/mp-webhook-data-shape  
4) fix/pwa-assets-and-css  
5) fix/routes-navigation-gaps  
6) fix/appointments-core-schema  
7) chore/auth-loading-stability (RESUELTO)

---

## 1) fix/schema-sync-is_deleted
Objetivo: evitar fallos offline y consolidar soft-delete.

Archivos probables:
- src/services/syncService.js
- src/hooks/useInventory.js
- src/services/db.js
- src/hooks/usePOS.js
- src/hooks/useStock.js
- src/hooks/useDashboard.js

Acciones:
- Usar `.schema('core')` en operaciones encoladas (INSERT/UPDATE/DELETE).
- Unificar uso de `is_deleted` (eliminar `deleted`).
- Alinear mapeo Supabase ↔ RxDB.

---

## 2) fix/mp-multitenant-tokens
Objetivo: MercadoPago multi-tenant real (token por cuenta/sucursal).

Archivos probables:
- src/components/common/create_mp_preference.ts
- src/components/common/mercadopago_webhook.ts
- src/pages/configuration/VentasConfig.jsx
- src/pages/configuration/CredentialsConfig.jsx
- src/components/common/PaymentGateway.jsx

Acciones:
- Eliminar uso de `MP_ACCESS_TOKEN` global.
- Resolver token desde `core.business_credentials` según `account_id` y asignación.
- Enviar `business_id` o `credential_id` al backend.

---

## 3) fix/mp-webhook-data-shape
Objetivo: corregir errores lógicos y duplicados en webhook.

Archivos probables:
- src/components/common/mercadopago_webhook.ts

Acciones:
- Usar `.single()` donde corresponde.
- `account_id` correcto (no array).
- Idempotencia por `mp_payment_id`.
- Validar estado antes de actualizar órdenes.

---

## 4) fix/pwa-assets-and-css
Objetivo: PWA estable + UI base correcta.

Archivos probables:
- vite.config.js
- public/*
- src/index.css

Acciones:
- Agregar íconos PWA reales o ajustar manifest.
- Quitar estilos del template que rompen layout.

---

## 5) fix/routes-navigation-gaps
Objetivo: evitar rutas muertas o confusas.

Archivos probables:
- src/App.jsx
- src/utils/navigation.jsx
- src/pages/*

Acciones:
- Crear placeholders o rutas reales para /ecommerce, /facturacion, /clientes.
- Diferenciar “Reportes” vs “Auditoría”.

---

## 6) fix/appointments-core-schema
Objetivo: queries consistentes en schema core.

Archivos probables:
- src/pages/appointments/Appointments.jsx

Acciones:
- Cambiar a `.schema('core')` y ajustar joins.

---

## 7) chore/auth-loading-stability (RESUELTO)
Objetivo: estabilidad de auth y loading.

Archivos tocados:
- src/components/auth/AuthProvider.jsx
- src/components/auth/ProtectedRoute.jsx
- src/stores/authStore.js
- src/pages/auth/SignIn.jsx
- src/services/supabaseClient.js
- src/App.jsx

Acciones realizadas:
- `authReady` para evitar redirecciones prematuras.
- Tolerancia a refresh de token y loading no bloqueante.
- Persistencia explícita de sesión en Supabase.
- Timeout de seguridad corto.
- Loading local en SignIn.

