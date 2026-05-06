/*
  # Merge procurement_executive and procurement_supervisor into a single 'procurement' role

  ## Summary
  The two separate procurement roles (procurement_executive and procurement_supervisor)
  are being consolidated into a single 'procurement' role. The merged role receives the
  union of both roles' permissions: full PO/supplier write access plus Approvals and
  Payment Queue page visibility.

  ## Changes
  1. Drop the old role CHECK constraint on user_profiles
  2. Update Kanokthip's role from 'procurement_executive' to 'procurement'
  3. Re-add the CHECK constraint with the new 'procurement' value (removing both old values)

  ## Notes
  - No user held the 'procurement_supervisor' role, so no data migration is needed for it
  - The constraint never included 'procurement_supervisor' (confirmed pre-migration)
*/

-- Step 1: Drop the old check constraint
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

-- Step 2: Rename the existing procurement_executive user to the new role
UPDATE user_profiles
SET role = 'procurement'
WHERE role = 'procurement_executive';

-- Step 3: Re-add the constraint with the new unified role name
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_role_check CHECK (
    role = ANY (ARRAY[
      'cost_controller',
      'construction_manager',
      'evp',
      'accounts_supervisor',
      'accounts_manager',
      'ceo',
      'procurement',
      'banking_finance_officer'
    ])
  );
