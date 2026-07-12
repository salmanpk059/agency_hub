-- ============================================================
-- Fix C-3: RLS policies for scope_changes table
-- Fix C-4: RLS policies for project_requests table
-- ============================================================
-- Prerequisites: supabase_schema.sql and supabase_fix_rls_recursion.sql
-- must have been applied (provides has_client_access, is_owner_or_co_owner,
-- is_staff, is_client, get_auth_client_id helper functions).
-- ============================================================

-- ============================================================
-- PART 1: scope_changes (C-3)
-- The table is named scope_changes in the deployed schema.
-- ============================================================

-- Ensure RLS is enabled
ALTER TABLE public.scope_changes ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start clean
DROP POLICY IF EXISTS "Clients can view their own scope changes" ON public.scope_changes;
DROP POLICY IF EXISTS "Clients can create scope changes" ON public.scope_changes;
DROP POLICY IF EXISTS "Admin team can view scope changes" ON public.scope_changes;
DROP POLICY IF EXISTS "Admin team can update scope changes" ON public.scope_changes;
DROP POLICY IF EXISTS "scope_changes_admin_all" ON public.scope_changes;
DROP POLICY IF EXISTS "scope_changes_staff_select" ON public.scope_changes;
DROP POLICY IF EXISTS "scope_changes_staff_insert" ON public.scope_changes;
DROP POLICY IF EXISTS "scope_changes_staff_update" ON public.scope_changes;
DROP POLICY IF EXISTS "scope_changes_client_select" ON public.scope_changes;
DROP POLICY IF EXISTS "scope_changes_client_insert" ON public.scope_changes;

-- Owner/co_owner: full access to all scope changes
CREATE POLICY "scope_changes_admin_all" ON public.scope_changes
  FOR ALL
  USING (public.is_owner_or_co_owner())
  WITH CHECK (public.is_owner_or_co_owner());

-- Staff: can view scope changes for clients they are assigned to
CREATE POLICY "scope_changes_staff_select" ON public.scope_changes
  FOR SELECT
  USING (
    public.is_staff()
    AND public.has_client_access(client_id)
  );

-- Staff: can insert scope changes for assigned clients
CREATE POLICY "scope_changes_staff_insert" ON public.scope_changes
  FOR INSERT
  WITH CHECK (
    public.is_staff()
    AND public.has_client_access(client_id)
  );

-- Staff: can update scope changes for assigned clients
CREATE POLICY "scope_changes_staff_update" ON public.scope_changes
  FOR UPDATE
  USING (
    public.is_staff()
    AND public.has_client_access(client_id)
  )
  WITH CHECK (
    public.is_staff()
    AND public.has_client_access(client_id)
  );

-- Clients: can view their own scope changes
CREATE POLICY "scope_changes_client_select" ON public.scope_changes
  FOR SELECT
  USING (
    public.is_client()
    AND client_id = public.get_auth_client_id()
  );

-- Clients: can create their own scope changes
CREATE POLICY "scope_changes_client_insert" ON public.scope_changes
  FOR INSERT
  WITH CHECK (
    public.is_client()
    AND client_id = public.get_auth_client_id()
  );

-- Clients: can update their own scope changes only while pending
CREATE POLICY "scope_changes_client_update" ON public.scope_changes
  FOR UPDATE
  USING (
    public.is_client()
    AND client_id = public.get_auth_client_id()
    AND status = 'pending'
  )
  WITH CHECK (
    public.is_client()
    AND client_id = public.get_auth_client_id()
    AND status = 'pending'
  );


-- ============================================================
-- PART 2: project_requests (C-4)
-- ============================================================

-- Remove the overly permissive service_role_all policy
DROP POLICY IF EXISTS "service_role_all" ON public.project_requests;

-- Remove old client policies
DROP POLICY IF EXISTS "client_select_own" ON public.project_requests;
DROP POLICY IF EXISTS "client_insert_own" ON public.project_requests;

-- Ensure RLS is enabled
ALTER TABLE public.project_requests ENABLE ROW LEVEL SECURITY;

-- Drop any other stale policies
DROP POLICY IF EXISTS "project_requests_admin_all" ON public.project_requests;
DROP POLICY IF EXISTS "project_requests_client_select" ON public.project_requests;
DROP POLICY IF EXISTS "project_requests_client_insert" ON public.project_requests;
DROP POLICY IF EXISTS "project_requests_client_update" ON public.project_requests;
DROP POLICY IF EXISTS "project_requests_staff_select" ON public.project_requests;
DROP POLICY IF EXISTS "project_requests_staff_modify" ON public.project_requests;

-- Owner/co_owner: full access to all project requests
CREATE POLICY "project_requests_admin_all" ON public.project_requests
  FOR ALL
  USING (public.is_owner_or_co_owner())
  WITH CHECK (public.is_owner_or_co_owner());

-- Staff: can view project requests for assigned clients
CREATE POLICY "project_requests_staff_select" ON public.project_requests
  FOR SELECT
  USING (
    public.is_staff()
    AND public.has_client_access(client_id)
  );

-- Staff: full modify access for assigned clients
CREATE POLICY "project_requests_staff_modify" ON public.project_requests
  FOR ALL
  USING (
    public.is_staff()
    AND public.has_client_access(client_id)
  )
  WITH CHECK (
    public.is_staff()
    AND public.has_client_access(client_id)
  );

-- Clients: can view their own project requests
CREATE POLICY "project_requests_client_select" ON public.project_requests
  FOR SELECT
  USING (
    public.is_client()
    AND client_id = public.get_auth_client_id()
  );

-- Clients: can create their own project requests
CREATE POLICY "project_requests_client_insert" ON public.project_requests
  FOR INSERT
  WITH CHECK (
    public.is_client()
    AND client_id = public.get_auth_client_id()
  );

-- Clients: can update only their own pending requests
CREATE POLICY "project_requests_client_update" ON public.project_requests
  FOR UPDATE
  USING (
    public.is_client()
    AND client_id = public.get_auth_client_id()
    AND status = 'pending'
  )
  WITH CHECK (
    public.is_client()
    AND client_id = public.get_auth_client_id()
    AND status = 'pending'
  );
