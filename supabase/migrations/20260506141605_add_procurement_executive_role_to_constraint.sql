/*
  # Add procurement_executive to user_profiles role constraint

  The existing role check constraint on user_profiles does not include
  'procurement_executive', which was intended to be added as part of the
  procurement roles expansion. This migration updates the constraint to
  allow this role value.

  1. Changes
    - Drop existing user_profiles_role_check constraint
    - Re-add it with 'procurement_executive' included in the allowed values
*/

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
    'procurement_executive',
    'banking_finance_officer'
  ]));
