-- ============================================================
-- PSS REIMPORT — STEP 1: CLEANUP
-- Run this first. Verify count = 0 before Step 2.
-- ============================================================

DELETE FROM client_invoices;
DELETE FROM client_milestones;
DELETE FROM vendor_invoices;
DELETE FROM po_milestones;
DELETE FROM purchase_orders;

-- VERIFY: all must return 0
SELECT 'purchase_orders'  AS tbl, COUNT(*) AS cnt FROM purchase_orders
UNION ALL SELECT 'po_milestones',   COUNT(*) FROM po_milestones
UNION ALL SELECT 'vendor_invoices', COUNT(*) FROM vendor_invoices
UNION ALL SELECT 'client_milestones',COUNT(*) FROM client_milestones
UNION ALL SELECT 'client_invoices', COUNT(*) FROM client_invoices;
