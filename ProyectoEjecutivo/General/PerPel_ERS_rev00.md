# Documento de Especificación de Requerimientos (ERS) - Proyecto PerPel
**Versión: 1.0**
**Fecha: 2024-05-21**

## 1. Introducción

### 1.1. Propósito del Documento
El propósito de este documento es definir los requerimientos funcionales y no funcionales para el desarrollo de la aplicación frontend del proyecto "AppPerPel". Este ERS servirá como la fuente de verdad para el equipo de desarrollo, estableciendo un entendimiento común de lo que se debe construir.

### 1.2. Alcance del Proyecto
El proyecto consiste en una aplicación web progresiva (PWA) de tipo Single-Page Application (SPA) para la gestión integral de múltiples negocios (peluquerías y perfumerías) bajo un modelo multi-tenant por cuenta. La aplicación permitirá a los dueños (`OWNER`) y su personal (`EMPLOYEE`) gestionar e-commers, inventario, ventas, turnos, facturación y reportes, con soporte para operaciones offline y garantizando la trazabilidad de las acciones bajo los principios de la norma ISO 9000. La lógica del negocio está establecida en las relaciones y permisos RLS en el esquema del **ANEXO I**.

### 1.3. Definiciones, Acrónimos y Abreviaturas
*   **ERS:** Especificación de Requerimientos de Software.
*   **PWA:** Progressive Web App. Una aplicación web que ofrece una experiencia similar a una app nativa.
*   **SPA:** Single-Page Application. Una aplicación que carga una única página HTML y actualiza dinámicamente el contenido.
*   **API:** Application Programming Interface.
*   **BaaS:** Backend as a Service (ej. Supabase).
*   **RLS:** Row Level Security.
*   **KPI:** Key Performance Indicator. Indicador Clave de Rendimiento.

## 2. Descripción General

### 2.1. Perspectiva del Producto
PerPel es una solución de software como servicio (SaaS) diseñada para centralizar la gestión de múltiples locales comerciales. Su arquitectura headless, con un frontend SPA/PWA y un backend robusto en Supabase, garantiza una experiencia de usuario rápida, resiliente y accesible desde cualquier dispositivo (desktop o móvil Android).

### 2.2. Funcionalidades Principales
*   Gestión Multi-Cuenta y Multi-Negocio.
*   Dashboard de KPIs con vistas consolidadas e individuales.
*   Gestión de Inventario (productos y servicios).
*   Gestión de Stock por local.
*   Punto de Venta (POS) y E-commerce con procesamiento de pagos.
*   Gestión de Turnos online.
*   Generación de Facturas.
*   Gestión de Roles y Empleados.
*   Capacidad de operación Offline.

### 2.3. Perfiles de Usuario (Roles)
Los roles de usuario están definidos en la base de datos y determinarán los permisos en el frontend:
*   **OWNER:** Dueño de una cuenta. Tiene control total sobre todos sus negocios, empleados, reportes y configuración.
*   **ADMIN:** Rol administrativo con permisos similares al OWNER, pero que puede ser asignado por este.
*   **EMPLOYEE:** Personal de un negocio. Sus permisos están restringidos a los negocios a los que ha sido asignado. Puede gestionar ventas, stock y turnos.
*   **AUDITOR:** Rol de solo lectura para supervisar registros financieros y de auditoría.
*   **DEVELOPER:** Acceso total para fines de desarrollo y depuración.
*   **CLIENT:** (No es un rol de app, sino un usuario autenticado) Cliente final que puede registrarse, sacar turnos y realizar compras.

### 2.4. Restricciones Generales
*   El frontend debe ser una SPA construida con React y Vite.
*   La aplicación debe cumplir con los criterios para ser una PWA instalable.
*   La interfaz debe ser responsive y usable tanto en navegadores de escritorio como en dispositivos móviles. Mobile first.
*   Debe implementarse una estrategia de "offline-first" para garantizar la continuidad de las operaciones.

## 3. Requerimientos Específicos

### 3.1. Arquitectura y Stack Frontend

*   **Framework Principal:** **React 18+**
*   **Build Tool:** **Vite**
*   **Lenguaje:** **Javascript** (Recomendado para un proyecto de esta escala)
*   **UI / Estilos:** Se va a adoptar una librería de componentes robusta como **MUI (Material-UI)** que proveen componentes complejos (tablas, modales, formularios) ideales para un ERP. Buscar templates que se ajusten a nuestro proyecto y adaptarlos a los CRUD y reports que surgen del esquema propuesto en el **ANEXO I** de la DB en supabase.
*   **Gestión de Estado:** **Zustand**. Es una solución ligera y potente para gestionar el estado global (ej. datos del usuario autenticado, cuenta y negocio seleccionado). Usar un middleware llamado persist para que, si el usuario cierra la PWA en Android, al abrirla de nuevo sus datos (como los datos cargados o su sesión) sigan ahí.
*   **Routing:** **React Router**.
*   **Peticiones a APIs:** el `fetch` nativo o RCP para comunicarse con las Edge Functions de Supabase.

### 3.1.1 UI requerimientos para el diseño y codificación

Dado que es una PWA de una sola página (SPA) para un ERP, la clave es la gestión de estados para que el paso entre el Login y el Dashboard sea instantáneo.

1. Estructura Global (Shell de la PWA)
Describe el "contenedor" que persiste en toda la aplicación:

Layout: Un diseño responsivo con una barra lateral (Sidebar) colapsable a la izquierda y una barra superior (TopBar) fija.

Navegación: La Sidebar contiene iconos y etiquetas para: Ventas, E-commerce, Inventario, Facturación, Turnos, Clientes, Reportes y Configuración.

Tema: Minimalista, usando una paleta de colores profesional (ej. Azul marino #1e293b para la barra lateral y blanco humo #f8fafc para el fondo).

2. Flujo de Acceso (Sign-In / Sign-Up)
Como es una SPA, estas pantallas deben tratarse como modales a pantalla completa o vistas condicionales que bloquean el dashboard:

Sign-In (Inicio de Sesión):

Centro: Tarjeta (Card) blanca con sombra suave.

Campos: Email (Input con icono de sobre), Contraseña (Input con opción de "ver contraseña").

Acciones: Botón "Entrar" (color primario), enlace "Olvidé mi contraseña" y botón secundario "Crear cuenta".

Sign-Up (Registro):

Campos: Nombre de la empresa, Nombre del administrador, Email, Contraseña (con validador de seguridad).

Extra: Checkbox de "Acepto términos y condiciones".

3. El Dashboard (Vista Principal del ERP)
Divide esta sección en áreas funcionales de datos:

Sección de Resumen (Kpis):

Fila superior con 4 tarjetas pequeñas mostrando: Ventas Totales, Nuevos Clientes, Stock Crítico y Tareas Pendientes. Cada una con un indicador de porcentaje (subida/bajada).

Área de Gráficos:

Un gráfico de líneas principal que ocupe el 70% del ancho (Ventas vs Gastos).

Un gráfico de dona (Pie chart) al lado que muestre "Distribución de Inventario".

Tabla de Actividad Reciente:

Una tabla con las últimas 10 transacciones. Columnas: Fecha, Cliente, Estado (Etiquetas de color: Pagado/Pendiente) y Monto.

4. Comportamiento PWA y Experiencia de Usuario
Estado Offline: Banner discreto en la parte superior que indique "Modo sin conexión" si falla el internet.

Instalación: Botón en el perfil del usuario que invite a "Instalar App en el Escritorio/Móvil".

Carga: Uso de Skeletons (bloques grises animados) mientras los datos del ERP se sincronizan desde Supabase o la API.

### 3.2. Integración de APIs Externas

#### 3.2.1. Supabase (Backend principal)
*   **Librería Recomendada:** `@supabase/supabase-js`
*   **Uso:**
    *   **Autenticación:** Gestionar el registro, login (email/contraseña) y la sesión del usuario.
    *   **Acceso a Datos:** Realizar consultas a las tablas (`core.*`) y vistas (`reports.*`) utilizando el cliente de PostgREST. El RLS configurado en la base de datos garantizará la seguridad de los datos, se´gun **ANEXO I**.
    *   **Funciones Edge:** Invocar funciones serverless para lógica de negocio segura que no debe exponerse en el cliente (ej. crear preferencia de pago).

#### 3.2.2. MercadoPago o MP (Procesador de Pagos)
*   **Librería Recomendada:** `@mercadopago/sdk-react`
*   **Flujo de Pago:**
    1.  El frontend crea un registro en `core.orders` con el estado `PENDING`.
    2.  Invoca una Supabase Edge Function enviando el `order_id`.
    3.  La Edge Function se comunica con la API de MercadoPago para crear una "Preferencia de Pago" y almacena el `preference_id` devuelto en la tabla `core.orders`.
    4.  El frontend recibe el `preference_id` y muestra el botón de pago de MP y el checkout se realiza en MP.
    5.  Webhooks de MercadoPago notificarán a otra Edge Function para actualizar el estado del pago y la orden a `PAID`.

#### 3.2.3. Cal.com (Gestión de Turnos)
*   **Librería Recomendada:** No se requiere una librería específica. Se puede usar `<iframe>` o un componente web para embeber.
*   **Flujo de Turnos:**
    1.  El frontend embeberá la página de agendamiento de Cal.com del profesional o negocio correspondiente.
    2.  El cliente reserva su turno directamente en la interfaz de Cal.com.
    3.  Un **Webhook** configurado en Cal.com deberá apuntar a una Supabase Edge Function.
    4.  Cuando un turno se crea, reagenda o cancela, la Edge Function recibe la notificación y sincroniza la información en la tabla `core.appointments`, guardando el `external_cal_id`.
    5.  Enviando notificaciones push con las novedades al owner del negocio y/o al cliente según corresponda.

#### 3.2.4. OneSignal (Notificaciones Push)
*   **Librería Recomendada:** `react-onesignal` o el SDK web oficial.
*   **Flujo de Notificaciones:**
    1.  El frontend (PWA) solicitará al usuario permiso para recibir notificaciones.
    2.  Al aceptar, el SDK de OneSignal registrará al usuario y asociará su `player_id` con el `user_id` de la aplicación en la base de datos.
    3.  Para enviar notificaciones (ej. "Tu turno es en una hora"), una Supabase Edge Function (invocada por un trigger o un cron job) llamará a la API REST de OneSignal, dirigiéndose al `player_id` del usuario.

#### 3.2.5. Alegra, API de Facturación
*   **Librería Recomendada:** Recomendar 3 opciones y analaizarlas y preguntarme antes de definirla y crear código. 
*   **Flujo de Facturación:**
    1.  Un trigger en la base de datos (o una Edge Function) se activará cuando una orden en `core.orders` cambie su estado a `PAID`.
    2.  Esta función recopilará los datos de la orden y del cliente.
    3.  Llamará al endpoint correspondiente de la API de facturación externa para generar el comprobante.
    4.  El resultado (CAE, número de factura, PDF URL) se almacenará en la tabla `core.invoices`.
    5.  Se emitirá el comprobante de pago en PDF y se guardará el supabase store y se enviará por email al cliente.

#### 3.2.6 Recomendaciones generales para la generación de código para las API.

Arquitectura de servicios para tu proyecto React-Vite-MUI. La estrategia se basa en usar Edge Functions (Deno) para integraciones externas y RPC (PostgreSQL functions) para operaciones intensivas de datos internos.
ESR: Estrategia de Funciones Edge y RPC para Supabase

##### 3.2.6.1 MercadoPago (Pagos y Checkout)
1.  Enfoque: Seguridad transaccional y Webhooks.
2.  Edge Function para Checkout Pro: Generar la preference_id desde el servidor para evitar manipulación de precios en el cliente.
3.  Webhook Handler: Usar una Edge Function dedicada para recibir notificaciones de payment.created y merchant_order.
4.  Validación de Firma: Implementar la verificación de x-signature en la Edge Function para asegurar que el webhook provenga realmente de MercadoPago.
5.  RPC para Actualización de Inventario: Al recibir un pago exitoso, llamar a una RPC que descuente stock de forma atómica en PostgreSQL.
6.  Manejo de Idempotencia: Guardar el external_reference en una tabla de pagos para evitar procesar dos veces la misma transacción.
7.  Reintentos Automáticos: Configurar la Edge Function para devolver un error 500 si la DB falla, forzando a MercadoPago a reintentar el webhook.
8.  Logs de Auditoría: Registrar cada respuesta del SDK de MercadoPago en una tabla audit_logs mediante una RPC.
Botón de Pago Dinámico: En React, llamar a la Edge Function antes de renderizar el componente <Wallet /> de MUI para obtener el ID de preferencia.
9.  Manejo de Monedas: Centralizar la lógica de conversión de divisas en la Edge Function para mantener consistencia con el backend de Alegra.
10.  Seguridad de Tokens: Nunca exponer el ACCESS_TOKEN en el frontend; usar variables de entorno en el panel de Supabase.
##### 3.2.6.2 OneSignal (Notificaciones Push)
1.  Enfoque: Segmentación y triggers automatizados.
2.  RPC para Registro de PlayerID: Crear una función RPC que vincule el userId de Supabase con el subscriptionId de OneSignal.
3.  Edge Function "Push Dispatcher": Una función centralizada que reciba un JSON con mensaje y destinatario, y se comunique con la API de OneSignal.
4.  Database Triggers: Configurar un trigger en la tabla notifications que dispare una Edge Function cada vez que se inserte un registro.
5.  Segmentación por Roles: Usar la metadata del usuario de Supabase Auth para enviar notificaciones a segmentos específicos (ej. "admin", "cliente").
6.  Programación de Notificaciones: Usar el parámetro send_after de OneSignal desde la Edge Function para recordatorios futuros.
7.  Manejo de Errores de Delivery: Si OneSignal devuelve un error (ej. usuario desuscrito), llamar a una RPC para limpiar el ID inválido de la base de datos.
8.  Iconos y Badge dinámicos: Enviar la URL del icono o el número del badge calculado mediante una RPC previa al envío.
9.  Deep Linking: Configurar la URL de destino en el payload de la Edge Function para que el usuario abra una ruta específica en tu app Vite.
10. Testing Environment: Usar una variable de entorno para alternar entre el APP_ID de producción y el de desarrollo en las funciones.
11. Silent Push: Utilizar las funciones de borde para enviar datos en segundo plano sin mostrar una alerta visual al usuario.
###### 3.2.6.3 Cal.com (Agendamiento)
1.  Enfoque: Sincronización de eventos y disponibilidad.
2.  Edge Function para Reservas: Actuar como intermediario para crear "bookings" usando el API Key privado de Cal.com.
3.  Sincronización de Webhooks: Escuchar el evento BOOKING_CREATED para insertar la cita automáticamente en tu tabla de Supabase mediante RPC.
4.  Validación de Disponibilidad: Antes de confirmar una acción en la app, consultar a Cal.com vía Edge Function para verificar slots libres.
5.  UI de MUI sincronizada: Usar React Query para llamar a la Edge Function de Cal.com y poblar calendarios personalizados en MUI.
6.  Cancelaciones: Centralizar la lógica de cancelación en una Edge Function que notifique a Cal.com y actualice el estado en tu DB.
7.  Manejo de Timezones: Utilizar la librería Intl dentro de la Edge Function (Deno) para normalizar fechas antes de enviarlas a la API.
8.  Campos Personalizados: Mapear los responses del formulario de Cal.com a columnas específicas de tu base de datos mediante una función RPC.
9.  Enlace de Videollamada: Al recibir el webhook de éxito, extraer la URL de la reunión y enviarla por OneSignal mediante un flujo encadenado de funciones.
10. Metadata de Usuario: Pasar el supabase_user_id en los campos ocultos de Cal.com para identificar quién hizo la reserva al procesar el webhook.
11. Cache de Slots: Guardar temporalmente la disponibilidad en una tabla de Supabase para reducir llamadas repetitivas a la API externa.
##### 3.2.6.4 Alegra (Facturación y Contabilidad)
1.  Enfoque: Integridad de datos contables.
2.  Edge Function para Facturación: Generar la factura electrónica inmediatamente después de que la RPC de MercadoPago confirme el pago.
3.  Mapeo de Contactos: Crear una RPC que verifique si el cliente ya existe en Alegra por su NIT/RUT antes de crear un nuevo contacto.
4.  Sincronización de Items: Mantener los productos de tu DB en Supabase alineados con los IDs de items en Alegra mediante un cron job (Edge Function).
5.  Manejo de Impuestos: Configurar la lógica de cálculo de IVA en la Edge Function para evitar discrepancias con los cálculos de Alegra.
6.  Descarga de PDF: Crear un endpoint en la Edge Function que recupere el PDF de la factura desde Alegra y lo sirva al cliente en React.
7.  RPC de Validación de Stock: Consultar el inventario real en Alegra antes de permitir el checkout en el frontend.
8.  Notas de Crédito Automáticas: Si una orden se cancela en Supabase, disparar una Edge Function que genere la nota de crédito en Alegra.
9.  Queue de Errores: Si la API de Alegra está caída, guardar la petición en una tabla pending_invoices para reintentar luego con un Edge Cron.
10.  Consumo de API Key: Implementar autenticación Basic Auth de Alegra de forma segura dentro del entorno de Deno.
11.  Reportes: Usar funciones RPC para agrupar ventas por categoría y cruzarlas con los reportes contables obtenidos vía API.
##### 3.2.6.5 Supabase (Core & RPC)
1.  Enfoque: Optimización y seguridad interna.
2.  RPC sobre API REST: Priorizar el uso de supabase.rpc() para operaciones que involucren múltiples tablas para reducir el tráfico de red.
3.  Validación con RLS: Asegurar que todas las funciones RPC respeten las Row Level Security (security definer vs invoker).
4.  Filtros Complejos en SQL: Mover la lógica de filtrado pesado de React a una función RPC para aprovechar los índices de PostgreSQL.
5.  Edge Function Auth Hook: Usar funciones de borde para personalizar el token JWT o validar dominios de correo permitidos.
6.  Cifrado de Datos Sensibles: Usar la extensión pgcrypto dentro de las RPC para manejar datos que no deben ser legibles ni por administradores.
Deno Standard Library: Aprovechar las librerías nativas de Deno en tus Edge Functions para validaciones de esquema (Zod).
7.  CORS Configuration: Configurar correctamente los headers de CORS en las Edge Functions para que solo tu dominio de Vite pueda invocarlas.
8.  Pagination Server-side: Implementar la lógica de "limit" y "offset" dentro de RPCs para manejar grandes volúmenes de datos en DataGrids de MUI.
9.  Manejo de Archivos: Usar Edge Functions para procesar imágenes (resize) antes de subirlas al bucket de Supabase Storage.
10. Versionamiento: Incluir una cabecera de versión en tus Edge Functions para permitir transiciones suaves al actualizar la lógica de las APIs

### 3.3. Requerimientos No Funcionales

#### 3.3.1. PWA y Continuidad de Operaciones (Offline-First)
*   **Service Worker:** Se debe implementar un Service Worker para cachear los assets de la aplicación (app shell). Se recomienda usar `vite-plugin-pwa` para automatizar este proceso.
*   **Almacenamiento Local:** Se utilizará **RxDB** Dixie para almacenar localmente datos críticos para la operación offline (ej. lista de productos, precios, clientes). npm.cmd install rxdb @supabase/supabase-js rxjs @dexie/dexie-rxdb dexie

*   **Sincronización:**
    1.  Cuando la app esté offline, las mutaciones (crear una venta, actualizar stock) no se envían al servidor. En su lugar, se guardan en una cola local en IndexedDB.
    2.  Cuando la conexión se recupera, un proceso de sincronización lee la cola local y envía las operaciones a Supabase una por una, posiblemente a través de una Edge Function que gestione la lógica.
    3.  La tabla `core.offline_sync_queue` en el backend puede servir como registro y para manejar conflictos si es necesario.
    4.  El esquema de la DB a cincronizar con RxDB es el que viene adjunto a este archivo en sql, como **ANEXO I**.

#### 3.3.2. Trazabilidad y Normas ISO 9000
El frontend debe garantizar que **toda petición a la API de Supabase esté autenticada**. El cliente `@supabase/supabase-js` gestiona automáticamente el envío del JWT (JSON Web Token) del usuario logueado. Este token permite al backend:
1.  Identificar al usuario a través de `auth.uid()`.
2.  Aplicar las políticas de RLS correspondientes a su rol.
3.  Registrar en la tabla del esquema apara auditoria, a través de los triggers, qué usuario (`user_id`) realizó qué acción (`action`), sobre qué registro (`record_id`) y en qué momento (`timestamp`) y el resto de columnas que tenga definida la tabla en el esquema del **ANEXO I**.

Esto crea un rastro de auditoría completo para cada acción de escritura en la base de datos, cumpliendo con el principio de trazabilidad.

## 4. Apéndice: Diccionario de Datos (ENUMS)

A continuación se detalla el significado de cada opción en los `ENUMS` definidos en la base de datos.

*   **`public.app_role`**: Rol de un usuario dentro de la aplicación.
    *   `OWNER`: Dueño de la cuenta (tenant), máximo nivel de permiso.
    *   `ADMIN`: Administrador de la cuenta, con permisos delegados por el OWNER.
    *   `EMPLOYEE`: Empleado asignado a uno o más negocios.
    *   `AUDITOR`: Rol de solo lectura para supervisión.
    *   `DEVELOPER`: Acceso total para desarrollo.

*   **`public.business_type`**: Tipo de negocio.
    *   `SALON`: Peluquería.
    *   `PERFUMERY`: Perfumería.

*   **`public.item_type`**: Tipo de ítem en el inventario.
    *   `PRODUCT`: Un bien físico con stock (ej. un perfume).
    *   `SERVICE`: Un servicio que no tiene stock (ej. un corte de pelo).

*   **`public.order_status`**: Estado de una orden de compra.
    *   `PENDING`: La orden fue creada pero no pagada.
    *   `PAID`: La orden fue pagada exitosamente.
    *   `ABANDONED`: El cliente abandonó el checkout.
    *   `ERROR`: Ocurrió un error durante el proceso de pago.

*   **`public.appointment_status`**: Estado de un turno, combinando estados de Cal.com y estados internos.
    *   `SCHEDULED` / `ACCEPTED`: El turno está confirmado.
    *   `COMPLETED`: El servicio del turno fue prestado.
    *   `CANCELLED`: El turno fue cancelado.
    *   `NO_SHOW`: El cliente no se presentó al turno.
    *   `PENDING` / `AWAITING_HOST`: El turno está pendiente de confirmación.
    *   `REJECTED`: El turno fue rechazado.
    
*   **`public.item_status`**: Estado de un producto o servicio en el catálogo.
    *   `ACTIVE`: Visible y disponible para la venta o agendamiento.
    *   `INACTIVE`: Oculto de la vista pública pero no eliminado.
    *   `DISCONTINUE`: Producto o servicio que ya no se ofrecerá.

*   **`public.customer_doc_type`**: Códigos de AFIP para tipo de documento del cliente en una factura.
    *   `80`: CUIT.
    *   `96`: DNI.
    *   `99`: Consumidor Final.

*   **`public.cbte_tipo`**: Códigos de AFIP para tipo de comprobante.
    *   `1`: Factura A.
    *   `6`: Factura B.
    *   `11`: Factura C.

## 5. **ANEXO I**: Esquema de la base de datos completa en supabase

--Primero se ejecuta esto apra crear la DB casi completa y luego al final del archivo están las 3 RSL que faltan crear.

/************************************************************************************
 *                                                                                  *
 *   SCRIPT DE BASE DE DATOS v04 - ARQUITECTURA MULTI-TENANT POR CUENTA (SAAS)     *
 *                      (Versión Final, Completa y Explícita)                     *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

/******************************************************************************
 * PASO 1: DEFINICIONES GLOBALES (SCHEMAS, FUNCIONES Y ENUMS)
 ******************************************************************************/

-- SCHEMAS
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS logs;
CREATE SCHEMA IF NOT EXISTS reports;

-- FUNCIONES AUXILIARES Y DE AUDITORÍA
----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.log_changes()
RETURNS TRIGGER AS $$
DECLARE
  record_id_text TEXT;
  action_text TEXT;
  account_id_to_log UUID;
BEGIN
  action_text := TG_OP;
  
  IF (TG_OP = 'UPDATE') THEN
    record_id_text = NEW.id::TEXT;
    account_id_to_log := NEW.account_id;
    IF OLD.deleted = false AND NEW.deleted = true THEN
      action_text := 'SOFT_DELETE';
    END IF;
  ELSEIF (TG_OP = 'INSERT') THEN
    record_id_text = NEW.id::TEXT;
    account_id_to_log := NEW.account_id;
  ELSE -- DELETE
    record_id_text = OLD.id::TEXT;
    account_id_to_log := OLD.account_id;
  END IF;

  INSERT INTO logs.audit_log (user_id, account_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    account_id_to_log,
    action_text,
    TG_TABLE_NAME,
    record_id_text,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- TIPOS PERSONALIZADOS (ENUMS)
----------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('OWNER', 'ADMIN', 'EMPLOYEE', 'AUDITOR', 'DEVELOPER');
CREATE TYPE public.external_api_name AS ENUM ('MERCADOPAGO', 'ARCA', 'INVOICING_API', 'ONESIGNAL', 'CAL_COM');
CREATE TYPE public.business_type AS ENUM ('SALON', 'PERFUMERY');
CREATE TYPE public.item_type AS ENUM ('PRODUCT', 'SERVICE');
CREATE TYPE public.order_status AS ENUM ('PENDING', 'PAID', 'ABANDONED', 'ERROR');
CREATE TYPE public.payment_method AS ENUM ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'MERCADOPAGO_QR', 'MERCADOPAGO_ONLINE');
CREATE TYPE public.sync_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
CREATE TYPE public.appointment_status AS ENUM ('SCHEDULED', 'COMPLETED', 'NO_SHOW', 'PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'AWAITING_HOST');
CREATE TYPE public.user_category AS ENUM ('VIP', 'CASUAL', 'NEW', 'INACTIVE', 'ONTIME');
CREATE TYPE public.item_status AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUE');
CREATE TYPE public.customer_doc_type AS ENUM ('80', '96', '99');
CREATE TYPE public.cbte_tipo AS ENUM ('1', '6', '11');
CREATE TYPE public.arca_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ERROR');
CREATE TYPE public.category_scope AS ENUM ('SALON', 'PERFUMERY', 'ALL');
CREATE TYPE public.payment_status AS ENUM ('in_process', 'approved', 'rejected', 'cancelled');
CREATE TYPE public.payment_point_type AS ENUM ('online', 'point');
CREATE TYPE public.session_status AS ENUM ('OPEN', 'CLOSED');


/******************************************************************************
 * PASO 2: ESTRUCTURA DE TABLAS (AGRUPADO POR TABLA CON MULTI-TENANCY)
 ******************************************************************************/
---
--- TABLA: accounts
---
CREATE TABLE core.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  account_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE TRIGGER on_accounts_update BEFORE UPDATE ON core.accounts FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_accounts_changes AFTER INSERT OR UPDATE OR DELETE ON core.accounts FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.accounts ENABLE ROW LEVEL SECURITY; ALTER TABLE core.accounts FORCE ROW LEVEL SECURITY;
--CREATE POLICY "Dueños pueden ver y gestionar su propia cuenta" ON core.accounts FOR ALL USING (id = public.get_my_account_id() AND owner_user_id = auth.uid());
--CREATE POLICY "Acceso total para Desarrolladores" ON core.accounts FOR ALL USING (public.get_my_role() = 'DEVELOPER');

---
--- TABLA: user_profiles
---
CREATE TABLE core.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  app_role public.app_role,
  email TEXT,
  phone_number TEXT,
  street TEXT,
  city TEXT,
  state_prov TEXT,
  zip_code TEXT,
  country TEXT,
  dni TEXT,
  cuil_cuit TEXT,
  category public.user_category,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT name_length CHECK (char_length(full_name) > 0)
);
CREATE INDEX idx_profiles_account_role ON core.user_profiles(account_id, app_role);
CREATE UNIQUE INDEX idx_unique_active_user_dni ON core.user_profiles(account_id, dni) WHERE deleted = false;
CREATE UNIQUE INDEX idx_unique_active_user_cuil ON core.user_profiles(account_id, cuil_cuit) WHERE deleted = false;
CREATE TRIGGER on_profiles_update BEFORE UPDATE ON core.user_profiles FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_profiles_changes AFTER INSERT OR UPDATE OR DELETE ON core.user_profiles FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.user_profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE core.user_profiles FORCE ROW LEVEL SECURITY;
--CREATE POLICY "Usuarios solo acceden a perfiles de su propia cuenta" ON core.user_profiles FOR ALL USING (account_id = public.get_my_account_id());
CREATE POLICY "Usuarios pueden actualizar su propio perfil" ON core.user_profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- FUNCIONES DE SEGURIDAD PARA RLS ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_account_id()
RETURNS UUID AS $$
  SELECT account_id FROM core.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role AS $$
  SELECT app_role FROM core.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;


---
--- TABLA: businesses
---
CREATE TABLE core.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.business_type NOT NULL,
  email TEXT,
  phone_number TEXT,
  street TEXT,
  city TEXT,
  state_prov TEXT,
  zip_code TEXT,
  country TEXT,
  location_coords TEXT,
  tax_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT name_not_empty CHECK (char_length(name) > 0)
);
CREATE INDEX idx_businesses_account_id ON core.businesses(account_id);
CREATE TRIGGER on_businesses_update BEFORE UPDATE ON core.businesses FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_businesses_changes AFTER INSERT OR UPDATE OR DELETE ON core.businesses FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.businesses ENABLE ROW LEVEL SECURITY; ALTER TABLE core.businesses FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo acceden a negocios de su propia cuenta" ON core.businesses FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: employee_assignments
---
CREATE TABLE core.employee_assignments (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (account_id, user_id, business_id)
);
CREATE INDEX idx_assignments_account_user ON core.employee_assignments(account_id, user_id);
CREATE TRIGGER on_employee_assignments_update BEFORE UPDATE ON core.employee_assignments FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_employee_assignments_changes AFTER INSERT OR UPDATE OR DELETE ON core.employee_assignments FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.employee_assignments ENABLE ROW LEVEL SECURITY; ALTER TABLE core.employee_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo gestionan asignaciones de su cuenta" ON core.employee_assignments FOR ALL USING (account_id = public.get_my_account_id());

-- FUNCIONES DE SEGURIDAD PARA RLS ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_employee_of(business_id_to_check UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM core.employee_assignments
    WHERE user_id = auth.uid() 
      AND business_id = business_id_to_check 
      AND account_id = public.get_my_account_id()
      AND deleted = false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

---
--- TABLA: item_categories
---
CREATE TABLE core.item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  applies_to public.category_scope NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX idx_unique_active_item_category_name ON core.item_categories(account_id, name) WHERE deleted = false;
CREATE TRIGGER on_item_categories_update BEFORE UPDATE ON core.item_categories FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_item_categories_changes AFTER INSERT OR UPDATE OR DELETE ON core.item_categories FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.item_categories ENABLE ROW LEVEL SECURITY; ALTER TABLE core.item_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo gestionan categorias de su cuenta" ON core.item_categories FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: inventory_items
---
CREATE TABLE core.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  category_id UUID REFERENCES core.item_categories(id) ON DELETE SET NULL,
  item_type public.item_type NOT NULL,
  item_status public.item_status NOT NULL,
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  duration_minutes INT,
  cost_price NUMERIC(10, 2) DEFAULT 0,
  selling_price NUMERIC(10, 2) NOT NULL,
  is_for_sale BOOLEAN DEFAULT true,
  attributes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT selling_price_must_be_positive CHECK (selling_price > 0),
  CONSTRAINT cost_price_must_be_positive CHECK (cost_price >= 0),
  CONSTRAINT selling_price_vs_cost_check CHECK (selling_price >= cost_price),
  CONSTRAINT name_not_empty CHECK (char_length(name) > 0)
);
CREATE INDEX idx_items_account_name ON core.inventory_items(account_id, name);
CREATE UNIQUE INDEX idx_unique_active_inventory_item_sku ON core.inventory_items(account_id, sku) WHERE deleted = false;
CREATE TRIGGER on_items_update BEFORE UPDATE ON core.inventory_items FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_inventory_items_changes AFTER INSERT OR UPDATE OR DELETE ON core.inventory_items FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.inventory_items ENABLE ROW LEVEL SECURITY; ALTER TABLE core.inventory_items FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo gestionan items de su cuenta" ON core.inventory_items FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: stock_levels
---
CREATE TABLE core.stock_levels (
  item_id UUID NOT NULL REFERENCES core.inventory_items(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  quantity INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (account_id, item_id, business_id),
  CONSTRAINT quantity_must_be_non_negative CHECK (quantity >= 0)
);
CREATE TRIGGER on_stock_update BEFORE UPDATE ON core.stock_levels FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_stock_levels_changes AFTER INSERT OR UPDATE OR DELETE ON core.stock_levels FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.stock_levels ENABLE ROW LEVEL SECURITY; ALTER TABLE core.stock_levels FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo gestionan stock de su cuenta" ON core.stock_levels FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: appointments
---
CREATE TABLE core.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  external_cal_id TEXT,
  client_id UUID REFERENCES core.user_profiles(id),
  employee_id UUID REFERENCES core.user_profiles(id),
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  service_id UUID REFERENCES core.inventory_items(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  event_type_id INTEGER,
  service_notes TEXT,
  cancel_reason TEXT,
  status public.appointment_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT time_check CHECK (end_time > start_time)
);
CREATE UNIQUE INDEX idx_unique_active_appointment_cal_id ON core.appointments(account_id, external_cal_id) WHERE deleted = false;
CREATE INDEX idx_appointments_account_status_date ON core.appointments(account_id, status, start_time);
CREATE TRIGGER on_appointments_update BEFORE UPDATE ON core.appointments FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_appointments_changes AFTER INSERT OR UPDATE OR DELETE ON core.appointments FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.appointments ENABLE ROW LEVEL SECURITY; ALTER TABLE core.appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo gestionan turnos de su cuenta" ON core.appointments FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: orders
---
CREATE TABLE core.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id),
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  total_amount NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'ARS',
  status public.order_status NOT NULL DEFAULT 'PENDING',
  mercadopago_preference_id TEXT,
  customer_doc_type TEXT DEFAULT '99',
  customer_doc_number TEXT DEFAULT '0',
  customer_name TEXT DEFAULT 'Consumidor Final',
  iva_condition TEXT DEFAULT 'Consumidor Final',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_orders_account_status_date ON core.orders(account_id, status, created_at);
CREATE TRIGGER on_orders_update BEFORE UPDATE ON core.orders FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_orders_changes AFTER INSERT OR UPDATE OR DELETE ON core.orders FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.orders ENABLE ROW LEVEL SECURITY; ALTER TABLE core.orders FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo acceden a órdenes de su propia cuenta" ON core.orders FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: order_items
---
CREATE TABLE core.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES core.orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES core.inventory_items(id) ON DELETE RESTRICT,
  quantity INT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT quantity_must_be_positive CHECK (quantity > 0)
);
CREATE TRIGGER on_order_items_update BEFORE UPDATE ON core.order_items FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_order_items_changes AFTER INSERT OR UPDATE OR DELETE ON core.order_items FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.order_items ENABLE ROW LEVEL SECURITY; ALTER TABLE core.order_items FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo acceden a items de órdenes de su cuenta" ON core.order_items FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: invoices
---
CREATE TABLE core.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  order_id UUID UNIQUE REFERENCES core.orders(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES auth.users(id),
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  total_amount NUMERIC(19, 4) NOT NULL,
  arca_cae TEXT,
  arca_status public.arca_status,
  cae_vencimiento DATE,
  cbte_tipo public.cbte_tipo,
  punto_venta INTEGER,
  cbte_nro INTEGER,
  qr_link TEXT,
  full_pdf_url TEXT,
  is_printed BOOLEAN DEFAULT false,
  printed_at TIMESTAMPTZ,
  printer_id TEXT,
  fch_serv_desde DATE DEFAULT CURRENT_DATE,
  fch_serv_hasta DATE DEFAULT CURRENT_DATE,
  fch_serv_vto_pago DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX idx_unique_active_invoice_cae ON core.invoices(account_id, arca_cae) WHERE deleted = false;
CREATE TRIGGER on_invoices_update BEFORE UPDATE ON core.invoices FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_invoices_changes AFTER INSERT OR UPDATE OR DELETE ON core.invoices FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.invoices ENABLE ROW LEVEL SECURITY; ALTER TABLE core.invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo acceden a facturas de su cuenta" ON core.invoices FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: payments
---
CREATE TABLE core.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES core.orders(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  mp_payment_id TEXT,
  amount NUMERIC(19,4) NOT NULL,
  status public.payment_status NOT NULL,
  payment_type public.payment_point_type,
  payment_method_id TEXT,
  device_id TEXT,
  card_last_four TEXT,
  installments INTEGER DEFAULT 1,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT amount_is_positive CHECK (amount > 0)
);
CREATE INDEX idx_payments_account_order_id ON core.payments(account_id, order_id);
CREATE UNIQUE INDEX idx_unique_active_payment_mp_id ON core.payments(account_id, mp_payment_id) WHERE deleted = false;
CREATE TRIGGER on_payments_update BEFORE UPDATE ON core.payments FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_payments_changes AFTER INSERT OR UPDATE OR DELETE ON core.payments FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.payments ENABLE ROW LEVEL SECURITY; ALTER TABLE core.payments FORCE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios solo acceden a pagos de su cuenta" ON core.payments FOR ALL USING (account_id = public.get_my_account_id());

---
--- TABLA: cash_register_sessions
---
CREATE TABLE core.cash_register_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  opened_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  closed_by_user_id UUID REFERENCES auth.users(id),
  opening_balance NUMERIC(10, 2) NOT NULL,
  closing_balance NUMERIC(10, 2),
  calculated_cash_in NUMERIC(10, 2),
  status public.session_status NOT NULL DEFAULT 'OPEN',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT opening_balance_not_negative CHECK (opening_balance >= 0)
);
CREATE INDEX idx_cash_sessions_account_business_status ON core.cash_register_sessions(account_id, business_id, status);
CREATE TRIGGER on_cash_register_sessions_update BEFORE UPDATE ON core.cash_register_sessions FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_cash_register_sessions_changes AFTER INSERT OR UPDATE OR DELETE ON core.cash_register_sessions FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.cash_register_sessions ENABLE ROW LEVEL SECURITY; ALTER TABLE core.cash_register_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY "Empleados solo gestionan cajas de su cuenta" ON core.cash_register_sessions FOR ALL USING (account_id = public.get_my_account_id()) WITH CHECK (public.is_employee_of(business_id));

---
--- TABLA: api_logs (Schema: logs)
---
CREATE TABLE logs.api_logs (
  id BIGSERIAL PRIMARY KEY,
  account_id UUID REFERENCES core.accounts(id) ON DELETE SET NULL,
  api_name public.external_api_name NOT NULL,
  endpoint TEXT,
  order_id UUID REFERENCES core.orders(id) ON DELETE SET NULL,
  operation_name TEXT NOT NULL,
  correlation_id TEXT,
  request_payload JSONB,
  response_payload JSONB,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_apilogs_account_correlation ON logs.api_logs(account_id, correlation_id);
CREATE TRIGGER on_api_logs_update BEFORE UPDATE ON logs.api_logs FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_api_logs_changes AFTER INSERT OR UPDATE OR DELETE ON logs.api_logs FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE logs.api_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE logs.api_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY "Admins/Owners pueden ver logs de su cuenta" ON logs.api_logs FOR SELECT USING (account_id = public.get_my_account_id() AND public.get_my_role() IN ('ADMIN', 'OWNER'));
---
--- TABLA: offline_sync_queue (Schema: core)
---
CREATE TABLE core.offline_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  operation TEXT NOT NULL,
  payload JSONB NOT NULL,
  status public.sync_status NOT NULL DEFAULT 'PENDING',
  attempts INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE TRIGGER on_offline_sync_queue_update BEFORE UPDATE ON core.offline_sync_queue FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_offline_sync_queue_changes AFTER INSERT OR UPDATE OR DELETE ON core.offline_sync_queue FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
ALTER TABLE core.offline_sync_queue ENABLE ROW LEVEL SECURITY; ALTER TABLE core.offline_sync_queue FORCE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total para Desarrolladores" ON core.offline_sync_queue FOR ALL USING (public.get_my_role() = 'DEVELOPER');
CREATE POLICY "Admins/Owners ven la cola de sincronización" ON core.offline_sync_queue FOR SELECT USING (public.get_my_role() IN ('ADMIN', 'OWNER'));

---
--- TABLA: audit_log (Schema: logs)
---
CREATE TABLE logs.audit_log (
  id BIGSERIAL PRIMARY KEY,
  account_id UUID REFERENCES core.accounts(id) ON DELETE SET NULL,
  user_id UUID,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_audit_log_account_id ON logs.audit_log(account_id);
CREATE TRIGGER on_audit_log_update BEFORE UPDATE ON logs.audit_log FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
ALTER TABLE logs.audit_log ENABLE ROW LEVEL SECURITY; ALTER TABLE logs.audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY "Admins/Owners/Auditores pueden ver el audit log de su cuenta" ON logs.audit_log FOR SELECT USING (account_id = public.get_my_account_id() AND public.get_my_role() IN ('ADMIN', 'OWNER', 'AUDITOR'));

/******************************************************************************
 * PASO 3: PRECARGA DE DATOS
 ******************************************************************************/

-- La precarga de datos ahora debe estar asociada a una cuenta específica.
-- Esto se haría mediante una función Edge después de que un usuario se registre y cree su cuenta.
-- Ejemplo conceptual:
-- INSERT INTO core.item_categories (account_id, name, description, applies_to)
-- VALUES
--  ('el_id_de_la_nueva_cuenta', 'Fragancias', 'Perfumes...', 'PERFUMERY');
-- INSERT INTO core.item_categories (name, description, applies_to, deleted)
-- VALUES
--   ('Fragancias', 'Perfumes, colonias y aguas de tocador.', 'PERFUMERY', false),
--   ('Cuidado de la Piel', 'Cremas faciales, serums, limpiadores y mascarillas.', 'PERFUMERY', false),
--   ('Maquillaje', 'Bases, labiales, sombras, máscaras de pestañas.', 'PERFUMERY', false),
--   ('Cuidado Corporal', 'Cremas corporales, exfoliantes y aceites.', 'PERFUMERY', false),
--   ('Shampoos y Acondicionadores', 'Productos para el lavado y cuidado diario del cabello.', 'SALON', false),
--   ('Tratamientos Capilares', 'Mascarillas intensivas, ampollas y tratamientos de reconstrucción.', 'SALON', false),
--   ('Fijación y Estilizado', 'Geles, ceras, espumas, lacas y protectores térmicos.', 'SALON', false),
--   ('Coloración', 'Tinturas permanentes, semi-permanentes y tonalizadores.', 'SALON', false),
--   ('Herramientas de Estilizado', 'Secadores, planchas, rizadores y cepillos.', 'SALON', false),
--   ('Cuidado Capilar', 'Productos generales para el cabello que se venden en ambos negocios.', 'ALL', false),
--   ('Accesorios', 'Brochas, peines, hebillas y otros complementos.', 'ALL', false),
--   ('Kits y Promociones', 'Conjuntos de productos ofrecidos como un paquete.', 'ALL', false);


/******************************************************************************
 * PASO 4: VISTAS DE REPORTES (Schema: reports)
 ******************************************************************************/

--SQL Actualizado para las Vistas de Reportes (Multi-Tenant)

-- VISTA 1: Resumen Diario de Ventas (El Patrón)
-- Muestra el rendimiento de ventas por día, por negocio y por cuenta.
CREATE OR REPLACE VIEW reports.daily_sales_summary AS
SELECT
  o.account_id,
  DATE(o.created_at) AS report_date,
  o.business_id,
  b.name AS business_name,
  SUM(o.total_amount) AS total_sales,
  COUNT(o.id) AS order_count,
  AVG(o.total_amount) AS average_order_value
FROM
  core.orders AS o
  JOIN core.businesses AS b ON o.business_id = b.id
WHERE
  o.status = 'PAID' AND o.deleted = false AND b.deleted = false
GROUP BY
  o.account_id,
  report_date,
  o.business_id,
  b.name;


-- VISTA 2: Rendimiento de Productos y Servicios
-- Analiza qué ítems son los más vendidos, segregado por cuenta y negocio.
CREATE OR REPLACE VIEW reports.product_performance AS
SELECT
  o.account_id,
  o.business_id,
  b.name AS business_name,
  ii.id AS item_id,
  ii.name AS item_name,
  ii.item_type,
  SUM(oi.quantity) AS total_quantity_sold,
  SUM(oi.quantity * oi.unit_price) AS total_revenue
FROM
  core.order_items AS oi
  JOIN core.inventory_items AS ii ON oi.item_id = ii.id
  JOIN core.orders AS o ON oi.order_id = o.id
  JOIN core.businesses AS b ON o.business_id = b.id
WHERE
  o.status = 'PAID' AND oi.deleted = false AND ii.deleted = false AND o.deleted = false AND b.deleted = false
GROUP BY
  o.account_id,
  o.business_id,
  b.name,
  ii.id;


-- VISTA 3: Niveles de Inventario Actual
-- Provee una vista rápida del stock actual, segregado por cuenta y negocio.
CREATE OR REPLACE VIEW reports.current_inventory_levels AS
SELECT
  sl.account_id,
  sl.business_id,
  b.name AS business_name,
  sl.item_id,
  ii.name AS item_name,
  ii.sku,
  sl.quantity AS current_quantity
FROM
  core.stock_levels AS sl
  JOIN core.inventory_items AS ii ON sl.item_id = ii.id
  JOIN core.businesses AS b ON sl.business_id = b.id
WHERE
  sl.deleted = false AND ii.deleted = false AND b.deleted = false;


-- VISTA 4: Actividad y Valor de Clientes
-- Identifica a los clientes más valiosos por gasto y frecuencia, dentro de cada cuenta.
CREATE OR REPLACE VIEW reports.customer_activity AS
SELECT
  o.account_id,
  o.client_id,
  up.full_name AS client_name,
  up.email AS client_email,
  SUM(o.total_amount) AS total_spent,
  COUNT(o.id) AS order_count,
  MIN(o.created_at) AS first_order_date,
  MAX(o.created_at) AS last_order_date
FROM
  core.orders AS o
  JOIN core.user_profiles AS up ON o.client_id = up.id
WHERE
  o.status = 'PAID' AND o.deleted = false AND up.deleted = false
GROUP BY
  o.account_id,
  o.client_id,
  up.full_name,
  up.email;


-- VISTA 5: Rendimiento de Empleados por Servicios
-- Mide los servicios completados y los ingresos por empleado, dentro de cada cuenta y negocio.
CREATE OR REPLACE VIEW reports.employee_service_performance AS
SELECT
  a.account_id,
  a.business_id,
  b.name AS business_name,
  a.employee_id,
  up.full_name AS employee_name,
  COUNT(a.id) AS completed_services,
  SUM(ii.selling_price) AS total_revenue_from_services
FROM
  core.appointments AS a
  JOIN core.inventory_items AS ii ON a.service_id = ii.id
  JOIN core.user_profiles AS up ON a.employee_id = up.id
  JOIN core.businesses AS b ON a.business_id = b.id
WHERE
  a.status = 'COMPLETED' AND a.deleted = false AND ii.deleted = false AND up.deleted = false AND b.deleted = false
GROUP BY
  a.account_id,
  a.business_id,
  b.name,
  a.employee_id,
  up.full_name;


-- VISTA 6: Vista Consolidada General por Cuenta ("Fuente de Verdad")
-- Ofrece una fila con los KPIs totales por cada cuenta (tenant).
CREATE OR REPLACE VIEW reports.consolidated_business_snapshot AS
SELECT
  a.id AS account_id,
  a.account_name,
  (SELECT SUM(o.total_amount) FROM core.orders o WHERE o.status = 'PAID' AND o.deleted = false AND o.account_id = a.id) AS total_revenue,
  (SELECT COUNT(o.id) FROM core.orders o WHERE o.status = 'PAID' AND o.deleted = false AND o.account_id = a.id) AS total_orders,
  (SELECT COUNT(DISTINCT o.client_id) FROM core.orders o WHERE o.status = 'PAID' AND o.deleted = false AND o.account_id = a.id) AS
total_active_customers,
  (SELECT SUM(oi.quantity) FROM core.order_items oi WHERE oi.deleted = false AND oi.account_id = a.id) AS total_items_sold,
  (SELECT COUNT(ap.id) FROM core.appointments ap WHERE ap.status = 'COMPLETED' AND ap.deleted = false AND ap.account_id = a.id) AS
total_completed_appointments
FROM
  core.accounts AS a
WHERE
  a.deleted = false;

COMMIT;

--Final primer tamo de código para crear la DB.
------------------------------------------------------------------//-----------------------------------------------------------

--Estas tres RSL se ejecutan al final, luego de generar las tablas necesarias en la DB:

CREATE POLICY "Usuarios solo acceden a perfiles de su propia cuenta" ON core.user_profiles FOR ALL USING (account_id = public.get_my_account_id());
CREATE POLICY "Dueños pueden ver y gestionar su propia cuenta" ON core.accounts FOR ALL USING (id = public.get_my_account_id() AND owner_user_id = auth.uid());
CREATE POLICY "Acceso total para Desarrolladores" ON core.accounts FOR ALL USING (public.get_my_role() = 'DEVELOPER');