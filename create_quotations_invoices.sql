-- Quotations and Invoices tables for AgencyHub

-- Quotations table
CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    quote_number TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired')),
    valid_until DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
    project_id UUID,
    invoice_number TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'pending', 'paid', 'overdue', 'cancelled')),
    due_date DATE,
    notes TEXT,
    file_url TEXT,
    file_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Quotations RLS
DROP POLICY IF EXISTS "Admin team can manage quotations" ON public.quotations;
CREATE POLICY "Admin team can manage quotations"
ON public.quotations FOR ALL
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'co_owner', 'staff'))
);

DROP POLICY IF EXISTS "Clients can view own quotations" ON public.quotations;
CREATE POLICY "Clients can view own quotations"
ON public.quotations FOR SELECT
USING (
    public.has_client_access(client_id)
);

-- Invoices RLS
DROP POLICY IF EXISTS "Admin team can manage invoices" ON public.invoices;
CREATE POLICY "Admin team can manage invoices"
ON public.invoices FOR ALL
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'co_owner', 'staff'))
);

DROP POLICY IF EXISTS "Clients can view own invoices" ON public.invoices;
CREATE POLICY "Clients can view own invoices"
ON public.invoices FOR SELECT
USING (
    public.has_client_access(client_id)
);

-- Client can update own invoice status (for payment upload)
DROP POLICY IF EXISTS "Clients can update own invoice status" ON public.invoices;
CREATE POLICY "Clients can update own invoice status"
ON public.invoices FOR UPDATE
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'client' AND client_id = invoices.client_id)
);
