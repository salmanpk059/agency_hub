-- ============================================================
-- HIGH SEVERITY RLS FIXES (H-1 and H-4)
-- ============================================================

-- H-1: Restrict app_settings SELECT to authenticated users only
DROP POLICY IF EXISTS "App Settings are viewable by everyone" ON public.app_settings;
CREATE POLICY "App Settings are viewable by authenticated users"
ON public.app_settings FOR SELECT
USING (auth.role() = 'authenticated');

-- H-4: Restrict storage uploads to authorized users
-- Logos: only owner/co_owner can upload
DROP POLICY IF EXISTS "Allow authenticated upload to logos bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update own objects in logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete own objects in logos" ON storage.objects;

CREATE POLICY "Allow admin upload to logos bucket"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'logos'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'co_owner'))
);

CREATE POLICY "Allow admin update logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'logos'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'co_owner'))
);

CREATE POLICY "Allow admin delete logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'logos'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'co_owner'))
);

-- Receipts: client who owns the project OR assigned staff/owner can upload
DROP POLICY IF EXISTS "Allow authenticated upload to receipts bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update own objects in receipts" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete own objects in receipts" ON storage.objects;

CREATE POLICY "Allow authorized upload to receipts bucket"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'receipts'
  AND auth.role() = 'authenticated'
  AND (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'co_owner'))
    OR owner_id = auth.uid()
  )
);

CREATE POLICY "Allow authorized update receipts"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'receipts'
  AND auth.role() = 'authenticated'
  AND (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'co_owner'))
    OR owner_id = auth.uid()
  )
);

CREATE POLICY "Allow authorized delete receipts"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'receipts'
  AND auth.role() = 'authenticated'
  AND (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'co_owner'))
    OR owner_id = auth.uid()
  )
);
