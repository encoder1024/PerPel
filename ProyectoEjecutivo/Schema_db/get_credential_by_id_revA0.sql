-- FUNCTION: core.get_credential_by_id(uuid) [updated]

-- DROP FUNCTION IF EXISTS core.get_credential_by_id(uuid);

CREATE OR REPLACE FUNCTION core.get_credential_by_id(
    p_credential_id UUID)
RETURNS TABLE (
    id UUID,
    account_id UUID,
    api_name public.external_api_name,
    client_id TEXT,
    client_secret TEXT,
    access_token TEXT,
    refresh_token TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.account_id,
        c.api_name,
        c.client_id,
        core.decrypt_token(c.client_secret),
        core.decrypt_token(c.access_token),
        core.decrypt_token(c.refresh_token)
    FROM core.business_credentials c
    WHERE c.id = p_credential_id 
      AND c.is_deleted = false
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SEGURIDAD:
REVOKE ALL ON FUNCTION core.get_credential_by_id(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.get_credential_by_id(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION core.get_credential_by_id(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION core.get_credential_by_id(UUID) TO postgres;
