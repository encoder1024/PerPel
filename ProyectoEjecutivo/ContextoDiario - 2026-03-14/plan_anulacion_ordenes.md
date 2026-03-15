# Plan de Implementación: Anulación de Órdenes Pendientes

**Fecha:** 2026-03-14
**Objetivo:** Implementar la funcionalidad para anular órdenes pendientes de facturación, liberando el stock correspondiente y notificando a sistemas externos (Tiendanube) si es necesario.

---

### Ticket 1: Backend - Creación de la Función Principal de Orquestación

**Tarea:** Crear una nueva función RPC (Remote Procedure Call) en Supabase llamada `cancel_order(order_id UUID)`.

**Descripción:**
Esta será la función principal que orquestará todo el proceso de cancelación.
1.  Recibirá como parámetro el `order_id` de la orden a cancelar.
2.  Buscará la orden en la base de datos para obtener sus detalles, incluyendo su `origen` (`LOCAL` o `TIENDANUBE`) y sus `order_items`.
3.  Cambiará el `status` de la orden en la tabla `core.orders` a `'CANCELLED'`.
4.  Llamará a la lógica de liberación de stock (definida en el Ticket 3).
5.  Si el `origen` es `TIENDANUBE`, invocará a la función Edge `tn-cancel-order` (definida en el Ticket 2).

**Entregable:** Una función SQL `cancel_order` en la base de datos lista para ser llamada desde el frontend.

---

### Ticket 2: Backend - Integración para Notificar a Tiendanube

**Tarea:** Crear una nueva Supabase Edge Function llamada `tn-cancel-order`.

**Descripción:**
Esta función se encargará exclusivamente de la comunicación con la API de Tiendanube.
1.  Recibirá el `order_id` de la base de datos interna.
2.  Buscará el ID externo de la orden de Tiendanube (que debería estar almacenado en la tabla `core.orders`).
3.  Realizará una llamada a la API de Tiendanube para cancelar la orden en su plataforma.
4.  Manejará las respuestas de la API de Tiendanube, registrando si la cancelación fue exitosa o si hubo un error.

**Entregable:** Una Edge Function `tn-cancel-order` desplegada en Supabase.

---

### Ticket 3: Backend - Lógica para Liberación de Stock

**Tarea:** Asegurar que la liberación de stock reservado funcione correctamente.

**Descripción:**
Esta tarea se centra en la correcta manipulación del inventario.
1.  La función `cancel_order` (del Ticket 1) iterará sobre cada `order_item` de la orden cancelada.
2.  Para cada ítem, determinará la cantidad que fue reservada originalmente.
3.  Llamará a la función existente `public.adjust_stock` para crear un nuevo movimiento de tipo `RESERVE_IN` (o un tipo similar para devoluciones). Esto sumará la cantidad de vuelta al stock disponible.
4.  Se revisará la función `adjust_stock` para confirmar que maneja adecuadamente este nuevo tipo de movimiento de reingreso.

**Entregable:** Lógica de negocio robusta en el backend que garantiza la correcta devolución de stock al inventario.

---

### Ticket 4: Frontend - Añadir Botón de Cancelación en la Interfaz

**Tarea:** Modificar el modal de "Órdenes Pendientes de Facturar" en el componente `Reports.jsx`.

**Descripción:**
1.  Localizar la tabla que muestra las órdenes pendientes en el modal que se abre al hacer clic en el KPI "Pendiente Facturar".
2.  Añadir una nueva columna a la tabla con un botón de acción (ej. un icono de "cancelar" o "papelera") en cada fila.
3.  Al hacer clic en el botón, se deberá mostrar un diálogo de confirmación simple, como: `"¿Estás seguro de que deseas anular esta orden? Esta acción no se puede deshacer."`

**Entregable:** Cambios visuales en `src/pages/audit/Reports.jsx` con el nuevo botón y el diálogo de confirmación.

---

### Ticket 5: Frontend - Conectar la Interfaz con el Backend

**Tarea:** Implementar la lógica en el frontend para llamar a la función de cancelación.

**Descripción:**
1.  Crear una nueva función asíncrona `cancelOrder(orderId)` dentro del hook `useReports.js`.
2.  Cuando el usuario confirme la cancelación en el diálogo (del Ticket 4), se llamará a esta función.
3.  La función `cancelOrder` ejecutará la llamada a la RPC de Supabase: `supabase.rpc('cancel_order', { order_id: orderId })`.
4.  Implementará un manejo de estados de carga (loading) y mostrará notificaciones de éxito (`"Orden anulada con éxito"`) o error.
5.  Tras una cancelación exitosa, se deberá refrescar la lista de órdenes pendientes para que la orden cancelada desaparezca del modal.

**Entregable:** Funcionalidad completa de cancelación de órdenes iniciada desde el frontend.
