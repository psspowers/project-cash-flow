/*
  # Add Currency and FX Rate to Purchase Orders

  ## Summary
  Adds multi-currency support metadata to the purchase_orders table.

  ## New Columns
  - `currency` (VARCHAR 3, default 'THB') — ISO currency code for the PO (THB, USD, EUR, CNY, JPY)
  - `fx_rate` (NUMERIC 12,6, default 1.000000) — Exchange rate: THB per 1 unit of currency at time of PO creation

  ## Important Notes
  1. ADDITIVE ONLY — no existing rows or constraints are modified
  2. All existing POs will have currency='THB' and fx_rate=1.000000 by default (correct behavior)
  3. The columns po_amount_excl_vat, vat_7pct, and po_amount_incl_vat ALWAYS store the THB equivalent
     — currency and fx_rate are metadata only, for display and audit purposes
  4. No RLS changes required — existing purchase_orders policies cover all columns
*/

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'THB',
  ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(12,6) DEFAULT 1.000000;
