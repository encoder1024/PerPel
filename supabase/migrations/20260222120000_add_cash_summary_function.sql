CREATE OR REPLACE FUNCTION public.get_cash_session_summary(p_session_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_business_id UUID;
    v_account_id UUID;
    v_start_time TIMESTAMPTZ;
    v_total_cash NUMERIC;
BEGIN
    -- 1. Get session details
    SELECT business_id, account_id, created_at INTO v_business_id, v_account_id, v_start_time
    FROM core.cash_register_sessions
    WHERE id = p_session_id;

    IF v_business_id IS NULL THEN
        RETURN 0; -- Return 0 if session not found
    END IF;

    -- 2. Calculate total cash payments for the business during the session
    SELECT COALESCE(SUM(p.amount), 0) INTO v_total_cash
    FROM core.payments p
    JOIN core.orders o ON p.order_id = o.id
    WHERE
        p.account_id = v_account_id AND
        o.business_id = v_business_id AND
        p.payment_method_id = 'CASH' AND
        p.status = 'approved' AND
        p.created_at >= v_start_time;

    RETURN v_total_cash;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_cash_session_summary(UUID) TO authenticated;
