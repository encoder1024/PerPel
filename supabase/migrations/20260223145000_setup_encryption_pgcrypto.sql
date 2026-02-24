/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260223145000_setup_encryption_pgcrypto.sql                       *
 *   FASE 1: INFRAESTRUCTURA DE ENCRIPTACIÓN (USANDO PGCRYPTO - MÁXIMA COMPATIBILIDAD) *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- 1. Habilitar pgcrypto (Extensión estándar de Postgres)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Crear una tabla para guardar nuestra semilla de cifrado
-- NOTA: En un entorno de producción real, esta semilla se podría pasar como una 
-- variable de configuración de Supabase, pero aquí la manejamos internamente.
CREATE TABLE IF NOT EXISTS core.encryption_secrets (
    id SERIAL PRIMARY KEY,
    seed TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Generar una semilla única para esta base de datos si no existe
INSERT INTO core.encryption_secrets (seed)
SELECT encode(gen_random_bytes(32), 'hex')
WHERE NOT EXISTS (SELECT 1 FROM core.encryption_secrets);

-- 4. Función para ENCRIPTAR (Texto plano -> AES -> Base64)
CREATE OR REPLACE FUNCTION core.encrypt_token(plain_text TEXT)
RETURNS TEXT AS $$
DECLARE
    secret_seed TEXT;
BEGIN
    IF plain_text IS NULL OR plain_text = '' THEN RETURN plain_text; END IF;

    SELECT seed INTO secret_seed FROM core.encryption_secrets LIMIT 1;
    
    -- Usamos encrypt() con algoritmo AES (Advanced Encryption Standard)
    -- El resultado se codifica en base64 para guardarlo en la columna TEXT
    RETURN encode(encrypt(plain_text::bytea, secret_seed::bytea, 'aes'), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Función para DESENCRIPTAR (Base64 -> AES -> Texto plano)
CREATE OR REPLACE FUNCTION core.decrypt_token(encrypted_base64 TEXT)
RETURNS TEXT AS $$
DECLARE
    secret_seed TEXT;
    decrypted_raw BYTEA;
BEGIN
    IF encrypted_base64 IS NULL OR encrypted_base64 = '' THEN RETURN encrypted_base64; END IF;

    SELECT seed INTO secret_seed FROM core.encryption_secrets LIMIT 1;

    -- Decodificamos de base64 y desencriptamos con AES
    decrypted_raw := decrypt(decode(encrypted_base64, 'base64'), secret_seed::bytea, 'aes');
    
    RETURN convert_from(decrypted_raw, 'UTF8');
EXCEPTION WHEN OTHERS THEN
    -- Si no es un valor encriptado válido, devolvemos el original
    RETURN encrypted_base64;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Forzar la encriptación de los datos actuales usando este nuevo método
UPDATE core.business_credentials 
SET access_token = core.encrypt_token(access_token),
    refresh_token = core.encrypt_token(refresh_token),
    updated_at = NOW()
WHERE is_deleted = false 
-- Solo encriptamos si no parece estar ya encriptado (el base64 de AES suele ser corto pero identificable)
AND length(access_token) < 80;

COMMIT;
