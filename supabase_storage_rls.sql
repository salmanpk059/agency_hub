-- Storage RLS Policies for AgencyHub
-- Run these in Supabase SQL Editor to allow authenticated logo/milestone uploads

-- Enable RLS on storage.objects (already default, but ensure it's on)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "Allow public read on logos bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload to logos bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update own objects in logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete own objects in logos" ON storage.objects;

-- 1. Public read access for 'logos' bucket (logos need to be publicly visible)
CREATE POLICY "Allow public read on logos bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'logos');

-- 2. Allow authenticated users to upload to 'logos' bucket
CREATE POLICY "Allow authenticated upload to logos bucket"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'logos'
  AND auth.role() = 'authenticated'
);

-- 3. Allow users to update their own uploads
CREATE POLICY "Allow authenticated update own objects in logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'logos'
  AND auth.role() = 'authenticated'
);

-- 4. Allow users to delete their own uploads
CREATE POLICY "Allow authenticated delete own objects in logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'logos'
  AND auth.role() = 'authenticated'
);

-- Same policies for 'receipts' bucket (milestone deliverables)
DROP POLICY IF EXISTS "Allow public read on receipts bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload to receipts bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update own objects in receipts" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete own objects in receipts" ON storage.objects;

CREATE POLICY "Allow public read on receipts bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'receipts');

CREATE POLICY "Allow authenticated upload to receipts bucket"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'receipts'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Allow authenticated update own objects in receipts"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'receipts'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Allow authenticated delete own objects in receipts"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'receipts'
  AND auth.role() = 'authenticated'
);
