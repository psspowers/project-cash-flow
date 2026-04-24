/*
  # PSS Stage 2 Schema Updates

  ## Summary
  Adds the new status value 'budget_cm_approved' to the projects status constraint,
  adds rejection comment columns to projects, and ensures submitted_by/submitted_at
  exist on project_costings.

  ## Changes

  ### projects table
  - Drops and recreates the status CHECK constraint to include 'budget_cm_approved'
    as the 8th allowed value (all 8 statuses are now enforced)
  - Adds last_rejection_comment (text): stores the most recent rejection note
  - Adds last_rejected_by (uuid → auth.users): who rejected
  - Adds last_rejected_at (timestamptz): when rejection occurred
  - Adds last_rejected_stage (text): human-readable stage label at time of rejection

  ### project_costings table
  - Adds submitted_by (uuid → auth.users) if not already present
  - Adds submitted_at (timestamptz) if not already present

  ## Notes
  - Uses IF NOT EXISTS / IF EXISTS guards throughout
  - DEFAULT for status remains 'estimation_draft' (unchanged from Stage 1)
*/

-- ─── 1. projects: drop old status check and add new one ───────────────────────

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN (
    'estimation_draft',
    'estimation_submitted',
    'estimation_cm_approved',
    'budget_draft',
    'budget_submitted',
    'budget_cm_approved',
    'active',
    'completed'
  ));

-- ─── 2. projects: rejection metadata columns ──────────────────────────────────

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS last_rejection_comment text,
  ADD COLUMN IF NOT EXISTS last_rejected_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS last_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_rejected_stage text;

-- ─── 3. project_costings: ensure submission tracking columns exist ─────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_costings' AND column_name = 'submitted_by'
  ) THEN
    ALTER TABLE project_costings ADD COLUMN submitted_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_costings' AND column_name = 'submitted_at'
  ) THEN
    ALTER TABLE project_costings ADD COLUMN submitted_at timestamptz;
  END IF;
END $$;
