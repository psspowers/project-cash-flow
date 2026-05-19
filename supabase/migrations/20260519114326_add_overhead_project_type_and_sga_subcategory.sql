/*
  # Add Overhead Project Type and SG&A Subcategory

  ## Summary
  Introduces first-class support for a non-construction "overhead" project type,
  primarily for SG&A (Selling, General & Administrative) expense tracking.

  ## Changes

  ### projects table
  - Add `project_type` column (text, default 'construction')
    - Values: 'construction' | 'overhead'
    - All existing rows backfilled to 'construction'

  ### project_expenses table
  - Add `sga_subcategory` column (text, nullable)
    - Only populated for expenses filed under an overhead project
    - Values: office_admin | travel_transport | it_systems | professional_fees |
              marketing_bd | staff_welfare | utilities | other
    - NULL for all existing construction expenses

  ### Seed Data
  - Insert one permanent overhead project: "SG&A — General Overhead"
    - project_type = 'overhead'
    - status = 'active'
    - contract_incl_vat = 0, contract_excl_vat = 0
    - No client entity required
    - is_financials_locked = false
    - currency = 'THB'

  ## Notes
  1. project_type defaults to 'construction' — zero impact on existing data.
  2. sga_subcategory is nullable — all existing rows remain valid.
  3. The overhead project has a stable, queryable identity via project_type = 'overhead'.
  4. No RLS changes needed — existing policies cover the new columns and project.
*/

-- ─── projects: add project_type ──────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'project_type'
  ) THEN
    ALTER TABLE projects ADD COLUMN project_type text NOT NULL DEFAULT 'construction'
      CHECK (project_type IN ('construction', 'overhead'));
  END IF;
END $$;

-- ─── project_expenses: add sga_subcategory ───────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_expenses' AND column_name = 'sga_subcategory'
  ) THEN
    ALTER TABLE project_expenses ADD COLUMN sga_subcategory text
      CHECK (sga_subcategory IN (
        'office_admin',
        'travel_transport',
        'it_systems',
        'professional_fees',
        'marketing_bd',
        'staff_welfare',
        'utilities',
        'other'
      ));
  END IF;
END $$;

-- ─── Seed: SG&A General Overhead project ─────────────────────────────────────

INSERT INTO projects (
  name,
  project_type,
  status,
  contract_incl_vat,
  contract_excl_vat,
  currency,
  is_financials_locked,
  description
)
SELECT
  'SG&A — General Overhead',
  'overhead',
  'active',
  0,
  0,
  'THB',
  false,
  'Selling, General & Administrative overhead account for non-project business expenses.'
WHERE NOT EXISTS (
  SELECT 1 FROM projects WHERE project_type = 'overhead'
);
