/*****************************************************************************************
 * MIGRACIÓN: 20260311110000_add_resource_id_to_webhook_queue.sql                      *
 * Añade la columna resource_id para identificar el objeto afectado (ej. Order ID)      *
 * y facilitar la deduplicación e idempotencia.                                         *
 *****************************************************************************************/

BEGIN;

ALTER TABLE logs.tiendanube_webhook_queue 
ADD COLUMN IF NOT EXISTS resource_id TEXT;

-- Índice para búsquedas rápidas de deduplicación
CREATE INDEX IF NOT EXISTS idx_tn_webhook_resource_id ON logs.tiendanube_webhook_queue(resource_id, event_type, store_id);

COMMIT;
