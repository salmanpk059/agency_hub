-- Supabase Migration Script for AgencyHub
-- This script sets up the schema, profile triggers, and RLS (Row Level Security) rules.

-- 1. Create Profiles table (now independent, linked dynamically via triggers)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY, -- Removed hard foreign key so we can insert BEFORE auth signup
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'co_owner', 'staff', 'client')),
    full_name TEXT,
    client_id UUID, -- NULL for agency members, points to clients(id) for clients
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Clean up old foreign key constraint on profiles if it exists
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 2. Create Clients table
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending_signup')),
    currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'GBP', 'EUR')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add foreign key constraint to profiles pointing to clients
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS fk_profiles_client_id;

ALTER TABLE public.profiles 
ADD CONSTRAINT fk_profiles_client_id 
FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

-- Create Staff Client Access join table
CREATE TABLE IF NOT EXISTS public.staff_client_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(staff_id, client_id)
);

-- Ensure ON UPDATE CASCADE is applied for existing databases
ALTER TABLE public.staff_client_access DROP CONSTRAINT IF EXISTS staff_client_access_staff_id_fkey;
ALTER TABLE public.staff_client_access ADD CONSTRAINT staff_client_access_staff_id_fkey 
FOREIGN KEY (staff_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Create Milestones table
CREATE TABLE IF NOT EXISTS public.milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'pending', 'paid')),
    file_name TEXT,
    file_size INTEGER,
    file_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create Messages table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure ON UPDATE CASCADE is applied for existing databases
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE public.messages ADD CONSTRAINT messages_sender_id_fkey 
FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 6. RLS Helper functions and policies

-- Helper function to check if the current user is an agency member (owner, co_owner, staff)
CREATE OR REPLACE FUNCTION public.is_agency_member()
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() 
        AND role IN ('owner', 'co_owner', 'staff')
    );
END;
$$ LANGUAGE plpgsql;

-- Helper function to check if user has access to a given client
CREATE OR REPLACE FUNCTION public.has_client_access(client_uuid UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
DECLARE
    user_role TEXT;
    user_client_id UUID;
BEGIN
    -- Get current user role and client_id
    SELECT role, client_id INTO user_role, user_client_id
    FROM public.profiles
    WHERE id = auth.uid();

    -- Owner/co_owner has access to all
    IF user_role IN ('owner', 'co_owner') THEN
        RETURN TRUE;
    END IF;

    -- Staff only has access if they are assigned to this client in staff_client_access
    IF user_role = 'staff' THEN
        RETURN EXISTS (
            SELECT 1 FROM public.staff_client_access
            WHERE staff_id = auth.uid() AND client_id = client_uuid
        );
    END IF;

    -- Client only has access if it's their own client_id
    IF user_role = 'client' THEN
        RETURN user_client_id = client_uuid;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Staff Client Access Policies
CREATE POLICY "Staff client access is viewable by owners, co_owners, or the staff themselves"
ON public.staff_client_access FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('owner', 'co_owner')
    ) OR staff_id = auth.uid()
);

CREATE POLICY "Staff client access is manageable only by owners and co_owners"
ON public.staff_client_access FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('owner', 'co_owner')
    )
);

-- Profiles Policies
CREATE POLICY "Profiles select policy"
ON public.profiles FOR SELECT
USING (
    -- Owners and co_owners can see all
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'co_owner'))
    OR id = auth.uid() -- self
    -- Staff can see self, other staff/owners, and clients they have access to
    OR (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'staff')
        AND (
            role IN ('owner', 'co_owner', 'staff')
            OR (role = 'client' AND EXISTS (
                SELECT 1 FROM public.staff_client_access 
                WHERE staff_id = auth.uid() AND client_id = public.profiles.client_id
            ))
        )
    )
    -- Clients can see self, agency members, and other client profiles of their same client_id
    OR (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'client')
        AND (
            role IN ('owner', 'co_owner', 'staff')
            OR client_id = (SELECT client_id FROM public.profiles WHERE id = auth.uid())
        )
    )
);

CREATE POLICY "Profiles update policy"
ON public.profiles FOR UPDATE
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'co_owner'))
    OR id = auth.uid()
);

-- Clients Policies
CREATE POLICY "Clients select policy"
ON public.clients FOR SELECT
USING (
    public.has_client_access(id)
);

CREATE POLICY "Clients modify policy"
ON public.clients FOR ALL
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'co_owner'))
    OR (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'staff')
        AND EXISTS (SELECT 1 FROM public.staff_client_access WHERE staff_id = auth.uid() AND client_id = id)
    )
);

-- Milestones Policies
CREATE POLICY "Milestones select policy"
ON public.milestones FOR SELECT
USING (
    public.has_client_access(client_id)
);

CREATE POLICY "Milestones modify policy"
ON public.milestones FOR ALL
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'co_owner'))
    OR (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'staff')
        AND EXISTS (SELECT 1 FROM public.staff_client_access WHERE staff_id = auth.uid() AND client_id = milestones.client_id)
    )
    OR (
        -- Clients can update milestone status to pending when uploading file
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'client')
        AND client_id = (SELECT client_id FROM public.profiles WHERE id = auth.uid())
    )
);

-- Messages Policies
CREATE POLICY "Messages select policy"
ON public.messages FOR SELECT
USING (
    public.has_client_access(client_id)
);

CREATE POLICY "Messages insert policy"
ON public.messages FOR INSERT
WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'co_owner'))
    OR (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'staff')
        AND EXISTS (SELECT 1 FROM public.staff_client_access WHERE staff_id = auth.uid() AND client_id = messages.client_id)
    )
    OR (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'client')
        AND client_id = (SELECT client_id FROM public.profiles WHERE id = auth.uid())
        AND sender_id = auth.uid()
    )
);

-- 8. Create App Settings table
CREATE TABLE IF NOT EXISTS public.app_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    logo_url TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) on App Settings
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- App Settings Policies
CREATE POLICY "App Settings are viewable by everyone"
ON public.app_settings FOR SELECT
USING (true);

CREATE POLICY "App Settings are manageable by owner/co_owner"
ON public.app_settings FOR ALL
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'co_owner'))
);


-- ====================================================
-- 9. STRICT USER REGISTRATION WHITELIST & SYNC TRIGGERS
-- ====================================================

-- Trigger function 1: Checks if the signing-up email is invited (exists in profiles or is the Master Owner Email)
CREATE OR REPLACE FUNCTION public.check_invited_email_before_signup()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
    -- 1. Check if the email is the hardcoded Master Owner Email
    IF LOWER(NEW.email) = 'abdullahdevdesign@gmail.com' THEN
        RETURN NEW;
    END IF;

    -- 2. Check if the email already exists in public.profiles
    IF EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE LOWER(email) = LOWER(NEW.email)
    ) THEN
        RETURN NEW;
    END IF;

    -- 3. Otherwise, reject the signup completely at database level
    RAISE EXCEPTION 'This email has not been invited by an agency.';
END;
$$ LANGUAGE plpgsql;

-- Register BEFORE INSERT trigger on auth.users
DROP TRIGGER IF EXISTS tr_check_invited_email_before_signup ON auth.users;
CREATE TRIGGER tr_check_invited_email_before_signup
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.check_invited_email_before_signup();


-- Trigger function 2: Syncs the pre-created profile ID with the actual auth.users ID upon successful signup
CREATE OR REPLACE FUNCTION public.sync_profile_id_on_signup()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
    UPDATE public.profiles
    SET id = NEW.id
    WHERE LOWER(email) = LOWER(NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Register AFTER INSERT trigger on auth.users
DROP TRIGGER IF EXISTS tr_sync_profile_id_on_signup ON auth.users;
CREATE TRIGGER tr_sync_profile_id_on_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_id_on_signup();


-- Trigger function 3: Cascade deletes the profile if their auth.users record is deleted
CREATE OR REPLACE FUNCTION public.handle_deleted_auth_user()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
    DELETE FROM public.profiles WHERE id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Register AFTER DELETE trigger on auth.users
DROP TRIGGER IF EXISTS tr_handle_deleted_auth_user ON auth.users;
CREATE TRIGGER tr_handle_deleted_auth_user
AFTER DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_deleted_auth_user();


-- ====================================================
-- 7. Audit Log and Scope Changes (Pass 2 additions)
-- ====================================================

-- Run ALTERS for safety on existing clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'GBP', 'EUR'));

-- Create Audit Log table
CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_email TEXT,
    action TEXT NOT NULL,
    target TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Scope Changes table
CREATE TABLE IF NOT EXISTS public.scope_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on audit_log and scope_changes
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_changes ENABLE ROW LEVEL SECURITY;

-- Audit Log Policies
DROP POLICY IF EXISTS "System and authed users can insert audit logs" ON public.audit_log;
CREATE POLICY "System and authed users can insert audit logs"
ON public.audit_log FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Admin team can read audit logs" ON public.audit_log;
CREATE POLICY "Admin team can read audit logs"
ON public.audit_log FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('owner', 'co_owner', 'staff')
    )
);

-- Scope Changes Policies
DROP POLICY IF EXISTS "Clients can view their own scope changes" ON public.scope_changes;
CREATE POLICY "Clients can view their own scope changes"
ON public.scope_changes FOR SELECT
USING (
    public.has_client_access(client_id)
);

DROP POLICY IF EXISTS "Clients can create scope changes" ON public.scope_changes;
CREATE POLICY "Clients can create scope changes"
ON public.scope_changes FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'client' AND client_id = scope_changes.client_id
    )
);

DROP POLICY IF EXISTS "Admin team can view scope changes" ON public.scope_changes;
CREATE POLICY "Admin team can view scope changes"
ON public.scope_changes FOR SELECT
USING (
    public.has_client_access(client_id)
);

DROP POLICY IF EXISTS "Admin team can update scope changes" ON public.scope_changes;
CREATE POLICY "Admin team can update scope changes"
ON public.scope_changes FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('owner', 'co_owner', 'staff')
    )
);

