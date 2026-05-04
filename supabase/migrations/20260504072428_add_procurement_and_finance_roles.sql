/*
  # Add new roles to user_profiles

  1. Changes
    - Drops and recreates the role CHECK constraint on user_profiles to include:
      - procurement_executive (for Kanokthip)
      - banking_finance_officer (for Pawitchaya)
*/

ALTER TABLE user_profiles
  DROP CONSTRAINT user_profiles_role_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_role_check CHECK (
    role = ANY (ARRAY[
      'cost_controller',
      'construction_manager',
      'evp',
      'accounts_supervisor',
      'accounts_manager',
      'ceo',
      'procurement_executive',
      'banking_finance_officer'
    ])
  );
