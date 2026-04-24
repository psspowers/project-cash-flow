/*
  # Fix project status constraint and RCP data

  1. Problem
    - The projects_status_check constraint is missing 'estimation_approved' and 'budget_approved' statuses
    - The application code sets these statuses after EVP approval, but the constraint rejects them
    - This caused the RCP project to stay at 'estimation_cm_approved' even after EVP approved the costing

  2. Changes
    - Drop and recreate the constraint with the full list of valid statuses
    - Fix the RCP project status to 'estimation_approved' (costing is already evp_approved)

  3. Valid statuses (full list)
    - estimation_draft, estimation_submitted, estimation_cm_approved, estimation_approved
    - budget_draft, budget_submitted, budget_cm_approved, budget_approved
    - active, completed
*/

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (
  status = ANY (ARRAY[
    'estimation_draft',
    'estimation_submitted',
    'estimation_cm_approved',
    'estimation_approved',
    'budget_draft',
    'budget_submitted',
    'budget_cm_approved',
    'budget_approved',
    'active',
    'completed'
  ])
);

UPDATE projects
SET status = 'estimation_approved'
WHERE id = '44444444-aaaa-bbbb-cccc-aaaaaaaaaaaa'
  AND status = 'estimation_cm_approved';
