# Plan de Mejora: Tablas de Reportes con Filtrado y Ordenamiento

**Fecha:** 2026-03-14
**Objetivo:** Migrar la tabla de detalles de los 5 reportes principales al componente `DataGrid` para permitir que el usuario ordene y filtre por cualquier columna.

---

### Ticket 1: Reporte de Facturación (Ventas por Facturación)
**Tarea:** Implementar `DataGrid` para los detalles de Facturación.
- **Columnas a configurar:** 
    - Fecha (Ordenable por fecha real).
    - Concepto (Nro de Factura).
    - Origen (Chip filtrable: LOCAL/TIENDANUBE).
    - Monto (Tipo numérico para ordenamiento correcto).
- **Acción:** Modificar el mapeo de datos en `useReports.js` para asegurar que el monto sea numérico y no solo un string formateado.

---

### Ticket 2: Reporte de Productos (Ventas por Producto)
**Tarea:** Implementar `DataGrid` para los detalles de Productos.
- **Columnas a configurar:** 
    - SKU.
    - Nombre del Producto.
    - Origen (Desglose de cantidades L vs TN).
    - Monto Total (Ventas acumuladas en el período).
- **Funcionalidad:** Permitir identificar rápidamente qué productos generaron más ingresos mediante el ordenamiento de la columna "Monto".

---

### Ticket 3: Reporte de Órdenes (Estado y Conversión)
**Tarea:** Implementar `DataGrid` para los detalles de Órdenes.
- **Columnas a configurar:** 
    - Fecha.
    - Cliente (Nombre completo).
    - Origen y Estado (Ej: TIENDANUBE - PAID).
    - Monto de la Orden.
- **Filtros:** Añadir filtro rápido por estado (PAID, PENDING, CANCELLED) directamente en la cabecera de la columna.

---

### Ticket 4: Reporte de Stock (Movimientos de Stock)
**Tarea:** Implementar `DataGrid` para los detalles de Movimientos de Stock.
- **Columnas a configurar:** 
    - Fecha y Hora.
    - Concepto (Nombre del ítem + Razón del movimiento).
    - Tipo de Movimiento (Chip de color: SALE_OUT, RETURN_IN, etc.).
    - Cantidad (Cambio positivo/negativo).
- **Ordenamiento:** Permitir ordenar por "Cantidad" para ver los ajustes más grandes realizados.

---

### Ticket 5: Reporte de Auditoría (Auditoría de Sistema)
**Tarea:** Implementar `DataGrid` para los detalles de Auditoría.
- **Columnas a configurar:** 
    - Fecha y Hora.
    - Acción y Tabla (Ej: UPDATE en core.orders).
    - Usuario (Nombre del responsable).
    - Business (Persistido recientemente en los logs).
- **Filtrado Avanzado:** Implementar el filtrado por la nueva columna `business_id` para que el auditor pueda ver cambios de una sucursal específica.
