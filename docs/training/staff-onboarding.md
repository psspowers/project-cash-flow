# PSS Project Management System — Staff Onboarding Guide

*Each section below is one slide in the presentation. Keep headings as slide titles. Bullet points become slide content.*

---

## What is this system?

- A financial operations platform for managing solar construction projects end-to-end
- Tracks every baht that comes in from clients and goes out to vendors
- Gives management a real-time view of project health and company cash position
- Replaces spreadsheets with a single source of truth that all teams share

---

## Who uses it and what roles exist?

- **Cost Controller** — creates project cost estimates and raises purchase orders
- **Construction Manager** — approves cost estimates and vendor progress reports from site
- **EVP** — final approver for budgets, purchase orders, and large vendor payments
- **Accounts Supervisor** — records vendor invoices, plans payment dates, creates payment vouchers
- **Accounts Manager** — signs off on large payments (฿3M and above) before they are issued
- **CEO** — receives alerts on large outflows and approves inter-project cash transfers

Each role sees only the menu items and actions relevant to their work.

---

## The project lifecycle — from draft to complete

- Every project starts as an **Estimation Draft** — the Cost Controller fills in a cost estimate
- The estimate is reviewed and approved in two steps: Construction Manager, then EVP
- Once the estimate is approved, a **Budget** is prepared and goes through the same two-step approval
- After budget approval the project becomes **Active** — procurement and billing can begin
- The project moves to **Completed** when all work is done and all payments are settled
- At any step, a reviewer can reject and send the project back to the previous draft stage

---

## How money flows in — client milestones

- Each project has a set of **billing milestones** tied to construction progress percentages
- When a milestone is reached, the team issues an invoice to the client
- When the client pays, a **Cash Receipt** is recorded in the system
- The forecast chart uses planned milestone dates to predict future inflows
- Outstanding (unpaid) milestones are tracked as **Pending Receivables**

---

## How money flows out — purchase orders and vendor payments

- Vendors are paid through **Purchase Orders (POs)** — one PO per vendor per cost category
- A PO goes through draft → approval before any vendor invoice can be paid against it
- Approved POs can have a **payment milestone schedule** showing when each tranche is due
- When a vendor submits an invoice, the site team prepares a **Progress Report** confirming the work
- After approval, the Accounts team creates a **Payment Voucher** and issues a cheque

---

## The approval chain — who approves what

| Item | First approver | Final approver |
|---|---|---|
| Project cost estimate | Construction Manager | EVP |
| Project budget | Construction Manager | EVP |
| Purchase order | — | EVP |
| Vendor progress report | Construction Manager | EVP |
| Payment voucher < ฿3M | Accounts Supervisor | — (auto) |
| Payment voucher ≥ ฿3M | Accounts Supervisor | Accounts Manager |
| Inter-project cash transfer | EVP (recommend) | CEO |

Every approval records who approved it and when — a full audit trail is always available.

---

## Reading the Dashboard — the 5 KPI cards

- **Total Contract Value** — sum of all active project contract amounts
- **Received This Year** — cash actually collected from clients in the current calendar year, net of withholding tax
- **Pending Receivables** — money still owed by clients on outstanding milestones
- **Awaiting My Action** — the number of items in your approval queue right now; tap to go straight there
- **Net 90-Day Position** — the difference between planned inflows and planned outflows over the next 90 days; red means outflows are expected to exceed inflows

---

## Reading the Dashboard — the cash flow chart

- Three views: **Historical**, **Forecast**, and **Combined**
- **Historical** shows actual cash in (green) and cash out (red) for the past 13 months
- **Forecast** shows planned inflows and planned outflows for the next 9 months
- The red outflow bar has two layers:
  - **Dark red** — payments on purchase orders that are already approved
  - **Light red (faded)** — payments on purchase orders still in draft or awaiting approval
- The **blue line** is the cumulative net cash position — watch for it dipping below zero
- **Combined** blends the last 3 actual months with the next 6 forecast months in one view

---

## The 90-day net position and what it means

- A **positive number** means we expect to collect more than we pay out in the next 3 months — healthy
- A **negative number** means outflows are projected to exceed inflows — a warning sign
- The figure includes draft PO commitments, not just approved ones, to give an honest picture
- If the number is negative, click the card to open the Forecast chart and see which months are the problem
- The EVP and CEO use this number to decide whether an inter-project cash transfer is needed

---

## Finding a specific project

- Go to **Projects** in the left menu
- Use the status filter tabs to narrow by lifecycle stage (Estimation, Budget, Active, Completed)
- Click any project row to open the Project Detail page
- The detail page has six tabs: Overview, Costing, Orders, Cashflow, Timeline, Variance
- Recent projects you have visited appear at the top of the list

---

## Common task: raising a purchase order

1. Open **Purchase Orders** from the left menu
2. Click **New PO**
3. Select the project and vendor, choose the cost category
4. Enter the PO amount — VAT and WHT are calculated automatically
5. Set up the payment schedule (milestone-based or monthly)
6. Submit for approval — the EVP will receive the item in their approval queue
7. Once approved, vendor invoices can be recorded against this PO

---

## Common task: approving a costing or progress report

1. Check the **Awaiting My Action** card on the Dashboard for your pending count
2. Click the card or go to **Approvals** in the left menu
3. Review each item — click to expand details, check documents if attached
4. Click **Approve** or **Reject**
5. If rejecting, provide a comment explaining what needs to change
6. The submitter will be able to see your comment and resubmit after corrections

---

## What to do when something looks wrong

- **A project has an unexpectedly high cost** — check the Variance tab on the project detail; it shows which cost categories are over budget
- **The 90-day position looks negative** — open the Forecast chart; look for months with very large outflows relative to inflows
- **A payment has not been made** — check the Payment Queue page; the Accounts Supervisor can see planned vs actual payment dates
- **You cannot see a page or action** — your role may not have access; contact the system administrator to verify your user profile role

---

## Who to contact for system access

- New user accounts are created by the system administrator in the Supabase dashboard
- If your role is incorrect or you cannot see pages you need, ask the administrator to check your `user_profiles` record
- For data issues (incorrect amounts, missing records), raise with the Accounts Supervisor who can correct entries directly

---

*Review this document quarterly. Update whenever the approval chain, workflow stages, or major features change. Each `##` heading corresponds to one PowerPoint slide.*
