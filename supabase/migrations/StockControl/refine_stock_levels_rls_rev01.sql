-- Drop previously attempted RLS policies if they exist (or were cancelled)
DROP POLICY IF EXISTS "Stock levels: SELECT for roles" ON core.stock_levels;
DROP POLICY IF EXISTS "Stock levels: INSERT for roles" ON core.stock_levels;
DROP POLICY IF EXISTS "Stock levels: UPDATE for roles" ON core.stock_levels;
DROP POLICY IF EXISTS "Stock levels: DELETE for roles" ON core.stock_levels;

-- If a broad "FOR ALL" policy exists from ERS, it needs to be dropped here too
DROP POLICY IF EXISTS "Usuarios solo gestionan stock de su cuenta" ON core.stock_levels;


-- RLS Policy for SELECT: All authenticated users can view all stock levels within their account.
CREATE POLICY "Stock levels: SELECT all for authenticated users in account" ON core.stock_levels
FOR SELECT
USING (account_id = public.get_my_account_id());

-- RLS Policy for INSERT: Owners/Admins can insert for any business. Employees can insert only for assigned businesses.
CREATE POLICY "Stock levels: INSERT for roles" ON core.stock_levels
FOR INSERT
WITH CHECK (
  account_id = public.get_my_account_id() AND (
    public.get_my_role() IN ('OWNER', 'ADMIN') OR
    (public.get_my_role() = 'EMPLOYEE' AND public.is_employee_of(business_id))
  )
);

-- RLS Policy for UPDATE: Owners/Admins can update for any business. Employees can update only for assigned businesses.
CREATE POLICY "Stock levels: UPDATE for roles" ON core.stock_levels
FOR UPDATE
USING (
  account_id = public.get_my_account_id() AND (
    public.get_my_role() IN ('OWNER', 'ADMIN') OR
    (public.get_my_role() = 'EMPLOYEE' AND public.is_employee_of(business_id))
  )
)
WITH CHECK (
  account_id = public.get_my_account_id() AND ( -- WITH CHECK applies for the new row values
    public.get_my_role() IN ('OWNER', 'ADMIN') OR
    (public.get_my_role() = 'EMPLOYEE' AND public.is_employee_of(business_id))
  )
);

-- RLS Policy for DELETE: Not allowed for stock levels, rely on is_deleted
CREATE POLICY "Stock levels: DELETE disallowed" ON core.stock_levels
FOR DELETE
USING (FALSE);
