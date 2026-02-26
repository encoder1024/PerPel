/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260225100000_create_role_management_rpcs.sql                     *
 *   FASE 1.2: FUNCIONES RPC PARA LA GESTIÓN DE ROLES (CORREGIDO DROP POLICY)      *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- Añadir al enum de app_role 'CLIENT', si no existe (por si acaso)
-- DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role' AND enum_range('app_role') @> ARRAY['CLIENT']) THEN ALTER TYPE public.app_role ADD VALUE 'CLIENT'; END IF; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Función RPC: core.approve_role_request
-- Permite aprobar una solicitud de rol, actualizando user_profiles y employee_assignments
CREATE OR REPLACE FUNCTION core.approve_role_request(
    p_request_id UUID,
    p_approver_user_id UUID,
    p_business_id UUID DEFAULT NULL -- Opcional, solo para rol EMPLOYEE
)
RETURNS JSON AS $$
DECLARE
    v_approver_profile RECORD;
    v_request_details RECORD;
    v_target_user_profile RECORD;
    v_approver_account_id UUID;
    v_success BOOLEAN := FALSE;
    v_message TEXT := 'No autorizado para aprobar la solicitud.';
    v_audit_log_id BIGINT;
BEGIN
    -- 1. Obtener perfil del aprobador
    SELECT * INTO v_approver_profile FROM core.user_profiles WHERE id = p_approver_user_id AND is_deleted = false;
    IF v_approver_profile IS NULL THEN
        RAISE EXCEPTION 'Aprobador no encontrado o inactivo.';
    END IF;

    -- Obtener account_id del aprobador
    v_approver_account_id := v_approver_profile.account_id;

    -- 2. Obtener detalles de la solicitud
    SELECT * INTO v_request_details FROM core.role_requests WHERE id = p_request_id AND is_deleted = false;
    IF v_request_details IS NULL THEN
        RAISE EXCEPTION 'Solicitud de rol no encontrada o inactiva.';
    END IF;

    -- Verificar que la solicitud está PENDING y pertenece a la misma cuenta del aprobador
    IF v_request_details.status <> 'PENDING' OR v_request_details.account_id <> v_approver_account_id THEN
        RAISE EXCEPTION 'La solicitud no está PENDING o no pertenece a la cuenta del aprobador.';
    END IF;

    -- 3. Validar permisos del aprobador para el rol solicitado
    IF v_approver_profile.app_role = 'OWNER' THEN
        -- OWNER puede aprobar cualquier rol
        v_success := TRUE;
    ELSIF v_approver_profile.app_role = 'ADMIN' THEN
        -- ADMIN puede aprobar CLIENT y EMPLOYEE, pero NO ADMIN
        IF v_request_details.requested_role IN ('CLIENT', 'EMPLOYEE') THEN
            v_success := TRUE;
        ELSE
            v_message := 'Un ADMIN no puede aprobar solicitudes para el rol ADMIN.';
        END IF;
    END IF;

    IF NOT v_success THEN
        RETURN json_build_object('success', FALSE, 'message', v_message);
    END IF;

    -- 4. Obtener perfil del usuario target
    SELECT * INTO v_target_user_profile FROM core.user_profiles WHERE id = v_request_details.user_id AND is_deleted = false;
    IF v_target_user_profile IS NULL THEN
        RAISE EXCEPTION 'Usuario solicitante no encontrado o inactivo.';
    END IF;

    -- 5. Actualizar user_profiles
    UPDATE core.user_profiles
    SET
        account_id = v_request_details.account_id,
        app_role = v_request_details.requested_role,
        updated_at = NOW()
    WHERE id = v_request_details.user_id;

    -- 6. Insertar en employee_assignments si es EMPLEADO
    IF v_request_details.requested_role = 'EMPLOYEE' THEN
        IF p_business_id IS NULL THEN
            RAISE EXCEPTION 'Se requiere business_id para asignar un rol de EMPLEADO.';
        END IF;
        
        -- Verificar que el business_id pertenece a la misma cuenta
        IF NOT EXISTS (SELECT 1 FROM core.businesses WHERE id = p_business_id AND account_id = v_request_details.account_id AND is_deleted = false) THEN
             RAISE EXCEPTION 'El business_id proporcionado no existe o no pertenece a esta cuenta.';
        END IF;

        INSERT INTO core.employee_assignments (user_id, business_id, account_id, created_by, created_at)
        VALUES (
            v_request_details.user_id,
            p_business_id,
            v_request_details.account_id,
            p_approver_user_id,
            NOW()
        )
        ON CONFLICT (account_id, user_id, business_id) DO UPDATE SET is_deleted = false, updated_at = NOW(); -- Si ya estaba asignado, lo reactiva
    END IF;

    -- 7. Actualizar status de la solicitud
    UPDATE core.role_requests
    SET
        status = 'APPROVED',
        approved_by_user_id = p_approver_user_id,
        approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_request_id;

    v_success := TRUE;
    v_message := 'Solicitud de rol aprobada con éxito.';

    -- 8. Logear en audit_log (manual para mayor detalle)
    INSERT INTO logs.audit_log (user_id, account_id, action, table_name, record_id, new_data)
    VALUES (
        p_approver_user_id,
        v_approver_account_id,
        'ROLE_REQUEST_APPROVED',
        'role_requests',
        p_request_id::TEXT,
        json_build_object(
            'approved_user_id', v_request_details.user_id,
            'approved_role', v_request_details.requested_role,
            'approved_account_id', v_request_details.account_id,
            'approved_business_id', p_business_id
        )
    ) RETURNING id INTO v_audit_log_id;

    RETURN json_build_object('success', v_success, 'message', v_message);

EXCEPTION
    WHEN OTHERS THEN
        v_message := SQLERRM;
        -- Logear el error en audit_log
        INSERT INTO logs.audit_log (user_id, account_id, action, table_name, record_id, new_data)
        VALUES (
            p_approver_user_id,
            v_approver_account_id,
            'ROLE_REQUEST_APPROVAL_FAILED',
            'role_requests',
            p_request_id::TEXT,
            json_build_object('error_message', v_message)
        );
        RETURN json_build_object('success', FALSE, 'message', v_message);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permisos para approve_role_request
REVOKE ALL ON FUNCTION core.approve_role_request(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.approve_role_request(UUID, UUID, UUID) TO authenticated; -- Solo se llama desde el frontend
GRANT EXECUTE ON FUNCTION core.approve_role_request(UUID, UUID, UUID) TO service_role;


-- 2. Función RPC: core.reject_role_request
-- Permite rechazar una solicitud de rol
CREATE OR REPLACE FUNCTION core.reject_role_request(
    p_request_id UUID,
    p_approver_user_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_approver_profile RECORD;
    v_request_details RECORD;
    v_approver_account_id UUID;
    v_audit_log_id BIGINT;
BEGIN
    -- 1. Obtener perfil del aprobador
    SELECT * INTO v_approver_profile FROM core.user_profiles WHERE id = p_approver_user_id AND is_deleted = false;
    IF v_approver_profile IS NULL THEN
        RAISE EXCEPTION 'Aprobador no encontrado o inactivo.';
    END IF;

    v_approver_account_id := v_approver_profile.account_id;

    -- 2. Obtener detalles de la solicitud
    SELECT * INTO v_request_details FROM core.role_requests WHERE id = p_request_id AND is_deleted = false;
    IF v_request_details IS NULL THEN
        RAISE EXCEPTION 'Solicitud de rol no encontrada o inactiva.';
    END IF;

    -- Verificar que la solicitud está PENDING y pertenece a la misma cuenta del aprobador
    IF v_request_details.status <> 'PENDING' OR v_request_details.account_id <> v_approver_account_id THEN
        RAISE EXCEPTION 'La solicitud no está PENDING o no pertenece a la cuenta del aprobador.';
    END IF;
    
    -- Validar que el aprobador es OWNER o ADMIN de la cuenta de la solicitud
    IF v_approver_profile.app_role NOT IN ('OWNER', 'ADMIN') OR v_approver_profile.account_id <> v_request_details.account_id THEN
        RAISE EXCEPTION 'No autorizado para rechazar la solicitud.';
    END IF;

    -- 3. Actualizar status de la solicitud
    UPDATE core.role_requests
    SET
        status = 'REJECTED',
        approved_by_user_id = p_approver_user_id,
        approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_request_id;

    -- 4. Logear en audit_log
    INSERT INTO logs.audit_log (user_id, account_id, action, table_name, record_id, new_data)
    VALUES (
        p_approver_user_id,
        v_approver_account_id,
        'ROLE_REQUEST_REJECTED',
        'role_requests',
        p_request_id::TEXT,
        json_build_object('rejected_user_id', v_request_details.user_id)
    );

    RETURN json_build_object('success', TRUE, 'message', 'Solicitud de rol rechazada con éxito.');

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permisos para reject_role_request
REVOKE ALL ON FUNCTION core.reject_role_request(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.reject_role_request(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION core.reject_role_request(UUID, UUID) TO service_role;


-- 3. Función RPC: core.update_account_registration_code
-- Permite al OWNER cambiar el código de registro de su cuenta
CREATE OR REPLACE FUNCTION core.update_account_registration_code(
    p_account_id UUID,
    p_new_code TEXT,
    p_owner_user_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_owner_profile RECORD;
    v_old_code TEXT;
    v_audit_log_id BIGINT;
BEGIN
    -- 1. Obtener perfil del usuario que intenta cambiar el código
    SELECT * INTO v_owner_profile FROM core.user_profiles WHERE id = p_owner_user_id AND is_deleted = false;
    IF v_owner_profile IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado o inactivo.';
    END IF;

    -- 2. Validar que el usuario es OWNER de la cuenta especificada
    IF v_owner_profile.app_role <> 'OWNER' OR v_owner_profile.account_id <> p_account_id THEN
        RAISE EXCEPTION 'Solo el OWNER de la cuenta puede cambiar el código de registro.';
    END IF;

    -- 3. Obtener el código actual para el log
    SELECT registration_code INTO v_old_code FROM core.accounts WHERE id = p_account_id AND is_deleted = false;
    
    -- 4. Actualizar el código de registro
    UPDATE core.accounts
    SET
        registration_code = p_new_code,
        updated_at = NOW()
    WHERE id = p_account_id;

    -- 5. Logear en audit_log
    INSERT INTO logs.audit_log (user_id, account_id, action, table_name, record_id, old_data, new_data)
    VALUES (
        p_owner_user_id,
        p_account_id,
        'ACCOUNT_REG_CODE_UPDATED',
        'accounts',
        p_account_id::TEXT,
        json_build_object('old_registration_code', v_old_code),
        json_build_object('new_registration_code', p_new_code)
    ) RETURNING id INTO v_audit_log_id;

    RETURN json_build_object('success', TRUE, 'message', 'Código de registro actualizado con éxito.');

EXCEPTION
    WHEN unique_violation THEN
        RETURN json_build_object('success', FALSE, 'message', 'El nuevo código de registro ya está en uso. Por favor, elige otro.');
    WHEN OTHERS THEN
        RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permisos para update_account_registration_code
REVOKE ALL ON FUNCTION core.update_account_registration_code(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.update_account_registration_code(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION core.update_account_registration_code(UUID, TEXT, UUID) TO service_role;

-- 4. Ajustar RLS para core.role_requests
-- Se mantienen las políticas de INSERT y SELECT para el propio usuario
-- Se añade una política para Owners y Admins para gestionar las solicitudes de su cuenta
DO $$ BEGIN
    -- Eliminar la política si existe para evitar errores
    EXECUTE 'DROP POLICY IF EXISTS "permitir_insert_solicitudes" ON core.role_requests;';
EXCEPTION WHEN UNDEFINED_OBJECT THEN NULL; END $$;
DO $$ BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "permitir_ver_propias_solicitudes" ON core.role_requests;';
EXCEPTION WHEN UNDEFINED_OBJECT THEN NULL; END $$;

ALTER TABLE core.role_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.role_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can create their own role requests"
ON core.role_requests FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own role requests"
ON core.role_requests FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Owners and Admins can manage role requests within their account"
ON core.role_requests FOR ALL
USING (account_id = public.get_my_account_id() AND public.get_my_role() IN ('OWNER', 'ADMIN'));


-- 5. Ajustar RLS para core.accounts para update de registration_code
DO $$ BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados" ON core.accounts;';
EXCEPTION WHEN UNDEFINED_OBJECT THEN NULL; END $$;
DO $$ BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "validar_codigo_cuenta" ON core.accounts;';
EXCEPTION WHEN UNDEFINED_OBJECT THEN NULL; END $$;

ALTER TABLE core.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY "Owner puede ver y gestionar su propia cuenta"
ON core.accounts FOR ALL
USING (id = public.get_my_account_id() AND owner_user_id = auth.uid())
WITH CHECK (id = public.get_my_account_id() AND owner_user_id = auth.uid());

CREATE POLICY "Staff puede leer cuentas de su cuenta"
ON core.accounts FOR SELECT
USING (id = public.get_my_account_id());

CREATE POLICY "Owner puede actualizar su propio registration_code"
ON core.accounts FOR UPDATE
USING (id = public.get_my_account_id() AND owner_user_id = auth.uid() AND public.get_my_role() = 'OWNER')
WITH CHECK (id = public.get_my_account_id() AND owner_user_id = auth.uid() AND public.get_my_role() = 'OWNER');


COMMIT;
