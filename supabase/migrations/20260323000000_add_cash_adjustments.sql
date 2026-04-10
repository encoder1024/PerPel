-- Migration: Add Cash Adjustments
-- Date: 2026-03-23
-- Description: Adds cash_adjustments table and logic for manual cash movements (withdrawals, contributions, differences).

BEGIN;

-- 1. Create ENUM for cash adjustment types
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cash_adjustment_type') THEN
        CREATE TYPE public.cash_adjustment_type AS ENUM (
            'WITHDRAWAL',    -- Cash extraction (Expenses/Draws)
            'CONTRIBUTION',  -- Cash injection (Inputs)
            'DIFF_POSITIVE', -- Overage detected
            'DIFF_NEGATIVE'  -- Shortage detected
        );
    END IF;
END $$;

-- 2. Create Cash Adjustments table
CREATE TABLE IF NOT EXISTS core.cash_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE CASCADE,
    session_id UUID REFERENCES core.cash_register_sessions(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    movement_type public.cash_adjustment_type NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT false
);

-- 3. Indexes for optimization
CREATE INDEX IF NOT EXISTS idx_cash_adj_session ON core.cash_adjustments(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_adj_account_biz ON core.cash_adjustments(account_id, business_id);

-- 4. Audit and Updated_at Triggers
CREATE TRIGGER on_cash_adjustments_update 
    BEFORE UPDATE ON core.cash_adjustments 
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER audit_cash_adjustments_changes 
    AFTER INSERT OR UPDATE OR DELETE ON core.cash_adjustments 
    FOR EACH ROW EXECUTE PROCEDURE public.log_changes();

-- 5. Enable RLS (Row Level Security)
ALTER TABLE core.cash_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.cash_adjustments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage cash adjustments of their account" ON core.cash_adjustments;
CREATE POLICY "Users can manage cash adjustments of their account" 
    ON core.cash_adjustments FOR ALL 
    USING (account_id = public.get_my_account_id());

-- 6. RPC Function adjust_cash (Secure Backend Logic)
CREATE OR REPLACE FUNCTION public.adjust_cash(
    p_business_id UUID,
    p_account_id UUID,
    p_session_id UUID,
    p_amount NUMERIC,
    p_movement_type public.cash_adjustment_type,
    p_reason TEXT,
    p_user_id UUID DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_role public.app_role;
    v_is_assigned BOOLEAN;
BEGIN
    -- Validate user belongs to the account
    SELECT app_role INTO v_user_role 
    FROM core.user_profiles 
    WHERE id = p_user_id AND account_id = p_account_id;

    IF v_user_role IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Unauthorized for this account.');
    END IF;

    -- If employee, validate assignment to the business
    IF v_user_role = 'EMPLOYEE' THEN
        SELECT public.is_employee_of(p_business_id) INTO v_is_assigned;
        IF NOT v_is_assigned THEN
            RETURN jsonb_build_object('status', 'error', 'message', 'No permissions for this business.');
        END IF;
    END IF;

    -- Insert the adjustment record
    INSERT INTO core.cash_adjustments (
        account_id, business_id, session_id, user_id, amount, movement_type, reason
    ) VALUES (
        p_account_id, p_business_id, p_session_id, p_user_id, p_amount, p_movement_type, p_reason
    );

    RETURN jsonb_build_object('status', 'success', 'message', 'Cash adjustment registered successfully.');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- Borra la función específica indicando el tipo de parámetro (uuid)
DROP FUNCTION IF EXISTS public.get_cash_session_summary(uuid);

-- 7. Update get_cash_session_summary to return a detailed JSON breakdown
CREATE OR REPLACE FUNCTION "public"."get_cash_session_summary"("p_session_id" "uuid") RETURNS jsonb
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_business_id UUID;
    v_account_id UUID;
    v_start_time TIMESTAMPTZ;
    v_opening_balance NUMERIC;
    v_total_sales_cash NUMERIC;
    v_total_contributions NUMERIC;
    v_total_withdrawals NUMERIC;
    v_expected_cash NUMERIC;
BEGIN
    -- 1. Get base session data
    SELECT business_id, account_id, created_at, opening_balance 
    INTO v_business_id, v_account_id, v_start_time, v_opening_balance
    FROM core.cash_register_sessions
    WHERE id = p_session_id;

    IF v_business_id IS NULL THEN 
        RETURN jsonb_build_object('error', 'Session not found'); 
    END IF;

    -- 2. Cash sales (Payments)
    SELECT COALESCE(SUM(p.amount), 0) INTO v_total_sales_cash
    FROM core.payments p
    JOIN core.orders o ON p.order_id = o.id
    WHERE
        p.account_id = v_account_id AND
        o.business_id = v_business_id AND
        p.payment_method_id = 'CASH' AND
        p.status IN ('approved', 'accredited') AND
        p.created_at >= v_start_time;

    -- 3. Contributions (Positive adjustments)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_contributions
    FROM core.cash_adjustments
    WHERE session_id = p_session_id 
      AND movement_type IN ('CONTRIBUTION', 'DIFF_POSITIVE')
      AND is_deleted = false;

    -- 4. Withdrawals (Negative adjustments)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_withdrawals
    FROM core.cash_adjustments
    WHERE session_id = p_session_id 
      AND movement_type IN ('WITHDRAWAL', 'DIFF_NEGATIVE')
      AND is_deleted = false;

    -- 5. Calculate Expected Total
    v_expected_cash := v_opening_balance + v_total_sales_cash + v_total_contributions - v_total_withdrawals;

    RETURN jsonb_build_object(
        'opening_balance', v_opening_balance,
        'total_sales_cash', v_total_sales_cash,
        'total_contributions', v_total_contributions,
        'total_withdrawals', v_total_withdrawals,
        'expected_cash', v_expected_cash
    );
END;
$$;

COMMIT;
