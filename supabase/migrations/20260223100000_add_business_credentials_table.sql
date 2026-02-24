/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260223100000_add_business_credentials_table.sql                  *
 *   FASE 1: INFRAESTRUCTURA DE DATOS PARA TOKENS POR SUCURSAL                     *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- 1. Añadir 'ALEGRA' al enum de APIs externas si no existe (Postgres 12+ no soporta IF NOT EXISTS en ALTER TYPE)
-- Usamos un bloque anónimo para evitar errores si ya existe.
DO $$
BEGIN
    ALTER TYPE public.external_api_name ADD VALUE 'ALEGRA';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Crear la tabla de credenciales
CREATE TABLE IF NOT EXISTS core.business_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- Etiqueta descriptiva (ej: "Cuenta MP Sucursal Centro")
    api_name public.external_api_name NOT NULL,
    
    -- Credenciales (Se guardarán encriptadas o mediante Vault de Supabase en el futuro)
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    
    -- Metadata adicional para Mercado Pago u otras APIs
    external_user_id TEXT, -- ID del usuario en la API externa (ej: mp_user_id)
    external_status TEXT DEFAULT 'active',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted BOOLEAN NOT NULL DEFAULT false
);

-- 3. Añadir la columna de relación a la tabla de negocios
ALTER TABLE core.businesses ADD COLUMN IF NOT EXISTS credential_id UUID REFERENCES core.business_credentials(id) ON DELETE SET NULL;

-- 4. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_credentials_account_id ON core.business_credentials(account_id);
CREATE INDEX IF NOT EXISTS idx_businesses_credential_id ON core.businesses(credential_id);

-- 5. Configurar Seguridad (RLS)
ALTER TABLE core.business_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.business_credentials FORCE ROW LEVEL SECURITY;

-- Política Estricta: OWNER y ADMIN pueden gestionar credenciales
CREATE POLICY "Dueños y Admins gestionan sus propias credenciales" 
ON core.business_credentials 
FOR ALL 
USING (account_id = public.get_my_account_id() AND public.get_my_role() IN ('OWNER', 'ADMIN'));

-- 6. Triggers de Auditoría y Timestamps
CREATE TRIGGER on_credentials_update 
    BEFORE UPDATE ON core.business_credentials 
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER audit_credentials_changes 
    AFTER INSERT OR UPDATE OR DELETE ON core.business_credentials 
    FOR EACH ROW EXECUTE PROCEDURE public.log_changes();

COMMIT;
