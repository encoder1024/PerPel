/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260223130000_create_business_assignment_table.sql                *
 *   FASE 5: TABLA DE ASIGNACIÓN N A N DE CREDENCIALES A NEGOCIOS                  *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- 1. Crear la tabla de asignación
CREATE TABLE IF NOT EXISTS core.business_asign_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE CASCADE,
    credential_id UUID NOT NULL REFERENCES core.business_credentials(id) ON DELETE CASCADE,
    
    -- Metadatos adicionales
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    
    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    
    -- Restricción: No duplicar la misma credencial en el mismo negocio
    CONSTRAINT unique_business_credential_assign UNIQUE (business_id, credential_id)
);

-- 2. Eliminar la columna antigua de businesses (Refactorización a N a N)
ALTER TABLE core.businesses DROP COLUMN IF EXISTS credential_id;

-- 3. Índices para velocidad de consulta
CREATE INDEX IF NOT EXISTS idx_assign_account_id ON core.business_asign_credentials(account_id);
CREATE INDEX IF NOT EXISTS idx_assign_business_id ON core.business_asign_credentials(business_id);

-- 4. Seguridad RLS (Solo el OWNER gestiona integraciones)
ALTER TABLE core.business_asign_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.business_asign_credentials FORCE ROW LEVEL SECURITY;

CREATE POLICY "Owners y Admins gestionan asignaciones de credenciales" 
ON core.business_asign_credentials 
FOR ALL 
USING (account_id = public.get_my_account_id() AND public.get_my_role() IN ('OWNER', 'ADMIN'));

-- 5. Triggers de actualización y auditoría
CREATE TRIGGER on_assign_credentials_update 
    BEFORE UPDATE ON core.business_asign_credentials 
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER audit_assign_credentials_changes 
    AFTER INSERT OR UPDATE OR DELETE ON core.business_asign_credentials 
    FOR EACH ROW EXECUTE PROCEDURE public.log_changes();

COMMIT;
