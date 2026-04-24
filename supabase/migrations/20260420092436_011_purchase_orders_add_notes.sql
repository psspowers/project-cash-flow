/*
  # Add notes column to purchase_orders

  Tracks the notes TEXT column added directly in Supabase to ensure
  it is recorded in migrations and not dropped by future schema changes.
*/

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS notes TEXT;
