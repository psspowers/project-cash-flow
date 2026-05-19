// ─── Workflow Approval Thresholds ────────────────────────────────────────────
// Single source of truth for all monetary thresholds used across the workflow.
// Any change here propagates automatically to every approval gate and UI label.

export const PO_THRESHOLD_CM  = 1_000_000;   // POs below this → CM is terminal approver
export const PO_THRESHOLD_EVP = 3_000_000;   // POs below this → EVP is terminal approver
export const PO_CEO_THRESHOLD = 3_000_000;   // POs at or above this → CEO approval required

export const INVOICE_CEO_THRESHOLD = 3_000_000; // Invoices at or above this → CEO approval required

export const VOUCHER_MANAGER_THRESHOLD = 1_000_000; // Vouchers at or above this → Manager co-sign required
export const VOUCHER_CEO_NOTIFY_THRESHOLD = 3_000_000; // Vouchers at or above this → CEO is notified
