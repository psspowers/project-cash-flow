-- Make po_id optional on vendor_invoices so it can accept Direct Bills
ALTER TABLE vendor_invoices ALTER COLUMN po_id DROP NOT NULL;

-- Add expense categorization columns directly to invoices
ALTER TABLE vendor_invoices 
ADD COLUMN IF NOT EXISTS cost_category TEXT,
ADD COLUMN IF NOT EXISTS sga_subcategory TEXT,
ADD COLUMN IF NOT EXISTS description TEXT;

-- Drop the abandoned table to remove tech debt
DROP TABLE IF EXISTS project_expenses CASCADE;
