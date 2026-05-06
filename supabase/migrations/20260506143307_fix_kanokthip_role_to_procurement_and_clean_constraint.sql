/*
  # Fix Kanokthip role and clean up procurement_executive from constraint

  ## Problem
  When Kanokthip's account was recreated today, her role was inserted as
  'procurement_executive'. However the entire application codebase (TypeScript
  types, role config, sidebar navigation) only recognises 'procurement' —
  'procurement_executive' was merged into 'procurement' in migration
  20260506064314_merge_procurement_roles.sql.

  The today's migration that re-added 'procurement_executive' to the constraint
  inadvertently undid that merge for future inserts.

  ## Changes
  1. Update Kanokthip's user_profiles role from 'procurement_executive' to 'procurement'
  2. Remove 'procurement_executive' from the user_profiles_role_check constraint
     to restore the clean merged state

  ## Security
  No RLS changes — existing policies unchanged.
*/

-- Step 1: Fix Kanokthip's role
UPDATE public.user_profiles
SET role = 'procurement'
WHERE email = 'kanokthip@psspowers.com'
  AND role = 'procurement_executive';

-- Step 2: Restore the constraint to the merged state (no procurement_executive)
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role = ANY (ARRAY[
    'cost_controller',
    'construction_manager',
    'evp',
    'accounts_supervisor',
    'accounts_manager',
    'ceo',
    'procurement',
    'banking_finance_officer'
  ]));
