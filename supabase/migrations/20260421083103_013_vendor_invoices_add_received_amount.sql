/*
  # Add received_amount to vendor_invoices

  ## Summary
  Adds a received_amount column to the vendor_invoices table to track
  how much of each vendor invoice has been paid or settled to date.

  ## Changes
  1. `vendor_invoices`
    - New column: `received_amount` NUMERIC(15,2) NOT NULL DEFAULT 0
      Tracks cumulative amount paid against this vendor invoice.
*/

ALTER TABLE vendor_invoices
  ADD COLUMN IF NOT EXISTS received_amount NUMERIC(15,2) NOT NULL DEFAULT 0;
