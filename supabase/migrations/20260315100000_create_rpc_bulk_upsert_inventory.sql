-- Ticket 2: Backend - Función de Carga Masiva de Inventario
-- Esta función procesa un JSON proveniente del Excel mapeando columnas locales y de Tiendanube.

CREATE OR REPLACE FUNCTION public.bulk_upsert_inventory_items(
    p_items JSONB,
    p_account_id UUID,
    p_business_id UUID,
    p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    item_record JSONB;
    v_item_id UUID;
    v_is_new BOOLEAN;
    v_created_count INT := 0;
    v_updated_count INT := 0;
    v_tn_count INT := 0;
    v_stock_count INT := 0;
    v_adjust_result JSONB;
BEGIN
    -- Iterar sobre cada item del array JSON
    FOR item_record IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_is_new := FALSE;
        
        -- 1. Buscar si el SKU ya existe en la cuenta
        SELECT id INTO v_item_id 
        FROM core.inventory_items 
        WHERE sku = (item_record->>'SKU') 
          AND account_id = p_account_id 
          AND is_deleted = false;

        IF v_item_id IS NULL THEN
            v_is_new := TRUE;
            v_item_id := gen_random_uuid();
            
            -- 2. Inserción en core.inventory_items (NUEVO)
            INSERT INTO core.inventory_items (
                id, account_id, created_by, item_type, item_status, 
                sku, name, description, cost_price, selling_price
            ) VALUES (
                v_item_id, p_account_id, p_user_id, 'PRODUCT', 'ACTIVE',
                item_record->>'SKU', 
                item_record->>'Nombre', 
                COALESCE(item_record->>'Descripción', ''),
                COALESCE((item_record->>'Costo')::NUMERIC, 0),
                COALESCE((item_record->>'Precio')::NUMERIC, 0)
            );
            v_created_count := v_created_count + 1;
        ELSE
            -- 3. Actualización en core.inventory_items (EXISTENTE)
            UPDATE core.inventory_items SET
                name = COALESCE(item_record->>'Nombre', name),
                description = COALESCE(item_record->>'Descripción', description),
                cost_price = COALESCE((item_record->>'Costo')::NUMERIC, cost_price),
                selling_price = COALESCE((item_record->>'Precio')::NUMERIC, selling_price),
                updated_at = NOW()
            WHERE id = v_item_id;
            v_updated_count := v_updated_count + 1;
        END IF;

        -- 4. Registrar STOCK INICIAL si es nuevo y tiene cantidad > 0
        IF v_is_new AND (item_record->>'Stock')::INT > 0 THEN
            v_adjust_result := public.adjust_stock(
                v_item_id,
                p_business_id,
                p_account_id,
                (item_record->>'Stock')::INT,
                'INITIAL_STOCK',
                'Carga Masiva desde Excel',
                p_user_id
            );
            IF (v_adjust_result->>'status') = 'success' THEN
                v_stock_count := v_stock_count + 1;
            END IF;
        END IF;

        -- 5. Lógica de Tiendanube (Si está marcado con "SI")
        IF UPPER(item_record->>'Mostrar en tienda') = 'SI' THEN
            -- Inserción/Actualización de Metadatos TN
            INSERT INTO core.inventory_items_tn (
                item_id, account_id, business_id, handle, brand, published
            ) VALUES (
                v_item_id, p_account_id, p_business_id, 
                item_record->>'Identificador de URL', 
                item_record->>'Marca', 
                true
            ) ON CONFLICT (item_id) DO UPDATE SET
                handle = EXCLUDED.handle,
                brand = EXCLUDED.brand,
                updated_at = NOW();

            -- Inserción/Actualización de Variantes TN (Detalles técnicos y SEO)
            INSERT INTO core.tiendanube_item_variants (
                item_id, account_id, business_id,
                identificador_de_url, nombre, categorias, sku, 
                mostrar_en_tienda, descripcion, tags, 
                titulo_para_seo, descripcion_para_seo, marca,
                precio, costo, stock, peso_kg, 
                alto_cm, ancho_cm, profundidad_cm
            ) VALUES (
                v_item_id, p_account_id, p_business_id,
                item_record->>'Identificador de URL',
                item_record->>'Nombre',
                item_record->>'Categorías',
                item_record->>'SKU',
                true,
                item_record->>'Descripción',
                item_record->>'Tags',
                item_record->>'Título para SEO',
                item_record->>'Descripción para SEO',
                item_record->>'Marca',
                (item_record->>'Precio')::NUMERIC,
                (item_record->>'Costo')::NUMERIC,
                (item_record->>'Stock')::INT,
                (item_record->>'Peso (kg)')::NUMERIC,
                (item_record->>'Alto (cm)')::NUMERIC,
                (item_record->>'Ancho (cm)')::NUMERIC,
                (item_record->>'Profundidad (cm)')::NUMERIC
            ) ON CONFLICT (item_id) DO UPDATE SET
                precio = EXCLUDED.precio,
                costo = EXCLUDED.costo,
                stock = EXCLUDED.stock,
                updated_at = NOW();
            
            v_tn_count := v_tn_count + 1;
        END IF;

    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'created', v_created_count,
        'updated', v_updated_count,
        'tn_linked', v_tn_count,
        'stock_initialised', v_stock_count
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permisos
GRANT EXECUTE ON FUNCTION public.bulk_upsert_inventory_items TO authenticated;
