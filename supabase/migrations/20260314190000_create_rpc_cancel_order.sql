-- Ticket 1: Backend - Orquestación de Anulación de Órdenes
-- Este script crea la función RPC para cancelar órdenes y manejar la devolución de stock.

-- 1. Añadimos un nuevo tipo de movimiento para las devoluciones por cancelación
-- Nota: En PostgreSQL los ENUMs no se pueden modificar dentro de una transacción fácilmente,
-- pero para mayor compatibilidad usamos una técnica segura.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'stock_movement_type' AND e.enumlabel = 'CANCEL_RETURN') THEN
        ALTER TYPE public.stock_movement_type ADD VALUE 'CANCEL_RETURN';
    END IF;
END $$;

-- 2. Función principal para cancelar la orden
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_order_record RECORD;
    v_item_record RECORD;
    v_account_id UUID;
    v_business_id UUID;
    v_adjust_result JSONB;
    v_items_count INT := 0;
BEGIN
    -- Obtener datos básicos de la orden
    SELECT * INTO v_order_record 
    FROM core.orders 
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Orden no encontrada.');
    END IF;

    IF v_order_record.status = 'CANCELLED' THEN
        RETURN jsonb_build_object('status', 'success', 'message', 'La orden ya se encuentra anulada.');
    END IF;

    v_account_id := v_order_record.account_id;
    v_business_id := v_order_record.business_id;

    -- Iniciar proceso de anulación
    -- Ticket 3: Iterar sobre ítems para liberar stock
    FOR v_item_record IN (
        SELECT item_id, quantity 
        FROM core.order_items 
        WHERE order_id = p_order_id AND is_deleted = false
    ) LOOP
        v_items_count := v_items_count + 1;
        
        -- Llamamos a la función existente adjust_stock
        -- IMPORTANTE: quantity es positivo para devolver al stock
        v_adjust_result := public.adjust_stock(
            v_item_record.item_id,
            v_business_id,
            v_account_id,
            v_item_record.quantity, -- Cantidad positiva para sumar
            'CANCEL_RETURN',
            format('Anulación de orden #%s', substr(p_order_id::text, 1, 8))
        );

        IF (v_adjust_result->>'status') = 'error' THEN
            RAISE EXCEPTION 'Error al devolver stock para el ítem %: %', v_item_record.item_id, v_adjust_result->>'message';
        END IF;
    END LOOP;

    -- Caso especial: si v_items_count es 0, la función simplemente continúa sin fallar (tu requerimiento).

    -- Actualizar el estado de la orden
    UPDATE core.orders 
    SET status = 'CANCELLED',
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Retornar éxito con resumen
    RETURN jsonb_build_object(
        'status', 'success', 
        'message', 'Orden anulada correctamente.', 
        'items_reverted', v_items_count,
        'origin', v_order_record.origin
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permisos
GRANT EXECUTE ON FUNCTION public.cancel_order TO authenticated;
