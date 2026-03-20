Este es un plan de ejecuciÃ³n modular y secuencial diseÃ±ado especÃ­ficamente para trabajar con un agente de IA. Para evitar la saturaciÃ³n de tokens y garantizar un cÃ³digo de alta calidad, dividiremos el proyecto AppPerPel en "Sprints de Componentes AtÃ³micos".

Cada paso termina con una validaciÃ³n funcional. El orden respeta la arquitectura Offline-First y la integraciÃ³n con Supabase definida en tu ERS.

# Fase 1: Base de Infraestructura y AutenticaciÃ³n
Objetivo: Tener la estructura de archivos y el sistema de acceso funcionando.

## Paso 1.1: Estructura y ConfiguraciÃ³n Inicial
Tarea: Configurar el proyecto Vite + React + MUI.

Instrucciones para la IA: "Genera el archivo vite.config.js, package.json con las dependencias necesarias (MUI, Zustand, Supabase, React Router, RxDB) y el archivo de configuraciÃ³n de temas de MUI siguiendo la paleta #1e293b."

Entregable: Proyecto base que corre en local.

## Paso 1.2: Cliente de Supabase y Auth Store (Zustand)
Tarea: Implementar el cliente de conexiÃ³n y la gestiÃ³n de estado de sesiÃ³n.

Instrucciones para la IA: "Crea src/supabaseClient.js y un store de Zustand en src/contexts/authStore.js que gestione el login, logout y persista el perfil del usuario (app_role y account_id) recuperado de la tabla core.user_profiles."

Entregable: Hook useAuth funcional.

# Fase 2: Shell de la AplicaciÃ³n (UI Base)
Objetivo: Implementar el contenedor visual que describe el ERS.

## Paso 2.1: Layout Persistente (Sidebar & TopBar)
Tarea: Crear el Shell responsivo.

Instrucciones para la IA: "DiseÃ±a un componente MainLayout usando MUI. Debe incluir un Mini-Drawer (Sidebar colapsable) con los iconos del ERP y una AppBar que muestre el nombre del negocio actual y el perfil del usuario."

Entregable: Estructura visual navegable.

## Paso 2.2: Pantallas de Acceso (Modales SPA)
Tarea: Crear Sign-In y Sign-Up segÃºn los requerimientos de diseÃ±o del ERS.

Instrucciones para la IA: "Crea los componentes SignIn y SignUp como vistas condicionales. El SignUp debe permitir registrar la empresa y el administrador simultÃ¡neamente."

Entregable: Flujo de entrada completo.

# Fase 3: Capa de Datos Offline-First (RxDB)
Objetivo: Preparar la app para funcionar sin internet.

## Paso 3.1: ConfiguraciÃ³n de RxDB y Esquemas
Tarea: Inicializar la base de datos local basada en el Anexo I.

Instrucciones para la IA: "Configura RxDB en src/services/db.js. Define los esquemas para inventory_items y stock_levels reflejando la estructura SQL del Anexo I para permitir operaciones offline."

Entregable: Base de datos IndexedDB lista.

## Paso 3.2: Middleware de SincronizaciÃ³n
Tarea: Crear la cola de sincronizaciÃ³n.

Instrucciones para la IA: "Implementa un servicio que detecte la conexiÃ³n a internet. Si estÃ¡ offline, debe guardar las ventas en core.offline_sync_queue (Local). Al recuperar conexiÃ³n, debe ejecutar las peticiones pendientes a Supabase."

Entregable: Trazabilidad de operaciones offline.

# Fase 4: Core Business Logic (Sprints por MÃ³dulo)
Dividimos por roles para no saturar el contexto.

## Paso 4.1: MÃ³dulo de Inventario y Stock (Admin/Owner)
Tarea: CRUD de productos y servicios.

Instrucciones para la IA: "Crea una vista de tabla avanzada usando Mui-DataGrid para core.inventory_items. Debe incluir filtros por item_type y un modal para ediciÃ³n de precios y SKU."

## Paso 4.2: Punto de Venta (POS) y Ã“rdenes
Tarea: Interfaz de ventas rÃ¡pida.

Instrucciones para la IA: "DiseÃ±a una interfaz de venta (POS). SelecciÃ³n de productos, cÃ¡lculo de IVA segÃºn customer_doc_type y botÃ³n de pago que dispare la creaciÃ³n de una core.orders."

# Fase 5: Integraciones de Terceros (Edge Functions)
Objetivo: Conectar con APIs externas descritas en el ERS (MercadoPago, Cal.com y TusFacturasAPP).

## Paso 5.1: MÃ³dulo de Pagos (MercadoPago)
Tarea: Integrar el botÃ³n de pago dinÃ¡mico.

Instrucciones para la IA: "Crea un componente PaymentGateway que llame a la Edge Function de Supabase para obtener el preference_id y renderice el CheckOut Pro de MercadoPago."

## Paso 5.2: Agendamiento (Cal.com)
Tarea: Embeber y sincronizar turnos.

Instrucciones para la IA: "Implementa el embed de Cal.com en src/pages/common/Appointments.jsx y explica cÃ³mo configurar el Webhook para que impacte en core.appointments."


## Paso 5.3: Facturación electrónica (TusFacturasAPP)
Tarea: Integrar la emisión de comprobantes desde órdenes pagadas.

Instrucciones para la IA: "Implementa un servicio de facturación que invoque una Edge Function de Supabase para enviar order_id a TusFacturasAPP, persistir respuesta (CAE, número de comprobante, PDF URL) en core.invoices y registrar errores en logs.api_logs para reintentos."
# Fase 6: Dashboard de KPIs y Reportes
Objetivo: La "Fuente de Verdad" visual para el OWNER.

## Paso 6.1: Tablero de Control
Tarea: Implementar la vista basada en las vistas de PostgreSQL del Anexo I.

Instrucciones para la IA: "Genera el Dashboard principal. Usa Recharts para el grÃ¡fico de Ventas vs Gastos y tarjetas de MUI para los KPIs (total_revenue, stock_critico) consumiendo la vista reports.consolidated_business_snapshot."

# Fase 7: PWA y AuditorÃ­a ISO 9000
Objetivo: Cumplimiento de normas y despliegue.

## Paso 7.1: Service Worker y Manifiesto
Tarea: Hacer la app instalable.

Instrucciones para la IA: "Configura vite-plugin-pwa para generar el manifiesto y el service worker. Asegura que todos los assets de public/assets se guarden en cachÃ© para uso offline."

## Paso 7.2: Logs de AuditorÃ­a
Tarea: VisualizaciÃ³n de trazabilidad.

Instrucciones para la IA: "Crea una vista para el rol AUDITOR que consuma logs.audit_log para mostrar quiÃ©n hizo quÃ© cambio en el sistema."
