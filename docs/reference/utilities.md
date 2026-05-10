# Utilities Reference

Pure helper functions in `src/utils/` and some exported from `src/types/index.ts`. Workflow logic lives in `src/services/workflow.ts`.

---

## Currency formatters

`src/utils/formatters.ts` — also `fmtTHB` and `fmtTHBCompact` are exported directly from `src/types/index.ts`

### `fmtTHB(n)`

Formats a number as Thai Baht with full precision. Always shows an integer — no decimal places.

```typescript
fmtTHB(1_500_000)   // "฿1,500,000"
fmtTHB(-42_000)     // "-฿42,000"
fmtTHB(null)        // "฿0"
fmtTHB(undefined)   // "฿0"
```

Use for: table cells, invoice amounts, any value where exact precision matters.

### `fmtTHBCompact(n)`

Formats a number as Thai Baht in compact notation (M for millions, K for thousands).

```typescript
fmtTHBCompact(42_500_000)   // "฿42.5M"
fmtTHBCompact(750_000)      // "฿750K"
fmtTHBCompact(500)          // "฿500"
fmtTHBCompact(-1_200_000)   // "-฿1.2M"
```

Use for: KPI cards, chart labels, anywhere space is limited.

---

## Margin transfer

`src/utils/marginTransfer.ts`

### `computeMarginTransferPosition(supabase, projectId)`

Async function. Calculates the transferable surplus margin for a specific project, used in the inter-project cash transfer workflow.

**Inputs:**
- `supabase` — the Supabase client instance
- `projectId` — the project to evaluate

**Returns:** `MarginTransferPosition` object with:
- `contractValue` — project contract value excl. VAT
- `budgetCost` — total approved budget cost
- `grossMargin` — contractValue − budgetCost
- `collectionRate` — % of contract invoiced and received from client
- `releasableMargin` — portion of margin considered releasable given collection
- `alreadyTransferred` — sum of prior approved outbound transfers
- `availableToTransfer` — releasableMargin − alreadyTransferred
- `blocked` — boolean; true if transfer cannot proceed (no budget, negative margin, or zero available)
- `blockReason` — human-readable string explaining why blocked

**When to use:** On the project cash transfer approval flow and the CashFlowPlanner page to determine which projects can fund a transfer.

---

## Overrun notification

`src/utils/overrunNotification.ts`

### `checkAndNotifyOverruns(projectId, costings, purchaseOrders, supabase)`

Compares the approved budget costing per cost category against the total approved PO amounts per category for a project. For each category where PO total exceeds budget, it inserts a notification row for EVP and CEO users.

**Inputs:**
- `projectId` — the project to check
- `costings` — all `ProjectCosting` rows for the project
- `purchaseOrders` — all `PurchaseOrder` rows for the project
- `supabase` — the Supabase client instance

**Side effect:** Inserts rows into the `notifications` table. Queries `user_profiles` to find EVP and CEO user IDs.

**When this runs:** Called after a PO is approved or a new PO is created on an active project.

---

## Workflow service

`src/services/workflow.ts`

The central state machine for PO approvals and vendor invoice approvals. All status transitions must go through these functions — never update `status` directly.

### PO approval flow

```
draft
  └─► pending_cc   (submitted by procurement / cost_controller)
        └─► pending_cm   (CC approved)
              └─► pending_evp  (CM approved, value ≥ ฿1M)
                    └─► pending_ceo  (EVP approved, value ≥ ฿5M)
                          └─► approved
```

| Function | Called by | Notes |
|---|---|---|
| `submitPO(poId, actorId)` | procurement, cost_controller | draft → pending_cc |
| `approvePO_CC(poId, actorId)` | cost_controller | pending_cc → pending_cm |
| `approvePO_CM(poId, actorId)` | construction_manager | pending_cm → pending_evp or approved |
| `approvePO_EVP(poId, actorId)` | evp | pending_evp → pending_ceo or approved |
| `approvePO_CEO(poId, actorId)` | ceo | pending_ceo → approved |
| `rejectPO(poId, actorId, reason)` | any approver | → draft (with rejection_reason) |

Threshold constants: `PO_THRESHOLD_CM = 1_000_000`, `PO_THRESHOLD_EVP = 5_000_000`.

### PO revision flow

| Function | Notes |
|---|---|
| `requestPOChange(poId, actorId, reason)` | Flags an approved PO for revision consideration |
| `grantPOChange(poId, actorId, decision)` | EVP voids original and optionally creates a `draft_revision` |
| `rejectPOChangeRequest(poId, actorId)` | EVP declines — PO returns to approved |

### Vendor invoice flow

```
received → approved_cm → approved_evp → released → paid
         (or → rejected at any stage)
```

| Function | Threshold | Notes |
|---|---|---|
| `submitInvoice(invoiceId, actorId)` | — | Logs invoice as received |
| `approveInvoiceCM(invoiceId, actorId)` | — | CM sign-off |
| `rejectInvoiceCM(invoiceId, actorId, comment)` | — | CM rejection |
| `approveInvoiceEVP(invoiceId, actorId)` | ≥ ฿3M → CEO notified | EVP approval; routes to CEO for large amounts |
| `approveInvoiceCEO(invoiceId, actorId)` | — | CEO final for ≥ ฿3M invoices |
| `rejectInvoice(invoiceId, actorId, comment)` | — | Multi-role rejection |

EVP/CEO threshold: `EVP_CEO_THRESHOLD = 3_000_000`.

### Notification dispatch

`notify(userId, title, message, type, entityType?, entityId?)` — inserts a row into the `notifications` table. Called internally by every workflow step. Do not call this directly from page components; trigger it through the workflow functions.

---

## Type helpers

Exported from `src/types/index.ts`.

### `projectStatusGroup(status)`

Maps a `ProjectStatus` to a group string for filtering and display logic.

```typescript
projectStatusGroup('estimation_draft')  // 'estimation'
projectStatusGroup('budget_submitted')  // 'budget'
projectStatusGroup('active')            // 'active'
projectStatusGroup('completed')         // 'completed'
```

### `COST_CATEGORY_LABELS`

Record mapping `CostCategory` code to human-readable label.

```typescript
COST_CATEGORY_LABELS['01_civil']      // '01 Civil Works'
COST_CATEGORY_LABELS['02_pv_modules'] // '02 PV Modules'
```

### `ROLE_LABELS`

Record mapping `UserRole` to display name.

```typescript
ROLE_LABELS['cost_controller']        // 'Cost Controller'
ROLE_LABELS['construction_manager']   // 'Construction Manager'
ROLE_LABELS['banking_finance_officer'] // 'Banking & Finance Officer'
```

### `PROJECT_STATUS_LABELS`

Record mapping `ProjectStatus` to a short display string.

```typescript
PROJECT_STATUS_LABELS['estimation_draft']   // 'Estimation Draft'
PROJECT_STATUS_LABELS['active']             // 'Active'
```

---

## Status constants

`src/config/statusConstants.ts`

Groups of invoice statuses used in filter queries. Import these instead of hard-coding status string arrays.

```typescript
VENDOR_INVOICE_UNPAID_STATUSES  // ['received', 'approved_cm', 'approved_evp', 'released']
VENDOR_INVOICE_PAID_STATUSES    // ['paid']
```

---

*Update this file when a utility function's signature or behaviour changes.*
