/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260223150000_consolidated_encryption_fix.sql                     *
 *   FASE 1 Y 2: SOLUCIÓN FINAL CONSOLIDADA DE ENCRIPTACIÓN (AES-256)              *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- 1. LIMPIEZA DE INTENTOS ANTERIORES
DROP TABLE IF EXISTS core.encryption_keys CASCADE;
DROP TABLE IF EXISTS core.encryption_secrets CASCADE;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. INFRAESTRUCTURA DE SECRETOS
CREATE TABLE core.encryption_secrets (
    id SERIAL PRIMARY KEY,
    seed TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generar una semilla única de 32 bytes (256 bits) para AES-256
INSERT INTO core.encryption_secrets (seed)
VALUES (encode(gen_random_bytes(32), 'hex'));

-- 3. FUNCIÓN PARA ENCRIPTAR
CREATE OR REPLACE FUNCTION core.encrypt_token(plain_text TEXT)
RETURNS TEXT AS $$
DECLARE
    secret_key BYTEA;
BEGIN
    IF plain_text IS NULL OR plain_text = '' THEN RETURN plain_text; END IF;

    -- Obtenemos la llave binaria de la semilla hexadecimal
    SELECT decode(seed, 'hex') INTO secret_key FROM core.encryption_secrets LIMIT 1;
    
    -- Encriptar con AES-CBC y Padding PKCS
    RETURN encode(encrypt(plain_text::bytea, secret_key, 'aes-cbc/pad:pkcs'), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. FUNCIÓN PARA DESENCRIPTAR
CREATE OR REPLACE FUNCTION core.decrypt_token(encrypted_base64 TEXT)
RETURNS TEXT AS $$
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
    -- En caso de error, devolvemos el valor original o un indicador de error controlado
    RETURN 'ERROR_DE_CIFRADO';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. TRIGGER DE AUTOMATIZACIÓN
-- Aseguramos que la tabla siempre use estas funciones
CREATE OR REPLACE FUNCTION core.handle_token_encryption()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.access_token IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.access_token <> OLD.access_token) THEN
        NEW.access_token := core.encrypt_token(NEW.access_token);
    END IF;

    IF NEW.refresh_token IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.refresh_token <> OLD.refresh_token) THEN
        NEW.refresh_token := core.encrypt_token(NEW.refresh_token);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS encrypt_credentials_trigger ON core.business_credentials;
CREATE TRIGGER encrypt_credentials_trigger
BEFORE INSERT OR UPDATE ON core.business_credentials
FOR EACH ROW EXECUTE PROCEDURE core.handle_token_encryption();

-- 6. RESETEO DE TOKENS ACTUALES
-- Como hemos cambiado la llave, los tokens viejos ya no son recuperables.
-- Es necesario borrarlos para cargarlos de nuevo con la llave válida.
UPDATE core.business_credentials 
SET access_token = NULL, 
    refresh_token = NULL 
WHERE is_deleted = false;

COMMIT;
