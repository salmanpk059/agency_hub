-- Add optional banking details columns to app_settings
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS bank_account_name TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS bank_iban TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS bank_swift TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS bank_qr_url TEXT;
