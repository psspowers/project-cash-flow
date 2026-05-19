/*
  # Add Edit Request Fields to Checks Table

  ## Summary
  Enables a "Request to Edit" workflow where the banking finance officer can flag
  a check for detail changes (e.g., bank account switch). The accounts manager
  then edits and approves the check directly, after which it proceeds to issued
  status as normal.

  ## Changes

  ### checks table — 4 new nullable columns
  - `edit_request_status` (text, nullable)
      NULL = no active request
      'pending' = banking officer has raised a change request
      'approved' = accounts manager has edited and approved
  - `edit_requested_by` (uuid, FK → user_profiles, nullable) — who raised the request
  - `edit_requested_at` (timestamptz, nullable) — when the request was raised
  - `edit_request_note` (text, nullable) — optional reason provided by the banking officer

  ## Security
  No new RLS policies needed. Existing banking_finance_officer INSERT/UPDATE
  and accounts_manager UPDATE policies cover the new columns.

  ## Notes
  1. All new columns are nullable — zero impact on existing check records.
  2. edit_request_status uses a CHECK constraint for valid values.
  3. An index on edit_request_status speeds up the accounts manager queue query.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checks' AND column_name = 'edit_request_status'
  ) THEN
    ALTER TABLE checks ADD COLUMN edit_request_status text
      CHECK (edit_request_status IN ('pending', 'approved'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checks' AND column_name = 'edit_requested_by'
  ) THEN
    ALTER TABLE checks ADD COLUMN edit_requested_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checks' AND column_name = 'edit_requested_at'
  ) THEN
    ALTER TABLE checks ADD COLUMN edit_requested_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checks' AND column_name = 'edit_request_note'
  ) THEN
    ALTER TABLE checks ADD COLUMN edit_request_note text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS checks_edit_request_status_idx ON checks(edit_request_status);
