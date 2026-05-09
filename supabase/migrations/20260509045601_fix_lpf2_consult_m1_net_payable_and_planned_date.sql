/*
  # Fix LPF2-CONSULT / M1 — net_payable and planned_payment_date

  ## Problems

  1. net_payable = 0 on a released invoice that has a partial payment.
     - Invoice amount incl VAT : 1,000,000.00
     - Received (paid so far)  :   600,000.00
     - Outstanding balance     :   400,000.00  (Excel column Q – Invoice Balance)
     - DB net_payable currently :  0  → WRONG

  2. planned_payment_date on the milestone is 2026-03-01 (Mar 1).
     The Excel column T (Planned Date) shows 09/30/2026 = Sep 30, 2026 (MM/DD/YYYY).

  ## Fix
  - Set net_payable = invoice_amount_incl_vat - received_amount for the affected invoice
  - Update the milestone planned_payment_date to 2026-09-30
*/

-- Fix net_payable on the released invoice for LPF2-CONSULT / M1
UPDATE vendor_invoices
SET net_payable = invoice_amount_incl_vat - received_amount
WHERE po_milestone_id = (
  SELECT pm.id FROM po_milestones pm
  JOIN purchase_orders po ON po.id = pm.purchase_order_id
  WHERE po.pss_po_no = 'LPF2-CONSULT'
    AND po.project_id = '55555555-aaaa-bbbb-cccc-aaaaaaaaaaaa'
    AND pm.milestone_number = 1
)
AND status = 'released'
AND net_payable = 0
AND received_amount > 0;

-- Fix planned_payment_date on the milestone
UPDATE po_milestones
SET planned_payment_date = '2026-09-30'
WHERE purchase_order_id = (
  SELECT id FROM purchase_orders
  WHERE pss_po_no = 'LPF2-CONSULT'
    AND project_id = '55555555-aaaa-bbbb-cccc-aaaaaaaaaaaa'
)
AND milestone_number = 1;
