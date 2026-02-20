CREATE OR REPLACE FUNCTION core.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
-- La línea va aquí. Esto evita errores de "relation accounts does not exist"
SET search_path = core, public 
AS $$
DECLARE
  new_account_id UUID;
  user_full_name TEXT;
BEGIN
  -- Extraer nombre o usar email de respaldo
  SELECT COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email) INTO user_full_name;

  IF char_length(user_full_name) = 0 THEN
    user_full_name := NEW.email;
  END IF;

  -- Insertar en core.accounts
  -- (Ya no necesitas poner core.accounts gracias al search_path)
  INSERT INTO accounts (owner_user_id, account_name)
  VALUES (NEW.id, 'Account for ' || user_full_name)
  RETURNING id INTO new_account_id;

  -- Insertar en core.user_profiles
  INSERT INTO user_profiles (id, account_id, full_name, email, app_role)
  VALUES (NEW.id, new_account_id, user_full_name, NEW.email, NULL);

  RETURN NEW;
END;
$$;


