# Utilities Reference

Pure helper functions in `src/utils/` and some exported from `src/types/index.ts`.

---

## Currency formatters

`src/utils/formatters.ts` and also exported from `src/types/index.ts`

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
fmtTHBCompact(42_500_000)   // "฿42.50M"
fmtTHBCompact(750_000)      // "฿750K"
fmtTHBCompact(500)          // "฿500"
fmtTHBCompact(-1_200_000)   // "-฿1.20M"
```

Use for: KPI cards, chart labels, anywhere space is limited.

---

## Margin transfer

`src/utils/marginTransfer.ts`

### `computeTransferableMargin(projects, milestones, receipts, purchaseOrders)`

Calculates which projects have surplus cash that could be transferred to support a deficit project.

**Inputs:**
- `projects` — array of `Project`
- `milestones` — array of `Milestone` (client billing milestones)
- `receipts` — array of `CashReceipt`
- `purchaseOrders` — array of `PurchaseOrder`

**Returns:** Array of `{ project, collectedPct, committedPct, transferable }` where:
- `collectedPct` — % of contract value received from client
- `committedPct` — % of contract value committed via POs
- `transferable` — boolean; true if collected > committed by a meaningful margin

**When to use:** On the Cash Flow Planner page to identify which projects can fund a cash transfer.

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

**Side effect:** Inserts rows into the `notifications` table. Queries `user_profiles` to find EVP and CEO user IDs to notify.

**When this runs:** Called after a PO is approved or a new PO is created on an active project.

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
COST_CATEGORY_LABELS['01_civil']    // '01 Civil Works'
COST_CATEGORY_LABELS['02_pv_modules'] // '02 PV Modules'
```

### `ROLE_LABELS`

Record mapping `UserRole` to display name.

```typescript
ROLE_LABELS['cost_controller']     // 'Cost Controller'
ROLE_LABELS['construction_manager'] // 'Construction Manager'
ROLE_LABELS['evp']                 // 'EVP'
```

### `PROJECT_STATUS_LABELS`

Record mapping `ProjectStatus` to a short display string.

```typescript
PROJECT_STATUS_LABELS['estimation_draft']   // 'Estimation Draft'
PROJECT_STATUS_LABELS['active']             // 'Active'
```

---

*Update this file when a utility function's signature or behaviour changes.*
