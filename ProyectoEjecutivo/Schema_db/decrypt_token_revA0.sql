-- FUNCTION: core.decrypt_token(text) [updated]

-- DROP FUNCTION IF EXISTS core.decrypt_token(text);

CREATE OR REPLACE FUNCTION core.decrypt_token(
    encrypted_base64 text)
    RETURNS text
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE SECURITY DEFINER PARALLEL UNSAFE
AS $BODY$

DECLARE
    secret_key BYTEA;
    decrypted_raw BYTEA;
BEGIN
    IF encrypted_base64 IS NULL OR encrypted_base64 = '' THEN RETURN encrypted_base64; END IF;

    SELECT decode(seed, 'hex') INTO secret_key FROM core.encryption_secrets LIMIT 1;

    -- Desencriptar
    decrypted_raw := decrypt(decode(encrypted_base64, 'base64'), secret_key, 'aes-cbc/pad:pkcs');

    RETURN convert_from(decrypted_raw, 'UTF8');
EXCEPTION WHEN OTHERS THEN
    -- Fallback seguro: devolver el valor original si falla el cifrado
    RETURN encrypted_base64;
END;
$BODY$;

ALTER FUNCTION core.decrypt_token(text)
    OWNER TO postgres;
