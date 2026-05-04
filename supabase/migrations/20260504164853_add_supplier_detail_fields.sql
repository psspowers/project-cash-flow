/*
  # Enrich entities table with full supplier profile fields

  ## Summary
  Adds all fields required to maintain a complete supplier/vendor profile
  and to generate legally valid Thai Purchase Order documents as PDFs.

  ## New Columns on `entities`

  ### Classification
  - `supplier_type` — enum: 'company' | 'individual' | 'petty_cash'
    Drives UI field requirements and controls which suppliers appear in PO dropdowns.
    petty_cash entries are excluded from vendor selection.

  ### Identity & Registration
  - `tax_id` — already existed; now the single identifier (Thai 13-digit TIN = company reg no.)
  - `registration_no` — removed in favour of tax_id (same number for Thai juristic persons)
  - `address` — full registered address (freeform block), appears on printed POs and WHT certs
  - `website` — company website for reference/verification

  ### Contact Person
  - `contact_person_name` — named procurement contact at this supplier
  - `contact_person_title` — their job title
  - `contact_person_phone` — their direct phone/Line
  - `contact_person_email` — their direct email (PO delivery address)

  ### Payment & Finance
  - `bank_name` — bank name for payment processing
  - `bank_branch` — branch name (required for Thai domestic transfers)
  - `bank_account_no` — account number
  - `bank_account_name` — registered account holder name (may differ from entity name)
  - `default_wht_rate` — default WHT % (0, 1, 3, 5) pre-fills the PO creation wizard

  ### General
  - `notes` — internal procurement notes (payment terms, flags, preferred contact instructions)

  ## Security
  - No new tables; existing RLS on `entities` covers all new columns.

  ## Notes
  - All new columns are nullable — existing records are not broken.
  - `supplier_type` defaults to 'company' so existing vendor records are classified sensibly.
  - payment_terms_days is intentionally omitted — terms will be set per-PO, not per-supplier.
*/

DO $$
BEGIN
  -- supplier_type enum
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'supplier_type_enum') THEN
    CREATE TYPE supplier_type_enum AS ENUM ('company', 'individual', 'petty_cash');
  END IF;
END $$;

ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS supplier_type supplier_type_enum DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS contact_person_name text,
  ADD COLUMN IF NOT EXISTS contact_person_title text,
  ADD COLUMN IF NOT EXISTS contact_person_phone text,
  ADD COLUMN IF NOT EXISTS contact_person_email text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_branch text,
  ADD COLUMN IF NOT EXISTS bank_account_no text,
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS default_wht_rate numeric(5,2),
  ADD COLUMN IF NOT EXISTS notes text;

-- Index to speed up the vendor dropdown filter (active companies/individuals only)
CREATE INDEX IF NOT EXISTS idx_entities_vendor_type_active
  ON entities (type, supplier_type, is_active);
