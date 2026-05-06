/*
  # Add rejection support to payment_vouchers

  ## Summary
  Allows the Accounts Manager to reject a payment voucher during co-sign review.
  When rejected, the voucher is marked 'rejected' and the linked vendor invoice is
  reset back to 'released' so the Accounts Supervisor can correct and re-issue it.

  ## Changes

  ### payment_vouchers table
  - New column `rejection_comment` (text, nullable): mandatory reason entered by the Manager
  - New column `rejected_by` (uuid → auth.users, nullable): who rejected
  - New column `rejected_at` (timestamptz, nullable): when rejected
  - Updated `status` check constraint to include the new `rejected` value

  ## Notes
  1. Existing rows are unaffected — no row has status='rejected' yet
  2. The supervisor workflow: Manager rejects → voucher status = 'rejected',
     vendor_invoice status resets to 'released' → supervisor sees it again and can re-issue
*/

-- Drop existing status constraint and recreate with 'rejected' added
ALTER TABLE payment_vouchers DROP CONSTRAINT IF EXISTS payment_vouchers_status_check;

ALTER TABLE payment_vouchers
  ADD CONSTRAINT payment_vouchers_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text,
    'pending_manager'::text,
    'approved'::text,
    'issued'::text,
    'rejected'::text
  ]));

-- Add rejection tracking columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_vouchers' AND column_name = 'rejection_comment'
  ) THEN
    ALTER TABLE payment_vouchers ADD COLUMN rejection_comment text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_vouchers' AND column_name = 'rejected_by'
  ) THEN
    ALTER TABLE payment_vouchers ADD COLUMN rejected_by uuid REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_vouchers' AND column_name = 'rejected_at'
  ) THEN
    ALTER TABLE payment_vouchers ADD COLUMN rejected_at timestamptz;
  END IF;
END $$;
