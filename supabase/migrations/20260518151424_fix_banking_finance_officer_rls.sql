/*
  # Fix RLS Policies for banking_finance_officer Role

  ## Summary
  The banking_finance_officer role was omitted from INSERT and UPDATE policies
  on all core finance/check tables, blocking the Banking Officer from issuing
  checks, recording payments, and reconciling checks.

  ## Tables Fixed
  - `checks` — INSERT and UPDATE (check issuance and reconciliation)
  - `payment_vouchers` — INSERT and UPDATE
  - `vendor_invoice_payments` — INSERT and UPDATE
  - `client_invoice_payments` — INSERT and UPDATE (Privileged policies)
  - `voucher_sequences` — INSERT and UPDATE

  ## Changes
  Each affected INSERT and UPDATE policy is dropped and recreated with
  'banking_finance_officer' added to the allowed roles array.

  ## Notes
  - SELECT policies are unaffected (already open to all authenticated users)
  - The open "Authenticated users can insert/update invoice_payments" policies
    on client_invoice_payments are also dropped as they conflict with/override
    the privileged policies, which is a security gap.
*/

-- ============================================================
-- checks
-- ============================================================
DROP POLICY IF EXISTS "Privileged insert checks" ON checks;
CREATE POLICY "Privileged insert checks"
  ON checks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'accounts_supervisor', 'accounts_manager', 'banking_finance_officer', 'ceo'
        ])
    )
  );

DROP POLICY IF EXISTS "Privileged update checks" ON checks;
CREATE POLICY "Privileged update checks"
  ON checks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'accounts_supervisor', 'accounts_manager', 'banking_finance_officer', 'ceo'
        ])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'accounts_supervisor', 'accounts_manager', 'banking_finance_officer', 'ceo'
        ])
    )
  );

-- ============================================================
-- payment_vouchers
-- ============================================================
DROP POLICY IF EXISTS "Privileged insert payment_vouchers" ON payment_vouchers;
CREATE POLICY "Privileged insert payment_vouchers"
  ON payment_vouchers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'accounts_supervisor', 'accounts_manager', 'banking_finance_officer', 'ceo'
        ])
    )
  );

DROP POLICY IF EXISTS "Privileged update payment_vouchers" ON payment_vouchers;
CREATE POLICY "Privileged update payment_vouchers"
  ON payment_vouchers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'accounts_supervisor', 'accounts_manager', 'banking_finance_officer', 'ceo'
        ])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'accounts_supervisor', 'accounts_manager', 'banking_finance_officer', 'ceo'
        ])
    )
  );

-- ============================================================
-- vendor_invoice_payments
-- ============================================================
DROP POLICY IF EXISTS "Privileged insert vendor_invoice_payments" ON vendor_invoice_payments;
CREATE POLICY "Privileged insert vendor_invoice_payments"
  ON vendor_invoice_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'accounts_supervisor', 'accounts_manager', 'banking_finance_officer', 'ceo'
        ])
    )
  );

DROP POLICY IF EXISTS "Privileged update vendor_invoice_payments" ON vendor_invoice_payments;
CREATE POLICY "Privileged update vendor_invoice_payments"
  ON vendor_invoice_payments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'accounts_supervisor', 'accounts_manager', 'banking_finance_officer', 'ceo'
        ])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'accounts_supervisor', 'accounts_manager', 'banking_finance_officer', 'ceo'
        ])
    )
  );

-- ============================================================
-- client_invoice_payments
-- Drop the overly-broad open policies that bypass the privileged ones,
-- then recreate privileged policies with banking_finance_officer included.
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can insert invoice payments" ON client_invoice_payments;
DROP POLICY IF EXISTS "Authenticated users can update invoice payments" ON client_invoice_payments;
DROP POLICY IF EXISTS "Authenticated users can delete invoice payments" ON client_invoice_payments;

DROP POLICY IF EXISTS "Privileged insert client_invoice_payments" ON client_invoice_payments;
CREATE POLICY "Privileged insert client_invoice_payments"
  ON client_invoice_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'accounts_supervisor', 'accounts_manager', 'banking_finance_officer', 'ceo'
        ])
    )
  );

DROP POLICY IF EXISTS "Privileged update client_invoice_payments" ON client_invoice_payments;
CREATE POLICY "Privileged update client_invoice_payments"
  ON client_invoice_payments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'accounts_supervisor', 'accounts_manager', 'banking_finance_officer', 'ceo'
        ])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'accounts_supervisor', 'accounts_manager', 'banking_finance_officer', 'ceo'
        ])
    )
  );

DROP POLICY IF EXISTS "Privileged delete client_invoice_payments" ON client_invoice_payments;
CREATE POLICY "Privileged delete client_invoice_payments"
  ON client_invoice_payments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'accounts_supervisor', 'accounts_manager', 'banking_finance_officer', 'ceo'
        ])
    )
  );

-- ============================================================
-- voucher_sequences
-- ============================================================
DROP POLICY IF EXISTS "Privileged insert voucher_sequences" ON voucher_sequences;
CREATE POLICY "Privileged insert voucher_sequences"
  ON voucher_sequences FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'accounts_supervisor', 'accounts_manager', 'banking_finance_officer', 'ceo'
        ])
    )
  );

DROP POLICY IF EXISTS "Privileged update voucher_sequences" ON voucher_sequences;
CREATE POLICY "Privileged update voucher_sequences"
  ON voucher_sequences FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'accounts_supervisor', 'accounts_manager', 'banking_finance_officer', 'ceo'
        ])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'accounts_supervisor', 'accounts_manager', 'banking_finance_officer', 'ceo'
        ])
    )
  );
