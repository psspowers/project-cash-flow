export const VENDOR_INVOICE_UNPAID_STATUSES = [
  'received', 'approved_cm', 'approved_evp', 'released'
] as const;
// Note: 'rejected' is excluded because it is a voided claim, returning the liability to Col P.

export const VENDOR_INVOICE_PAID_STATUSES = ['paid'] as const;

export const CLIENT_INVOICE_UNPAID_STATUSES = [
  'pending', 'partially_received'
] as const;
