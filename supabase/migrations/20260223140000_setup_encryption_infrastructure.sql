/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260223140000_setup_encryption_infrastructure.sql                 *
 *   FASE 1: INFRAESTRUCTURA DE ENCRIPTACIÓN (PGSODIUM - CORREGIDO V2)             *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- 1. Habilitar la extensión pgsodium si no está activa
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- 2. Crear una tabla para almacenar la referencia a nuestra clave de cifrado
CREATE TABLE IF NOT EXISTS core.encryption_keys (
    id SERIAL PRIMARY KEY,
    key_id UUID NOT NULL, 
    created_at TIMESTAMPTZ DEFAULT NOW(),
    active BOOLEAN DEFAULT true
);

-- 3. Crear una nueva clave si no existe ninguna activa usando la función oficial
DO $$
DECLARE
    new_key_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM core.encryption_keys WHERE active = true) THEN
        -- IMPORTANTE: key_context DEBE tener exactamente 8 caracteres
        SELECT id INTO new_key_id 
        FROM pgsodium.create_key(
            name := 'business_tokens_key',
            key_type := 'aead-det',
            key_context := 'perpel_8' 
        );

        -- Registrarla en nuestra tabla de gestión
        INSERT INTO core.encryption_keys (key_id) VALUES (new_key_id);
    END IF;
END $$;

-- 4. Función para ENCRIPTAR (Texto plano -> Encriptado)
CREATE OR REPLACE FUNCTION core.encrypt_token(plain_text TEXT)
RETURNS TEXT AS $$
DECLARE
    active_key_id UUID;
    encrypted_bytes BYTEA;
BEGIN
    IF plain_text IS NULL OR plain_text = '' THEN RETURN plain_text; END IF;

    SELECT key_id INTO active_key_id FROM core.encryption_keys WHERE active = true LIMIT 1;
    
    -- Cifrado usando AEAD
    SELECT pgsodium.crypto_aead_det_encrypt(
        decode(plain_text, 'escape'),
        '\\x'::bytea, 
        active_key_id
    ) INTO encrypted_bytes;

    RETURN encode(encrypted_bytes, 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Función para DESENCRIPTAR (Encriptado -> Texto plano)
CREATE OR REPLACE FUNCTION core.decrypt_token(encrypted_base64 TEXT)
RETURNS TEXT AS $$
DECLARE
    active_key_id UUID;
    decrypted_bytes BYTEA;
BEGIN
    IF encrypted_base64 IS NULL OR encrypted_base64 = '' THEN RETURN encrypted_base64; END IF;

    SELECT key_id INTO active_key_id FROM core.encryption_keys WHERE active = true LIMIT 1;

    SELECT pgsodium.crypto_aead_det_decrypt(
        decode(encrypted_base64, 'base64'),
        '\\x'::bytea,
        active_key_id
    ) INTO decrypted_bytes;

    RETURN convert_from(decrypted_bytes, 'UTF8');
EXCEPTION WHEN OTHERS THEN
    -- Si falla, devolvemos el valor original (permite transición de datos viejos)
    RETURN encrypted_base64;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
