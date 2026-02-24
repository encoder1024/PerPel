-- Table: core.point_devices
CREATE TABLE IF NOT EXISTS core.point_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
  business_id UUID REFERENCES core.businesses(id) ON DELETE SET NULL,
  
  mp_device_id TEXT NOT NULL, -- The ID from MercadoPago, e.g., "GERTEC_MP35P_498xxxx"
  name TEXT NOT NULL, -- A user-friendly name, e.g., "Terminal Caja 1"
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- e.g., ACTIVE, INACTIVE

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT unique_mp_device_id_per_account UNIQUE (account_id, mp_device_id)
);

-- RLS Policy for point_devices
ALTER TABLE core.point_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.point_devices FORCE ROW LEVEL SECURITY;

CREATE POLICY "Owners and Admins can manage devices on their account" 
ON core.point_devices
FOR ALL
USING (
  account_id = public.get_my_account_id() AND
  public.get_my_role() IN ('OWNER', 'ADMIN')
);

CREATE POLICY "Employees can view active devices for their assigned businesses"
ON core.point_devices
FOR SELECT
USING (
  account_id = public.get_my_account_id() AND
  status = 'ACTIVE' AND
  public.is_employee_of(business_id)
);

-- Trigger to update 'updated_at' column
CREATE TRIGGER on_point_devices_update 
BEFORE UPDATE ON core.point_devices 
FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Audit log trigger
CREATE TRIGGER audit_point_devices_changes 
AFTER INSERT OR UPDATE OR DELETE ON core.point_devices 
FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
