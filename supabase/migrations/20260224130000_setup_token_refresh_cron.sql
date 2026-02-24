/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260224130000_setup_token_refresh_cron.sql                        *
 *   FASE 5: CONFIGURACIÓN DE CRON JOB PARA RENOVACIÓN AUTOMÁTICA DE TOKENS        *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- Habilitar la extensión pg_cron si no está activa
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Crear Función SQL que invoca la Edge Function para cada account_id
CREATE OR REPLACE FUNCTION core.run_token_refresh_for_all_accounts()
RETURNS VOID AS $$
DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE 'Iniciando cron job de refresco de tokens para todas las cuentas.';

    -- Recorrer todas las cuentas activas
    FOR r IN SELECT id FROM core.accounts WHERE is_deleted = false LOOP
        RAISE NOTICE 'Invocando token-refresher para account_id: %', r.id;

        -- Invocar la Edge Function 'token-refresher' de forma segura
        -- IMPORTANTE: Esta es una invocación interna segura dentro de Supabase
        PERFORM supabase_functions.invoke('token-refresher', json_build_object('accountId', r.id)::json, '{"headers":{"Content-Type":"application/json"}}');
        
        -- Considerar un pequeño delay si hay muchas cuentas para evitar picos
        PERFORM pg_sleep(0.05); -- 50 ms de pausa
    END LOOP;

    RAISE NOTICE 'Cron job de refresco de tokens finalizado.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Asegurar que solo service_role pueda ejecutar esta función (por si acaso)
REVOKE ALL ON FUNCTION core.run_token_refresh_for_all_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.run_token_refresh_for_all_accounts() TO service_role;
GRANT EXECUTE ON FUNCTION core.run_token_refresh_for_all_accounts() TO postgres;

-- 3. Programar la ejecución con pg_cron
-- El job se ejecutará cada día a las 03:00 AM (UTC)
SELECT cron.schedule(
    'daily-token-refresh',      -- Nombre único para el job
    '0 3 * * *',                -- Cron string: Cada día a las 3 AM (UTC)
    'SELECT core.run_token_refresh_for_all_accounts();' -- La función a ejecutar
);

-- Opcional: Para desprogramar un job (si necesitas reiniciar o cambiar la hora)
-- SELECT cron.unschedule('daily-token-refresh');

COMMIT;
