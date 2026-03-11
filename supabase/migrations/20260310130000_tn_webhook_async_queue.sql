/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260310130000_tn_webhook_async_queue.sql                          *
 *   TICKET: 0034-TIN-0005 - PROCESAMIENTO ASÍNCRONO DE WEBHOOKS                   *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- 1. Crear tabla de cola para Webhooks
CREATE TABLE IF NOT EXISTS logs.tiendanube_webhook_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL, -- order.created, order.paid, etc.
    store_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'ERROR')),
    error_log TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- 2. Función para disparar el procesamiento (vía Edge Function interna)
CREATE OR REPLACE FUNCTION logs.tr_process_tn_webhook()
RETURNS TRIGGER AS $$
BEGIN
    -- Invocamos una nueva EF especializada en el procesamiento pesado
    -- Esto se hace de forma asíncrona para no bloquear el INSERT
    PERFORM net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/tn-webhook-processor',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
        ),
        body := jsonb_build_object('queue_id', NEW.id)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger para activar el procesamiento tras el guardado
DROP TRIGGER IF EXISTS tr_tn_webhook_insertion ON logs.tiendanube_webhook_queue;
CREATE TRIGGER tr_tn_webhook_insertion
AFTER INSERT ON logs.tiendanube_webhook_queue
FOR EACH ROW
EXECUTE FUNCTION logs.tr_process_tn_webhook();

COMMIT;
