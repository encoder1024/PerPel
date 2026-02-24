CREATE TABLE core.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES core.inventory_items(id) ON DELETE RESTRICT,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  from_stock_level INT NOT NULL,
  to_stock_level INT NOT NULL,
  quantity_change INT NOT NULL, -- Positive for IN, Negative for OUT
  movement_type public.stock_movement_type NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Who made the change
  reason TEXT, -- Mandatory reason for adjustments
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT quantity_change_not_zero CHECK (quantity_change <> 0),
  CONSTRAINT valid_stock_levels CHECK (from_stock_level >= 0 AND to_stock_level >= 0)
);

-- Indexes for performance
CREATE INDEX idx_stock_movements_account_item ON core.stock_movements(account_id, item_id);
CREATE INDEX idx_stock_movements_business_item ON core.stock_movements(business_id, item_id);
CREATE INDEX idx_stock_movements_user ON core.stock_movements(user_id);

-- Triggers for updated_at and audit logs
CREATE TRIGGER on_stock_movements_update BEFORE UPDATE ON core.stock_movements FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER audit_stock_movements_changes AFTER INSERT OR UPDATE OR DELETE ON core.stock_movements FOR EACH ROW EXECUTE PROCEDURE public.log_changes();

-- RLS Policies
ALTER TABLE core.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.stock_movements FORCE ROW LEVEL SECURITY;

CREATE POLICY "Owners, Admins, Auditors can view all stock movements" ON core.stock_movements
FOR SELECT
USING (
  account_id = public.get_my_account_id() AND
  public.get_my_role() IN ('OWNER', 'ADMIN', 'AUDITOR')
);

CREATE POLICY "Employees can view their own stock movements for assigned businesses" ON core.stock_movements
FOR SELECT
USING (
  account_id = public.get_my_account_id() AND
  public.get_my_role() = 'EMPLOYEE' AND
  user_id = auth.uid() AND
  public.is_employee_of(business_id) -- Assuming is_employee_of checks for business assignment
);

-- Policy for INSERT (will primarily be done by RPC function)
-- It's common to define a policy that allows the function owner (typically postgres) to insert
-- or to allow specific roles to insert if they are directly interacting.
-- For now, let's allow ADMIN/OWNER to insert, assuming RPC is run as security definer
CREATE POLICY "Owners and Admins can insert stock movements" ON core.stock_movements
FOR INSERT
WITH CHECK (
  account_id = public.get_my_account_id() AND
  public.get_my_role() IN ('OWNER', 'ADMIN')
);

-- UPDATE and DELETE generally not allowed for audit logs, rely on is_deleted
CREATE POLICY "Nobody can update stock movements directly" ON core.stock_movements
FOR UPDATE
USING (FALSE);

CREATE POLICY "Nobody can delete stock movements directly" ON core.stock_movements
FOR DELETE
USING (FALSE);
