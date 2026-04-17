-- ============================================================
-- Business Documents Verification Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1) Create business_documents table
CREATE TABLE IF NOT EXISTS public.business_documents (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  doc_type     TEXT NOT NULL CHECK (doc_type IN ('DTI', 'MAYORS_PERMIT', 'BIR', 'VALID_ID', 'TIN_NUMBER')),
  file_url     TEXT,                      -- NULL for TIN_NUMBER (text doc)
  tin_number   TEXT,                      -- Only filled for TIN_NUMBER type
  status       TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  admin_comment  TEXT,                    -- Admin writes feedback when rejecting
  owner_comment  TEXT,                    -- Owner writes note on re-upload
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(business_id, doc_type)
);

-- 2) Enable RLS
ALTER TABLE public.business_documents ENABLE ROW LEVEL SECURITY;

-- 3) Owners can view their own business documents
DROP POLICY IF EXISTS "Owners can view own documents" ON public.business_documents;
CREATE POLICY "Owners can view own documents"
  ON public.business_documents FOR SELECT
  TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
  );

-- 4) Owners can insert their own business documents
DROP POLICY IF EXISTS "Owners can insert own documents" ON public.business_documents;
CREATE POLICY "Owners can insert own documents"
  ON public.business_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
  );

-- 5) Owners can update their own docs (for re-uploads after rejection)
DROP POLICY IF EXISTS "Owners can update own documents" ON public.business_documents;
CREATE POLICY "Owners can update own documents"
  ON public.business_documents FOR UPDATE
  TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
  );

-- 6) Admins can view ALL business documents
DROP POLICY IF EXISTS "Admins can view all documents" ON public.business_documents;
CREATE POLICY "Admins can view all documents"
  ON public.business_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- 7) Admins can update document status and comments
DROP POLICY IF EXISTS "Admins can update all documents" ON public.business_documents;
CREATE POLICY "Admins can update all documents"
  ON public.business_documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- 8) updated_at auto-trigger
CREATE OR REPLACE FUNCTION update_business_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_business_documents_updated_at ON public.business_documents;
CREATE TRIGGER set_business_documents_updated_at
  BEFORE UPDATE ON public.business_documents
  FOR EACH ROW EXECUTE FUNCTION update_business_documents_updated_at();

-- ============================================================
-- Storage bucket for business verification documents
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('business-documents', 'business-documents', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload business documents" ON storage.objects;
CREATE POLICY "Authenticated users can upload business documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'business-documents');

DROP POLICY IF EXISTS "Anyone authenticated can read business documents" ON storage.objects;
CREATE POLICY "Anyone authenticated can read business documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'business-documents');

DROP POLICY IF EXISTS "Owners can update their business documents" ON storage.objects;
CREATE POLICY "Owners can update their business documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'business-documents');
