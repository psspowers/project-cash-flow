# Cash Flow Feature

## Dashboard cash flow chart

The main cash flow visualization lives on the Dashboard (`/dashboard`). It has three modes toggled by the user:

---

## Historical mode

Shows actual cash in and cash out for the last 13 months.

**Data sources:**
- **Inflow** — `cash_receipts.net_received` grouped by `receipt_date` month
- **Outflow** — `vendor_invoices.received_amount` (amounts actually paid) grouped by `invoice_date` month

This is a simple `BarChart` (no line) with green bars for in, red bars for out.

---

## Forecast mode

Shows planned cash in and planned cash out for the next 9 months.

**Data sources:**
- **Inflow** — `client_milestones` (from a custom Supabase view or direct query) filtered by `planned_receive_date` month; uses `payment_plan_amount`
- **Outflow** — `po_milestones` filtered by `planned_payment_date` month; uses `amount_due - paid_amount`

The outflow is split into two stacked layers:
- `outflowApproved` — milestones on POs where `approved_by IS NOT NULL` (dark red, full opacity)
- `outflowDraft` — milestones on POs where `approved_by IS NULL` (light red, 35% opacity)

A blue cumulative net line (`cumNet`) is overlaid using a `Line` component. The cumulative calculation is:
```
cumNet[i] = cumNet[i-1] + inflow[i] - outflowApproved[i] - outflowDraft[i]
```

A horizontal `ReferenceLine` at y=0 helps the reader spot months where cumulative net goes negative.

---

## Combined mode

Shows last 3 months actual + next 6 months forecast in a single chart. A vertical `ReferenceLine` marks the current month ("Today").

- Past months use actual data (same sources as Historical)
- Future months use planned milestone data (same sources as Forecast)
- Past bars are solid; future bars are faded (50% opacity for inflow, lower opacity for outflow)
- Both `outflowApproved` and `outflowDraft` are stacked even in the historical portion (where `outflowDraft` will be 0 since actuals are not split by approval status)

---

## 90-day net position KPI card

The fifth metric card on the Dashboard shows the net cash position for the next 90 days.

```
plannedInflow90  = sum of client milestone payment_plan_amount
                   where planned_receive_date <= today+90 days

plannedOutflow90 = sum of (po_milestone.amount_due - po_milestone.paid_amount)
                   where planned_payment_date <= today+90 days
                   (includes ALL milestones regardless of PO approval status)

netPosition90    = plannedInflow90 - plannedOutflow90
```

A positive value means inflows are expected to exceed outflows in the next 90 days. The card turns red and shows an alert when negative.

---

## Client milestones query

The Dashboard fetches client billing milestone data for the forecast using the `client_milestones` view (or equivalent direct query). The key fields are:

| Field | Source | Description |
|---|---|---|
| `project_id` | milestones | Links to project |
| `payment_plan_amount` | milestone_invoices | Expected receipt amount |
| `planned_receive_date` | milestone_invoices or milestones | Planned collection date |
| `status` | milestone_invoices | Filters out already-received milestones |

---

## PO milestones query

```typescript
supabase
  .from('po_milestones')
  .select('purchase_order_id, amount_due, paid_amount, planned_payment_date, status, purchase_order:purchase_orders!purchase_order_id(project_id, approved_by)')
  .neq('status', 'paid')
```

After this query, normalization adds:
- `project_id` — from the join `purchase_order.project_id`
- `is_approved` — `purchase_order.approved_by != null`

Rows where `project_id` resolves to empty string are filtered out.

---

## Cash Flow Planner page (`/cash-flow-planner`)

A dedicated deeper view for detailed cash planning, accessible to EVP and CEO. Shows the same milestone data with more filtering and planning controls.

---

*Update this file when the chart mode logic, data sources, or KPI calculation changes.*
