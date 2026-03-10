/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260310120000_tn_stock_sync_trigger.sql                           *
 *   TICKET: 0033-TIN-0004 - SINCRONIZACIÓN DE STOCK EN TIEMPO REAL                *
 *   ESTRATEGIA: ACCESO SEGURO A SECRETOS VÍA VAULT E INVOCACIÓN HTTP              *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- 1. Asegurar extensiones para seguridad y red
CREATE EXTENSION IF NOT EXISTS pgsodium;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Función del Trigger con Acceso Dinámico a Secretos
CREATE OR REPLACE FUNCTION core.tr_sync_stock_to_tiendanube()
RETURNS TRIGGER AS $$
DECLARE
    v_is_linked BOOLEAN;
    v_supabase_url TEXT;
    v_service_role_key TEXT;
BEGIN
    -- Verificar si el item está vinculado a Tiendanube
    SELECT EXISTS (
        SELECT 1 FROM core.inventory_items_tn 
        WHERE item_id = NEW.item_id 
          AND is_deleted = false 
          AND tn_product_id IS NOT NULL
    ) INTO v_is_linked;

    -- Solo disparar si la cantidad cambió y el producto está vinculado
    IF (OLD.quantity IS DISTINCT FROM NEW.quantity) AND v_is_linked THEN
        
        -- RECUPERAR SECRETOS DINÁMICAMENTE
        -- Opción A: Intentar desde settings internos de Supabase
        v_supabase_url := current_setting('app.settings.supabase_url', true);
        v_service_role_key := current_setting('app.settings.service_role_key', true);

        -- Opción B: Si las variables están en el Vault (Práctica recomendada)
        IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
            SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1 INTO v_supabase_url;
        END IF;
        
        IF v_service_role_key IS NULL OR v_service_role_key = '' THEN
            SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1 INTO v_service_role_key;
        END IF;

        -- Invocación mediante pg_net (Asíncrono)
        PERFORM net.http_post(
            url := v_supabase_url || '/functions/v1/tn-stock-sync',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_service_role_key
            ),
            body := jsonb_build_object(
                'itemId', NEW.item_id,
                'businessId', NEW.business_id,
                'newQuantity', NEW.quantity
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Permisos de Ejecución
REVOKE ALL ON FUNCTION core.tr_sync_stock_to_tiendanube() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.tr_sync_stock_to_tiendanube() TO service_role;
GRANT EXECUTE ON FUNCTION core.tr_sync_stock_to_tiendanube() TO postgres;

-- 4. Crear el Trigger en la tabla stock_levels
DROP TRIGGER IF EXISTS tr_stock_levels_tn_sync ON core.stock_levels;
CREATE TRIGGER tr_stock_levels_tn_sync
AFTER UPDATE ON core.stock_levels
FOR EACH ROW
EXECUTE FUNCTION core.tr_sync_stock_to_tiendanube();

COMMIT;