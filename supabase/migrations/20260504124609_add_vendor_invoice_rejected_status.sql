/*
  # Add rejected status to vendor_invoices

  ## Summary
  Extends the vendor invoice approval workflow to support rejection by the Construction Manager.

  ## Changes
  ### Modified Tables
  - `vendor_invoices`
    - New column `rejection_comment` (text, nullable): stores the CM's reason for rejection
    - New column `rejected_by` (uuid, nullable): stores the user ID who rejected the invoice
    - Updated `status` check constraint to include the new `rejected` value

  ## Status Flow
  received → approved_cm → approved_evp → released → paid
  received → rejected (CM sends back to Cost Controller with mandatory comment)

  ## Notes
  1. The existing constraint is dropped and recreated to include 'rejected'
  2. No data is affected — all existing rows remain valid (no existing row has status='rejected')
  3. RLS policies are unchanged — the new columns inherit the same table-level policies
*/

-- Drop old check constraint
ALTER TABLE vendor_invoices DROP CONSTRAINT IF EXISTS vendor_invoices_status_check;

-- Add new check constraint including 'rejected'
ALTER TABLE vendor_invoices
  ADD CONSTRAINT vendor_invoices_status_check
  CHECK (status = ANY (ARRAY[
    'received'::text,
    'approved_cm'::text,
    'approved_evp'::text,
    'released'::text,
    'paid'::text,
    'rejected'::text
  ]));

-- Add rejection tracking columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendor_invoices' AND column_name = 'rejection_comment'
  ) THEN
    ALTER TABLE vendor_invoices ADD COLUMN rejection_comment text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendor_invoices' AND column_name = 'rejected_by'
  ) THEN
    ALTER TABLE vendor_invoices ADD COLUMN rejected_by uuid REFERENCES auth.users(id);
  END IF;
END $$;
