# Database Schema

All tables live in the `public` schema on Supabase PostgreSQL. Every table has Row Level Security enabled. UUIDs are generated with `gen_random_uuid()`. Timestamps default to `now()`.

---

## Table index

| Table | Purpose |
|---|---|
| `user_profiles` | Extended profile for every auth user |
| `entities` | Clients, vendors, subsidiaries, lenders |
| `projects` | Core project records |
| `project_costings` | Estimation and budget costing sheets |
| `variation_orders` | Client-approved scope changes |
| `milestones` | Client billing milestones per project |
| `milestone_invoices` | Invoices issued against milestones |
| `purchase_orders` | Vendor purchase orders |
| `po_milestones` | Payment schedule for a PO |
| `vendor_invoices` | Vendor invoices received |
| `progress_reports` | Site progress reports linked to vendor invoices |
| `payment_vouchers` | Payment vouchers for vendor payments |
| `checks` | Physical cheques linked to vouchers |
| `cash_receipts` | Client cash receipts |
| `project_cash_transfers` | Internal cash transfers between projects |
| `loans` | Loans received or given |
| `loan_repayments` | Repayment events for a loan |
| `notifications` | In-app notifications |
| `project_views` | Tracks when each user last viewed each project |
| `voucher_sequences` | Auto-incrementing voucher number per year |

---

## user_profiles

Mirrors `auth.users`. Created automatically on user sign-up via trigger or manual insert.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Matches `auth.users.id` |
| `full_name` | text | Display name |
| `email` | text | |
| `role` | text | One of: `cost_controller`, `construction_manager`, `evp`, `accounts_supervisor`, `accounts_manager`, `ceo` |
| `avatar_initials` | text | 2-letter abbreviation for avatar |
| `created_at` | timestamptz | Default `now()` |

**RLS:** Users can read their own row. Admins can read all rows.

---

## entities

All external and internal parties.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text UNIQUE NOT NULL | |
| `type` | text | `client`, `vendor`, `subsidiary`, `lender`, `internal` |
| `tax_id` | text | |
| `is_related_party` | boolean | Default `false` |
| `email` | text | |
| `phone` | text | |
| `created_at` | timestamptz | |

---

## projects

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | |
| `client_entity_id` | uuid FK → entities | |
| `contract_incl_vat` | numeric | |
| `contract_excl_vat` | numeric | |
| `start_date` | date | |
| `status` | text | See project status workflow below |
| `currency` | text | Default `THB` |
| `description` | text | |
| `last_rejection_comment` | text | Populated on EVP/CEO rejection |
| `last_rejected_by` | uuid FK → user_profiles | |
| `last_rejected_at` | timestamptz | |
| `last_rejected_stage` | text | Which stage was rejected |
| `created_at` | timestamptz | |

### Project status workflow

```
estimation_draft
  → estimation_submitted   (Cost Controller submits)
    → estimation_cm_approved  (Construction Manager approves)
      → estimation_approved    (EVP approves)
        → budget_draft
          → budget_submitted
            → budget_cm_approved
              → active           (EVP approves budget)
                → completed
```

Any stage can be rejected, which sets `last_rejection_*` fields and returns the project to the prior draft stage.

---

## project_costings

One row per costing stage (`estimation` or `budget`). Each project should have at most one estimation costing and one budget costing.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `stage` | text | `estimation` or `budget` |
| `sales_price_excl_vat` | numeric | |
| `sales_price_incl_vat` | numeric | |
| `cost_01_civil` … `cost_10_testing` | numeric | 10 cost category columns |
| `total_cost_excl_vat` | numeric | Sum of all 10 categories |
| `gross_margin_amount` | numeric | Revenue − total cost |
| `gross_margin_pct` | numeric | Margin as percentage |
| `notes` | text | |
| `status` | text | `draft`, `submitted`, `cm_approved`, `cm_rejected`, `evp_approved`, `evp_rejected` |
| `submitted_by`, `cm_approved_by`, `evp_approved_by` | uuid FK | Audit trail |
| `*_at`, `*_comments` | timestamptz / text | Audit trail |
| `created_at` | timestamptz | |

---

## variation_orders

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `vo_number` | text | e.g. VO-001 |
| `client_po_reference` | text | Client's PO number |
| `description` | text | |
| `revenue_increase` | numeric | Added contract value |
| `cost_01_civil` … `cost_10_testing` | numeric | Cost impact per category |
| `status` | text | `draft` or `evp_approved` |
| `submitted_by`, `evp_approved_by` | uuid FK | |
| `*_at`, `evp_comments` | | Audit trail |
| `created_at` | timestamptz | |

---

## milestones

Client billing milestones. Each represents a percentage of contract value to be invoiced.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `milestone_no` | integer | Sequence number |
| `description` | text | |
| `percentage` | numeric | % of contract |
| `planned_amount_incl_vat` | numeric | |
| `planned_date` | date | Original scheduled date |
| `planned_date_override` | date | Updated date (preserves original) |
| `pss_invoice_no` | text | Our invoice number |
| `invoice_date` | date | |
| `status` | text | `planned`, `invoiced`, `received` |
| `created_at` | timestamptz | |

---

## milestone_invoices

Actual invoices issued against a milestone. A milestone may have multiple invoices (partial billing).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `milestone_id` | uuid FK → milestones | |
| `project_id` | uuid FK → projects | |
| `invoice_no` | text | |
| `invoice_date` | date | |
| `invoice_amount` | numeric | Face value |
| `received_amount` | numeric | Amount actually collected |
| `receipt_date` | date | |
| `status` | text | `invoiced`, `partial`, `received` |
| `notes` | text | |
| `created_at` | timestamptz | |

---

## purchase_orders

Vendor purchase orders. Each PO belongs to one project and one cost category.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `pss_po_no` | text | Human-readable PO number |
| `project_id` | uuid FK → projects | |
| `vendor_id` | uuid FK → entities | |
| `description` | text | |
| `cost_category` | text | One of 10 categories (`01_civil` … `10_testing_warranty`) |
| `po_amount_excl_vat` | numeric | |
| `vat_7pct` | numeric | |
| `po_amount_incl_vat` | numeric | |
| `wht_applies` | boolean | |
| `wht_3pct` | numeric | |
| `po_date` | date | |
| `status` | text | `draft`, `pending_approval`, `approved`, `partially_paid`, `fully_paid` |
| `has_supplier_milestones` | boolean | True → uses `po_milestones`; False → simple payment schedule |
| `pending_invoice_amount` | numeric | Running total not yet invoiced |
| `pending_remaining_amount` | numeric | Running total not yet paid |
| `notes` | text | |
| `submitted_by`, `approved_by`, `rejected_by` | uuid FK | |
| `*_at`, `rejection_reason` | | Audit trail |
| `created_at` | timestamptz | |

**Key derived field:** `is_approved` is not a column — it is computed in the frontend as `approved_by != null`.

---

## po_milestones

Payment schedule rows for a purchase order that uses milestone-based payments.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `purchase_order_id` | uuid FK → purchase_orders | |
| `milestone_number` | integer | |
| `milestone_pct` | numeric | % of PO value |
| `amount_due` | numeric | |
| `invoice_no` | text | Vendor's invoice number |
| `invoice_date` | date | |
| `invoice_value` | numeric | |
| `paid_amount` | numeric | Default 0 |
| `planned_payment_date` | date | Used for cash flow forecast |
| `status` | text | `pending`, `invoiced`, `paid` |
| `notes` | text | |
| `created_at`, `updated_at` | timestamptz | |

---

## vendor_invoices

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `po_id` | uuid FK → purchase_orders | |
| `project_id` | uuid FK → projects | |
| `vendor_id` | uuid FK → entities | |
| `vendor_invoice_no` | text | |
| `invoice_date` | date | |
| `invoice_amount_incl_vat` | numeric | |
| `received_amount` | numeric | Amount actually received/paid so far |
| `wht_3pct` | numeric | |
| `net_payable` | numeric | invoice_amount − WHT |
| `status` | text | `received`, `approved_cm`, `approved_evp`, `released`, `paid` |
| `original_due_date` | date | |
| `planned_payment_date` | date | Accounts planning |
| `planning_notes` | text | |
| `vendor_notified` | boolean | Default false |
| `created_at` | timestamptz | |

---

## progress_reports

Site progress reports required before a vendor invoice can be approved.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `po_id` | uuid FK → purchase_orders | |
| `vendor_invoice_id` | uuid FK → vendor_invoices | |
| `project_id` | uuid FK → projects | |
| `prepared_by` | text | |
| `report_date` | date | |
| `description` | text | |
| `checklist_work_complete` | boolean | |
| `checklist_materials_onsite` | boolean | |
| `checklist_quality_passed` | boolean | |
| `checklist_safety_compliant` | boolean | |
| `checklist_docs_received` | boolean | |
| `percentage_complete` | numeric | |
| `notes` | text | |
| `status` | text | `draft`, `submitted`, `cm_approved`, `cm_rejected`, `evp_approved`, `evp_rejected` |
| Audit columns | | Same pattern as `project_costings` |
| `created_at` | timestamptz | |

---

## payment_vouchers

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `voucher_no` | text | From `voucher_sequences` |
| `vendor_invoice_id` | uuid FK → vendor_invoices | |
| `project_id` | uuid FK → projects | |
| `amount` | numeric | Gross amount |
| `wht_amount` | numeric | |
| `net_paid` | numeric | amount − WHT |
| `voucher_date` | date | |
| `prepared_by` | text | |
| `requires_manager_approval` | boolean | True if net_paid ≥ ฿3M |
| `manager_approved_by` | uuid FK | |
| `ceo_notified` | boolean | |
| `status` | text | `draft`, `pending_manager`, `approved`, `issued` |
| `created_at` | timestamptz | |

---

## checks

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `voucher_id` | uuid FK → payment_vouchers | |
| `bank_account` | text | |
| `check_no` | text | |
| `check_date` | date | |
| `payee` | text | |
| `amount` | numeric | |
| `signed_by_supervisor` | text | |
| `signed_by_manager` | text | |
| `status` | text | `draft`, `issued`, `cleared`, `bounced` |
| `created_at` | timestamptz | |

---

## cash_receipts

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `milestone_id` | uuid FK → milestones | |
| `company_id` | uuid FK → entities | |
| `pss_invoice_no` | text | |
| `receipt_date` | date | |
| `amount_received` | numeric | |
| `wht_deducted` | numeric | |
| `net_received` | numeric | |
| `bank_account` | text | |
| `reference` | text | |
| `notes` | text | |
| `created_at` | timestamptz | |

---

## project_cash_transfers

Internal transfers of cash between projects.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `from_project_id` | uuid FK → projects | |
| `to_project_id` | uuid FK → projects | |
| `amount` | numeric | |
| `reason` | text | |
| `transfer_date` | date | |
| `status` | text | `proposed`, `evp_recommended`, `ceo_approved`, `rejected` |
| Audit columns | | proposed_by, recommended_by, approved_by, rejected_by + timestamps + notes |
| `created_at` | timestamptz | |

---

## loans

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `loan_type` | text | `received` or `given` |
| `counterparty_id` | uuid FK → entities | |
| `principal` | numeric | |
| `currency` | text | |
| `fx_rate_if_usd` | numeric | For USD loans |
| `drawdown_date` | date | |
| `due_date` | date | |
| `outstanding_balance` | numeric | |
| `notes` | text | |
| `created_at` | timestamptz | |

---

## loan_repayments

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `loan_id` | uuid FK → loans | |
| `payment_date` | date | |
| `amount` | numeric | |
| `voucher_id` | uuid FK → payment_vouchers | |
| `notes` | text | |
| `created_at` | timestamptz | |

---

## notifications

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → user_profiles | |
| `title` | text | |
| `message` | text | |
| `type` | text | `info`, `warning`, `success`, `error`, `alert` |
| `is_read` | boolean | Default false |
| `related_entity_type` | text | e.g. `project`, `purchase_order` |
| `related_entity_id` | uuid | |
| `created_at` | timestamptz | |

---

## project_views

Tracks when each authenticated user last viewed each project.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid FK → projects | |
| `user_id` | uuid FK → user_profiles | |
| `viewed_at` | timestamptz | Updated on each view |

**RLS:** Users can only read and write their own view records.

---

## voucher_sequences

Generates auto-incrementing voucher numbers per calendar year.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `year` | integer | |
| `last_sequence` | integer | Incremented by trigger |

---

## RLS summary

Every table has `ALTER TABLE … ENABLE ROW LEVEL SECURITY`. General patterns:

- **Authenticated read:** most reference data (entities, projects) is readable by all authenticated users
- **Ownership insert/update:** users can only insert/update rows they own (e.g. their own notifications, their own view records)
- **Role-gated mutations:** approval columns can only be set by the appropriate role — enforced at the application layer, with RLS as the backstop
- **No `USING (true)` policies:** every policy checks `auth.uid()` or role

*Update this file after every database migration.*
