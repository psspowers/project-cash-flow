/*
  # Retire Loan Ledger — Drop Legacy Tables and Columns

  ## Summary
  The old Loan Ledger page has been retired in favour of the Treasury Dashboard,
  which uses an event-sourced ledger model (loan_transactions). This migration
  drops the database objects that were created exclusively for the old Loan Ledger
  and are no longer used anywhere in the application.

  ## Changes

  ### Table Dropped
  - `loan_repayments` — entire table removed. It stored flat repayment records
    and has no data. The Treasury system uses `loan_transactions` instead.

  ### Columns Dropped from `loans`
  - `loan_type` — old 'received'/'given' classifier, replaced by `facility_type`
  - `outstanding_balance` — deprecated flat snapshot column; Treasury calculates
    balances dynamically from `loan_transactions` events
  - `drawdown_date` — single drawdown date concept; Treasury records individual
    drawdown events in `loan_transactions`
  - `fx_rate_if_usd` — never used by the Treasury system

  ### Columns Kept on `loans`
  - id, counterparty_id, principal, currency, due_date, notes, created_at,
    facility_type, name — all still used by Treasury Dashboard

  ## Notes
  - No data is present in any of the dropped objects (confirmed before migration)
  - `loan_transactions`, `sga_actuals`, and `treasury_adjustments` are unaffected
*/

-- Drop the loan_repayments table (Loan Ledger-only, no data)
DROP TABLE IF EXISTS loan_repayments;

-- Drop legacy columns from loans table
ALTER TABLE loans
  DROP COLUMN IF EXISTS loan_type,
  DROP COLUMN IF EXISTS outstanding_balance,
  DROP COLUMN IF EXISTS drawdown_date,
  DROP COLUMN IF EXISTS fx_rate_if_usd;
