-- New ENUM for role request status
CREATE TYPE core.role_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Table: core.role_requests
CREATE TABLE core.role_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  requested_role public.app_role NOT NULL,
  status core.role_request_status NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  deleted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to update 'updated_at' column
CREATE TRIGGER on_role_requests_update BEFORE UPDATE ON core.role_requests FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Audit log trigger
CREATE TRIGGER audit_role_requests_changes AFTER INSERT OR UPDATE OR DELETE ON core.role_requests FOR EACH ROW EXECUTE PROCEDURE public.log_changes();

-- RLS Policy for role_requests
ALTER TABLE core.role_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.role_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can create their own role requests" ON core.role_requests
FOR INSERT WITH CHECK (user_id = auth.uid() AND account_id = public.get_my_account_id());

CREATE POLICY "Users can view their own role requests" ON core.role_requests
FOR SELECT USING (user_id = auth.uid() AND account_id = public.get_my_account_id());

CREATE POLICY "Owners can view and approve/reject all role requests within their account" ON core.role_requests
FOR ALL USING (account_id = public.get_my_account_id() AND public.get_my_role() = 'OWNER');

CREATE POLICY "Admins can view all role requests within their account" ON core.role_requests
FOR SELECT USING (account_id = public.get_my_account_id() AND public.get_my_role() = 'ADMIN');
