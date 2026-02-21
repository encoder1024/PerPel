DO $$ BEGIN
  CREATE TYPE public.stock_movement_type AS ENUM (
    'SALE_OUT',
    'PURCHASE_IN',
    'ADJUSTMENT_IN', --Son para los movimientos irregulares de stock y ajustes por balance
    'ADJUSTMENT_OUT', -- Son para los movimentos irregulares de stock y ajustes por balance
    'RELOCATED_OUT', -- cuando un local le presta a otro un perfume para que lo venda
    'RETURN_IN', -- cuando se devuelve el prestamo hecho con un RELOCATED
    'WASTE_OUT',
    'INITIAL_STOCK',
    'TESTING_STOCK'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
