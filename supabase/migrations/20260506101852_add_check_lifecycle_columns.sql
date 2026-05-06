/*
  # Add Check Lifecycle Columns

  Extends the `checks` table to support the full three-stage banking officer
  workflow: Issue Check → Check Cleared → Payment History.

  ## Changes
  - `checks` table:
    - Add `cleared_at` (timestamptz) — timestamp when banking officer marks check as cleared by bank
    - Add `cleared_note` (text) — optional note when marking cleared
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checks' AND column_name = 'cleared_at'
  ) THEN
    ALTER TABLE checks ADD COLUMN cleared_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checks' AND column_name = 'cleared_note'
  ) THEN
    ALTER TABLE checks ADD COLUMN cleared_note text;
  END IF;
END $$;
