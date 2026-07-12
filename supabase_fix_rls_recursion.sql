-- Run this in Supabase Dashboard → SQL Editor
-- Fixes "infinite recursion detected in policy for relation profiles"

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_client_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_owner_or_co_owner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('owner', 'co_owner')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'staff'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_client()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'client'
  );
$$;

-- Profiles
DROP POLICY IF EXISTS "Profiles select policy" ON public.profiles;
CREATE POLICY "Profiles select policy" ON public.profiles FOR SELECT USING (
  public.is_owner_or_co_owner()
  OR id = auth.uid()
  OR (
    public.is_staff()
    AND (
      role IN ('owner', 'co_owner', 'staff')
      OR (
        role = 'client'
        AND EXISTS (
          SELECT 1 FROM public.staff_client_access
          WHERE staff_id = auth.uid() AND client_id = public.profiles.client_id
        )
      )
    )
  )
  OR (
    public.is_client()
    AND (
      role IN ('owner', 'co_owner', 'staff')
      OR client_id = public.get_auth_client_id()
    )
  )
);

DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;
CREATE POLICY "Profiles update policy" ON public.profiles FOR UPDATE USING (
  public.is_owner_or_co_owner() OR id = auth.uid()
);

-- Staff client access
DROP POLICY IF EXISTS "Staff client access is viewable by owners, co_owners, or the staff themselves" ON public.staff_client_access;
CREATE POLICY "Staff client access is viewable by owners, co_owners, or the staff themselves"
ON public.staff_client_access FOR SELECT
USING (public.is_owner_or_co_owner() OR staff_id = auth.uid());

DROP POLICY IF EXISTS "Staff client access is manageable only by owners and co_owners" ON public.staff_client_access;
CREATE POLICY "Staff client access is manageable only by owners and co_owners"
ON public.staff_client_access FOR ALL
USING (public.is_owner_or_co_owner());

-- Clients
DROP POLICY IF EXISTS "Clients modify policy" ON public.clients;
CREATE POLICY "Clients modify policy" ON public.clients FOR ALL
USING (
  public.is_owner_or_co_owner()
  OR (
    public.is_staff()
    AND EXISTS (
      SELECT 1 FROM public.staff_client_access
      WHERE staff_id = auth.uid() AND client_id = id
    )
  )
);

-- Milestones (update modify policies if they exist with recursion)
DROP POLICY IF EXISTS "Milestones select policy" ON public.milestones;
CREATE POLICY "Milestones select policy" ON public.milestones FOR SELECT
USING (public.has_client_access(client_id));

DROP POLICY IF EXISTS "Milestones modify policy" ON public.milestones;
CREATE POLICY "Milestones modify policy" ON public.milestones FOR ALL
USING (
  public.is_owner_or_co_owner()
  OR (
    public.is_staff()
    AND EXISTS (
      SELECT 1 FROM public.staff_client_access
      WHERE staff_id = auth.uid() AND client_id = milestones.client_id
    )
  )
  OR (
    public.is_client()
    AND client_id = public.get_auth_client_id()
  )
);

-- Messages
DROP POLICY IF EXISTS "Messages select policy" ON public.messages;
CREATE POLICY "Messages select policy" ON public.messages FOR SELECT
USING (public.has_client_access(client_id));

DROP POLICY IF EXISTS "Messages insert policy" ON public.messages;
CREATE POLICY "Messages insert policy" ON public.messages FOR INSERT
WITH CHECK (public.has_client_access(client_id) AND sender_id = auth.uid());

-- App settings
DROP POLICY IF EXISTS "App settings modify policy" ON public.app_settings;
CREATE POLICY "App settings modify policy" ON public.app_settings FOR ALL
USING (public.is_owner_or_co_owner());
