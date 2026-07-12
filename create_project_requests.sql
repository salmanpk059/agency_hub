CREATE TABLE IF NOT EXISTS public.project_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  budget_tier TEXT DEFAULT 'standard',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.project_requests ENABLE ROW LEVEL SECURITY;

-- Service role can do everything; client can only read/insert their own
CREATE POLICY "service_role_all" ON public.project_requests
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "client_select_own" ON public.project_requests
  FOR SELECT USING (auth.uid() IN (
    SELECT id FROM public.profiles WHERE client_id = project_requests.client_id
  ));

CREATE POLICY "client_insert_own" ON public.project_requests
  FOR INSERT WITH CHECK (auth.uid() IN (
    SELECT id FROM public.profiles WHERE client_id = project_requests.client_id
  ));
