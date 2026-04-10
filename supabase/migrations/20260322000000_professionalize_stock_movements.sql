-- MIGRACIÓN: Profesionalización de movimientos de stock y trazabilidad de vinculación
-- Fecha: 2026-03-22

BEGIN;

-- 1. Agregar el nuevo tipo de movimiento al ENUM si no existe
-- Nota: En Postgres, los ENUMs no se pueden modificar dentro de bloques transaccionales en versiones antiguas, 
-- pero Supabase (Postgres 15+) lo permite.
ALTER TYPE "public"."stock_movement_type" ADD VALUE IF NOT EXISTS 'LINK_ITEM';

-- 2. Modificar la columna quantity para permitir NULL
-- Esto representa un ítem que está vinculado al negocio pero aún no tiene una carga inicial de stock.
ALTER TABLE "core"."stock_levels" ALTER COLUMN "quantity" DROP NOT NULL;

-- 3. Actualizar la función adjust_stock con la nueva lógica
CREATE OR REPLACE FUNCTION "public"."adjust_stock"(
    "p_item_id" "uuid", 
    "p_business_id" "uuid", 
    "p_account_id" "uuid", 
    "p_quantity_change" integer, 
    "p_movement_type" "public"."stock_movement_type", 
    "p_reason" "text", 
    "p_user_id" "uuid" DEFAULT "auth"."uid"()
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  current_user_role public.app_role;
  is_assigned_employee BOOLEAN;
  current_stock_val INT;
  new_stock_val INT;
  stock_level_exists BOOLEAN;
BEGIN
  -- 1. Validación de Autorización
  SELECT app_role INTO current_user_role FROM core.user_profiles WHERE id = p_user_id AND account_id = p_account_id;

  IF current_user_role IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Usuario no encontrado o no pertenece a esta cuenta.');
  END IF;

  IF current_user_role IN ('EMPLOYEE') THEN
    SELECT public.is_employee_of(p_business_id) INTO is_assigned_employee;
    IF NOT is_assigned_employee THEN
      RETURN jsonb_build_object('status', 'error', 'message', 'El empleado no está autorizado para este negocio.');
    END IF;
  ELSIF current_user_role NOT IN ('OWNER', 'ADMIN', 'DEVELOPER') THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Rol no autorizado para ajustar stock.');
  END IF;

  -- 2. Validación de Inputs
  -- Permitimos quantity_change = 0 solo para LINK_ITEM e INITIAL_STOCK (en caso de querer inicializar en 0 explícitamente)
  IF p_quantity_change = 0 AND p_movement_type NOT IN ('LINK_ITEM', 'INITIAL_STOCK') THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'El cambio de cantidad no puede ser cero.');
  END IF;

  IF p_reason IS NULL OR p_reason = '' THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'El motivo del movimiento es obligatorio.');
  END IF;

  -- 3. Proceso Transaccional
  -- Obtenemos el stock actual bloqueando la fila
  SELECT quantity, TRUE INTO current_stock_val, stock_level_exists
  FROM core.stock_levels
  WHERE item_id = p_item_id
    AND business_id = p_business_id
    AND account_id = p_account_id
  FOR UPDATE;

  -- Lógica de determinación de nuevo stock
  IF NOT COALESCE(stock_level_exists, FALSE) THEN
    -- El registro no existe
    IF p_movement_type NOT IN ('LINK_ITEM', 'INITIAL_STOCK') THEN
      RETURN jsonb_build_object('status', 'error', 'message', 'Ítem no vinculado. Realice el vínculo primero.');
    END IF;

    current_stock_val := NULL; -- No existía antes
    
    IF p_movement_type = 'LINK_ITEM' THEN
      new_stock_val := NULL; -- Se queda en NULL al vincular
    ELSE
      new_stock_val := p_quantity_change; -- INITIAL_STOCK crea con el valor dado
    END IF;

    INSERT INTO core.stock_levels (item_id, business_id, account_id, quantity)
    VALUES (p_item_id, p_business_id, p_account_id, new_stock_val);
    
  ELSE
    -- El registro ya existe
    IF p_movement_type = 'LINK_ITEM' THEN
      -- Si ya existe, LINK_ITEM no cambia nada, solo permite registrar el movimiento si no existía
      new_stock_val := current_stock_val;
    ELSIF p_movement_type = 'INITIAL_STOCK' THEN
      -- INITIAL_STOCK sobre un NULL o un valor existente lo actualiza sumando (o seteando si current es null)
      new_stock_val := COALESCE(current_stock_val, 0) + p_quantity_change;
    ELSE
      -- Otros movimientos requieren que el stock NO sea NULL (debe haber sido inicializado)
      IF current_stock_val IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Stock no inicializado. Use Carga Inicial primero.');
      END IF;
      new_stock_val := current_stock_val + p_quantity_change;
    END IF;

    UPDATE core.stock_levels
    SET quantity = new_stock_val, updated_at = NOW()
    WHERE item_id = p_item_id
      AND business_id = p_business_id
      AND account_id = p_account_id;
  END IF;

  -- 4. Validación Final de Stock Negativo
  IF new_stock_val < 0 THEN
    RAISE EXCEPTION 'Stock insuficiente para esta operación.';
  END IF;

  -- 5. Registro en Movimientos (Auditoría)
  -- Nota: stock_movements guarda IDs de texto para old/new levels para soportar NULLs visualmente en logs
  INSERT INTO core.stock_movements (
    account_id,
    item_id,
    business_id,
    from_stock_level,
    to_stock_level,
    quantity_change,
    movement_type,
    user_id,
    reason
  ) VALUES (
    p_account_id,
    p_item_id,
    p_business_id,
    current_stock_val,
    new_stock_val,
    p_quantity_change,
    p_movement_type,
    p_user_id,
    p_reason
  );

  RETURN jsonb_build_object(
    'status', 'success', 
    'message', 'Stock procesado correctamente.', 
    'new_quantity', new_stock_val
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

COMMIT;
