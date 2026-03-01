/*****************************************************************************************
 * MIGRACIÓN: 20260301000000_business_credentials_expired_trigger.sql                    *
 * Crea un trigger que revisa `expires_at` y fuerza `external_status = 'expired'` cuando  *
 * la credencial ya expiró aunque el backend no detectó `invalid_grant`.                 *
 *****************************************************************************************/

BEGIN;

CREATE OR REPLACE FUNCTION core.ensure_credentials_flag_expired()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.expires_at IS NOT NULL AND NEW.expires_at < NOW() THEN
      NEW.external_status := 'expired';
    ELSIF NEW.external_status = 'expired' AND (NEW.expires_at IS NULL OR NEW.expires_at >= NOW()) THEN
      -- Volvemos a marcar activos si la credencial fue actualizada con un token válido.
      NEW.external_status := 'active';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_credentials_expiration_trigger ON core.business_credentials;
CREATE TRIGGER business_credentials_expiration_trigger
BEFORE INSERT OR UPDATE ON core.business_credentials
FOR EACH ROW
EXECUTE PROCEDURE core.ensure_credentials_flag_expired();

COMMIT;
