-- Ticket 2: Backend - Top 10 Rotación de Stock por Producto
-- Esta función calcula la rotación individual para cada producto y devuelve los 10 mejores.

CREATE OR REPLACE FUNCTION public.get_top_stock_turnover(
    p_business_id UUID, -- NULL para 'ALL'
    p_account_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    item_id UUID,
    item_name TEXT,
    sku TEXT,
    units_moved NUMERIC,
    start_stock NUMERIC,
    end_stock NUMERIC,
    turnover_pct NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH item_list AS (
        -- Obtenemos la lista de productos que tienen stock registrado en la cuenta/sucursal
        SELECT DISTINCT sl.item_id, ii.name, ii.sku
        FROM core.stock_levels sl
        JOIN core.inventory_items ii ON sl.item_id = ii.id
        WHERE sl.account_id = p_account_id 
          AND (p_business_id IS NULL OR sl.business_id = p_business_id) 
          AND sl.is_deleted = false
    ),
    item_stats AS (
        -- Calculamos las unidades movidas y los niveles de stock para cada ítem
        SELECT 
            il.item_id,
            il.name,
            il.sku,
            COALESCE((
                SELECT SUM(ABS(sm.quantity_change))::NUMERIC
                FROM core.stock_movements sm
                WHERE sm.item_id = il.item_id
                  AND sm.account_id = p_account_id
                  AND (p_business_id IS NULL OR sm.business_id = p_business_id)
                  AND sm.quantity_change < 0
                  AND sm.created_at >= p_start_date::TIMESTAMPTZ 
                  AND sm.created_at < (p_end_date + interval '1 day')::TIMESTAMPTZ
            ), 0) as units_out,
            public.get_stock_at_time(il.item_id, p_business_id, p_account_id, p_start_date::TIMESTAMPTZ) as s_stock,
            public.get_stock_at_time(il.item_id, p_business_id, p_account_id, (p_end_date + interval '1 day')::TIMESTAMPTZ) as e_stock
        FROM item_list il
    )
    SELECT 
        stats.item_id,
        stats.name,
        stats.sku,
        stats.units_out,
        stats.s_stock,
        stats.e_stock,
        CASE 
            WHEN (stats.s_stock + stats.e_stock) > 0 THEN 
                ROUND((stats.units_out / ((stats.s_stock + stats.e_stock) / 2.0)) * 100.0, 2)
            ELSE 0 
        END as pct
    FROM item_stats stats
    WHERE stats.units_out > 0 -- Solo nos interesan productos que tuvieron movimiento
    ORDER BY pct DESC, stats.units_out DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Permisos
GRANT EXECUTE ON FUNCTION public.get_top_stock_turnover TO authenticated;
