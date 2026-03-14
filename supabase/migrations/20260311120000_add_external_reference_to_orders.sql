/*****************************************************************************************
 * MIGRACIÓN: 20260311120000_add_external_reference_to_orders.sql                      *
 * Añade la columna external_reference a la tabla de órdenes para trazar pedidos        *
 * provenientes de APIs externas (Tiendanube, Mercado Pago, etc.).                      *
 *****************************************************************************************/

BEGIN;

ALTER TABLE core.orders 
ADD COLUMN IF NOT EXISTS external_reference TEXT;

-- Índice para mejorar el rendimiento de las consultas de deduplicación
CREATE INDEX IF NOT EXISTS idx_orders_external_ref ON core.orders(external_reference);

COMMIT;
