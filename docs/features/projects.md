# Projects Feature

## Overview

Every piece of financial activity in the system belongs to a project. Projects move through an 8-stage approval workflow before becoming active. Once active, they accumulate purchase orders, vendor invoices, client receipts, and milestone billing.

---

## Project lifecycle

```
estimation_draft
  └─► estimation_submitted   (Cost Controller submits costing)
        └─► estimation_cm_approved   (CM approves)
              └─► estimation_approved   (EVP approves)
                    └─► budget_draft
                          └─► budget_submitted
                                └─► budget_cm_approved
                                      └─► active   (EVP approves budget)
                                            └─► completed
```

At any stage with a `_submitted` or `_approved` status, the EVP or CM can reject — which moves the project back to the previous draft stage and records rejection metadata (`last_rejection_comment`, `last_rejected_by`, `last_rejected_at`, `last_rejected_stage`).

### Status groups

The `projectStatusGroup()` helper in `src/types/index.ts` maps statuses to four groups used for filtering and display:

| Group | Statuses |
|---|---|
| `estimation` | estimation_draft, estimation_submitted, estimation_cm_approved, estimation_approved |
| `budget` | budget_draft, budget_submitted, budget_cm_approved |
| `active` | active |
| `completed` | completed |

---

## Projects list page (`/projects`)

Displays all projects with status filter tabs. Each row links to the project detail page. Columns show contract value, status badge, and client name.

---

## Project detail page (`/projects/:id`)

Six tabs, each showing a different dimension of the project.

### Data loading — `useProjectData` hook

`src/hooks/useProjectData.ts` fetches all project detail data in a single `Promise.all`. It returns:

- `project` — the project record with client entity joined
- `costings` — all `project_costings` rows
- `variationOrders` — all `variation_orders` rows
- `milestones` — all `milestones` with nested `milestone_invoices`
- `purchaseOrders` — all `purchase_orders` with vendor and PO milestones
- `vendorInvoices` — all `vendor_invoices`
- `receipts` — all `cash_receipts`
- `loading`, `error`, `reload`

Components do not fetch their own data — they receive slices of this state via `ProjectDetailContext`.

### Tab: Overview

- Contract value, received to date, outstanding
- Milestone billing progress
- PO commitment vs budget

### Tab: Costing

- Estimation costing sheet (10 cost categories)
- Budget costing sheet
- Variation orders
- Approval status and audit trail for each

### Tab: Orders

- List of all purchase orders for the project
- Filter by status
- Link to create a new PO (opens `POCreationWizard`)
- PO milestones inline

### Tab: Cashflow

- Monthly cash in (milestone receipts) vs cash out (vendor payments)
- Rolling chart using recharts

### Tab: Timeline

- Milestone timeline with planned and actual dates
- Drag-to-reorder using @dnd-kit

### Tab: Variance

- Budget vs actual comparison per cost category
- Overrun indicator per category

---

## `ProjectDetailContext`

`src/context/ProjectDetailContext.tsx` wraps the ProjectDetail page and makes the hook's return values available to all tabs without prop-drilling.

```typescript
const { project, purchaseOrders, milestones } = useProjectDetail();
```

---

## `project_views` table

Every time a user opens the Project Detail page, a row is upserted into `project_views` with `viewed_at = now()`. This powers "recently viewed" indicators and could support analytics in future.

---

*Update this file when the project status workflow changes or new tabs are added.*
