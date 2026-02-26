/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260225110000_fix_approve_role_logic.sql                          *
 *   CORRECCIÓN: ASIGNACIÓN DE NEGOCIO PARA ADMIN, EMPLOYEE Y CLIENT               *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

CREATE OR REPLACE FUNCTION core.approve_role_request(
    p_request_id UUID,
    p_approver_user_id UUID,
    p_business_id UUID DEFAULT NULL 
)
RETURNS JSON AS $$
DECLARE
    v_approver_profile RECORD;
    v_request_details RECORD;
    v_approver_account_id UUID;
    v_success BOOLEAN := FALSE;
    v_message TEXT := 'No autorizado para aprobar la solicitud.';
BEGIN
    -- 1. Validaciones de seguridad
    SELECT * INTO v_approver_profile FROM core.user_profiles WHERE id = p_approver_user_id AND is_deleted = false;
    IF v_approver_profile IS NULL THEN RAISE EXCEPTION 'Aprobador no encontrado.'; END IF;

    v_approver_account_id := v_approver_profile.account_id;

    SELECT * INTO v_request_details FROM core.role_requests WHERE id = p_request_id AND is_deleted = false;
    IF v_request_details IS NULL THEN RAISE EXCEPTION 'Solicitud no encontrada.'; END IF;

    IF v_request_details.status <> 'PENDING' OR v_request_details.account_id <> v_approver_account_id THEN
        RAISE EXCEPTION 'La solicitud no es válida para esta cuenta.';
    END IF;

    -- 2. Validar quién aprueba qué
    IF v_approver_profile.app_role = 'OWNER' THEN
        v_success := TRUE;
    ELSIF v_approver_profile.app_role = 'ADMIN' THEN
        IF v_request_details.requested_role IN ('CLIENT', 'EMPLOYEE') THEN
            v_success := TRUE;
        ELSE
            v_message := 'Solo el OWNER puede aprobar a un nuevo ADMIN.';
        END IF;
    END IF;

    IF NOT v_success THEN RETURN json_build_object('success', FALSE, 'message', v_message); END IF;

    -- 3. Actualizar perfil del usuario (Cambio de cuenta y rol)
    UPDATE core.user_profiles
    SET
        account_id = v_request_details.account_id,
        app_role = v_request_details.requested_role,
        updated_at = NOW()
    WHERE id = v_request_details.user_id;

    -- 4. Asignación obligatoria a negocio para ADMIN, EMPLOYEE y CLIENT
    IF v_request_details.requested_role IN ('ADMIN', 'EMPLOYEE', 'CLIENT') THEN
        IF p_business_id IS NULL THEN
            RAISE EXCEPTION 'Se requiere seleccionar un negocio para este rol.';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM core.businesses WHERE id = p_business_id AND account_id = v_request_details.account_id AND is_deleted = false) THEN
             RAISE EXCEPTION 'El negocio no pertenece a esta cuenta.';
        END IF;

        INSERT INTO core.employee_assignments (user_id, business_id, account_id, created_by, created_at)
        VALUES (v_request_details.user_id, p_business_id, v_request_details.account_id, p_approver_user_id, NOW())
        ON CONFLICT (account_id, user_id, business_id) DO UPDATE SET is_deleted = false, updated_at = NOW();
    END IF;

    -- 5. Finalizar solicitud
    UPDATE core.role_requests
    SET status = 'APPROVED', approved_by_user_id = p_approver_user_id, approved_at = NOW(), updated_at = NOW()
    WHERE id = p_request_id;

    -- 6. Log de Auditoría
    INSERT INTO logs.audit_log (user_id, account_id, action, table_name, record_id, new_data)
    VALUES (p_approver_user_id, v_approver_account_id, 'ROLE_REQUEST_APPROVED', 'role_requests', p_request_id::TEXT, 
        json_build_object('user', v_request_details.user_id, 'role', v_request_details.requested_role, 'business', p_business_id));

    RETURN json_build_object('success', TRUE, 'message', 'Solicitud aprobada y usuario asignado al negocio.');

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
