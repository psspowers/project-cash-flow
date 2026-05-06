/*
  # Add wht_rate column to purchase_orders

  ## Summary
  Adds an explicit WHT rate field to purchase_orders so procurement can record
  the exact withholding tax rate (0, 1%, 3%, or 5%) at PO creation time rather
  than relying on a boolean that implied 3%.

  ## Changes
  ### Modified Tables
  - `purchase_orders`
    - New column: `wht_rate` (numeric, default 0) — stores the decimal rate selected
      at PO creation: 0 = none, 0.01 = 1%, 0.03 = 3%, 0.05 = 5%

  ## Notes
  - The existing `wht_applies` (boolean) and `wht_3pct` (amount) columns are kept
    for backwards compatibility with existing data and views.
  - `wht_rate` is the source of truth going forward; `wht_3pct` remains the
    calculated monetary amount (excl_vat * wht_rate).
  - For all existing POs: wht_rate is backfilled from wht_applies (true → 0.03, false → 0).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'wht_rate'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN wht_rate numeric DEFAULT 0;
  END IF;
END $$;

-- Backfill existing rows: wht_applies = true → 3%, false → 0%
UPDATE purchase_orders
SET wht_rate = CASE WHEN wht_applies = true THEN 0.03 ELSE 0 END
WHERE wht_rate IS NULL OR wht_rate = 0;
