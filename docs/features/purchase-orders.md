# Purchase Orders Feature

## What a purchase order represents

A Purchase Order (PO) is a commitment to pay a vendor a specific amount for work in a specific cost category on a specific project. POs drive the outflow side of the cash flow forecast.

---

## PO creation — `POCreationWizard`

`src/components/pos/POCreationWizard.tsx` is a multi-step wizard that creates a new PO. Steps:

1. **Project and vendor** — select project (required), vendor (optional at creation), cost category
2. **Amounts** — PO amount excl. VAT; VAT and WHT are calculated automatically
3. **Payment schedule** — choose between:
   - **Milestone-based** (`has_supplier_milestones = true`): define payment milestones as percentages summing to 100%, each with a planned payment date
   - **Simple schedule** (`has_supplier_milestones = false`): specify a monthly payment amount
4. **Review and submit**

On submission the PO is created with `status = 'draft'`. The creator then submits it for approval.

---

## PO approval workflow

```
draft
  └─► pending_approval   (Cost Controller submits)
        └─► approved           (EVP approves)
        └─► draft              (EVP rejects — returns to draft with rejection_reason)
approved
  └─► partially_paid    (first vendor invoice paid)
        └─► fully_paid         (all milestones paid)
```

The `approved_by` column is non-null for approved POs. The frontend derives `is_approved` as `approved_by != null` — this field drives the dark red / light red split in the cash flow forecast chart.

---

## PO milestones (`po_milestones`)

When `has_supplier_milestones = true`, each milestone row has:

- `milestone_pct` — percentage of PO value for this milestone
- `amount_due` — calculated amount (PO value × pct)
- `paid_amount` — how much has been paid against this milestone (default 0)
- `planned_payment_date` — used in the cash flow forecast
- `status` — `pending`, `invoiced`, or `paid`

The **outstanding amount** for a milestone is `amount_due - paid_amount`.

---

## Cash flow forecast and PO milestones

The Dashboard cash flow forecast queries all unpaid `po_milestones` joined to their parent `purchase_orders` via:

```typescript
supabase
  .from('po_milestones')
  .select('purchase_order_id, amount_due, paid_amount, planned_payment_date, status, purchase_order:purchase_orders!purchase_order_id(project_id, approved_by)')
  .neq('status', 'paid')
```

After normalization each milestone has `is_approved: boolean`. The forecast chart splits outflow into:

- `outflowApproved` — milestones on approved POs (dark red bars)
- `outflowDraft` — milestones on draft/pending POs (light red, 35% opacity)

This gives the EVP an honest picture: draft PO costs are real commitments even if not yet signed off.

---

## PO status badges

| Status | Colour |
|---|---|
| draft | gray |
| pending_approval | amber |
| approved | green |
| partially_paid | blue |
| fully_paid | green |

---

## Cost categories

Every PO is assigned one of 10 cost categories. These match the columns in `project_costings`:

| Code | Label |
|---|---|
| `01_civil` | Civil Works |
| `02_pv_modules` | PV Modules |
| `03_mounting` | Mounting |
| `04_inverters_electrical` | Inverters & Electrical |
| `05_hv_switchgear` | HV Switchgear |
| `06_cabling` | Cabling |
| `07_installation` | Installation |
| `08_engineering` | Engineering |
| `09_logistics` | Logistics |
| `10_testing_warranty` | Testing & Warranty |

The variance analysis (Cost Variance page) compares actual PO spend per category against the budget costing per category.

---

*Update this file when the PO workflow, wizard steps, or milestone structure changes.*
