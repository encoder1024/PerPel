CREATE OR REPLACE FUNCTION core.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = core, public 
AS $$
DECLARE
  new_account_id UUID;
  user_full_name TEXT;
BEGIN
  -- Log de inicio
  RAISE WARNING 'Iniciando handle_new_user para email: %', NEW.email;

  SELECT COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email) INTO user_full_name;

  IF char_length(user_full_name) = 0 THEN
    user_full_name := NEW.email;
  END IF;

  RAISE WARNING 'Nombre procesado: %. Intentando insertar en core.accounts...', user_full_name;

  -- Insertar en accounts
  INSERT INTO core.accounts (owner_user_id, account_name)
  VALUES (NEW.id, 'Account for ' || user_full_name)
  RETURNING id INTO new_account_id;

  RAISE WARNING 'Account creada con ID: %. Intentando insertar en core.user_profiles...', new_account_id;

  -- Insertar en user_profiles
  INSERT INTO core.user_profiles (id, account_id, full_name, email, app_role)
  VALUES (NEW.id, new_account_id, user_full_name, NEW.email, NULL);

  RAISE WARNING 'Registro completado exitosamente para ID: %', NEW.id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Este log atrapará cualquier error específico
  RAISE WARNING 'ERROR en handle_new_user: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  RETURN NEW; -- Retornamos NEW para que el usuario se cree en Auth aunque falle el perfil
END;
$$;


CREATE OR REPLACE FUNCTION core.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = core, public 
AS $$
DECLARE
  _v_account_id UUID; -- Cambiado el nombre para evitar conflictos
  _v_full_name TEXT;
BEGIN
  RAISE WARNING 'Iniciando para: %', NEW.email;

  -- Extraer nombre
  _v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  IF char_length(_v_full_name) = 0 THEN
    _v_full_name := NEW.email;
  END IF;

  -- Insertar en accounts usando alias para evitar ambigüedad
  INSERT INTO core.accounts (owner_user_id, account_name)
  VALUES (NEW.id, 'Account for ' || _v_full_name)
  RETURNING id INTO _v_account_id;

  RAISE WARNING 'Account ID obtenido: %', _v_account_id;

  -- Insertar en user_profiles
  INSERT INTO core.user_profiles (id, account_id, full_name, email, app_role)
  VALUES (NEW.id, _v_account_id, _v_full_name, NEW.email, NULL);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ERROR en handle_new_user: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

