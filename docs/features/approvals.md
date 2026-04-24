# Approvals Feature

## The approvals queue (`/approvals`)

The Approvals page shows all items that are pending the current user's action. The queue is role-filtered — each role sees only what they can approve or reject.

---

## What each role sees

### Construction Manager (`construction_manager`)

- **Project costings** with status `submitted` — can approve (moves to `cm_approved`) or reject (moves back to `draft`)
- **Progress reports** with status `submitted` — can approve (`cm_approved`) or reject (`cm_rejected`)

### EVP (`evp`)

- **Project costings** with status `cm_approved` — can approve (`evp_approved`) or reject (`evp_rejected`)
- **Purchase orders** with status `pending_approval` — can approve (`approved`) or reject (`draft` with rejection reason)
- **Vendor invoices** with status `approved_cm` — can approve (`approved_evp`)
- **Cash transfers** with status `proposed` — can recommend (`evp_recommended`)

### Accounts Manager (`accounts_manager`)

- **Payment vouchers** with `requires_manager_approval = true` and status `pending_manager` — can approve (`approved`) or hold

### CEO (`ceo`)

- **Cash transfers** with status `evp_recommended` — can approve (`ceo_approved`) or reject
- Large payment vouchers are surfaced via the CEO Alerts page, not the main approvals queue

---

## Pending count badge

The sidebar shows a badge on the Approvals link with the number of items pending the current user's action. This is computed by `getPendingApprovals()` which takes the user's role and the loaded data sets.

---

## Approval audit trail

Every approval or rejection records:

- Who acted (`*_by` UUID column → `user_profiles`)
- When they acted (`*_at` timestamp)
- Any comments (`*_comments` or `rejection_reason`)

This audit trail is stored directly on each entity row — there is no separate audit log table.

---

## Project costing approval flow

```
Cost Controller creates draft costing
  → status: draft

Cost Controller submits
  → status: submitted

Construction Manager reviews
  → Approve → status: cm_approved, cm_approved_by, cm_approved_at set
  → Reject  → status: cm_rejected, cm_comments set

EVP reviews (if cm_approved)
  → Approve → status: evp_approved, evp_approved_by, evp_approved_at set
              project status advances (estimation_approved or active)
  → Reject  → status: evp_rejected, evp_comments set
              project status returns to estimation_draft or budget_draft
```

---

## Vendor invoice approval flow

```
Accounts Supervisor records vendor invoice
  → status: received

Progress report submitted by site team
  → progress_report.status: submitted

Construction Manager approves progress report
  → progress_report.status: cm_approved

EVP approves vendor invoice
  → vendor_invoice.status: approved_evp

Accounts Supervisor releases for payment
  → vendor_invoice.status: released

Payment Voucher created and paid
  → vendor_invoice.status: paid
```

---

## Payment voucher approval

Vouchers are created by Accounts Supervisor. If `net_paid >= ฿3,000,000`:

- `requires_manager_approval` is set to `true`
- Status becomes `pending_manager`
- Accounts Manager must approve before the voucher can be issued
- CEO is notified (`ceo_notified = true`) for visibility

Vouchers below ฿3M do not require manager approval and can be issued directly.

---

*Update this file when the approval chain logic or threshold amounts change.*
