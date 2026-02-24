DO $$ BEGIN
  ALTER TYPE public.stock_movement_type ADD VALUE 'RESERVE_OUT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.stock_movement_type ADD VALUE 'RESERVE_RELEASE_IN';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
