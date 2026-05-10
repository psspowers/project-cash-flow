# PSS Project Management System — Documentation

Navigation index for all project documentation. Each entry links to a specific file; the file itself contains the detail.

---

## Architecture

| File | Purpose |
|---|---|
| [architecture/overview.md](architecture/overview.md) | Tech stack, data flow, component hierarchy, full route table |
| [architecture/database-schema.md](architecture/database-schema.md) | All tables, columns, foreign keys, RLS policies |
| [architecture/auth-and-roles.md](architecture/auth-and-roles.md) | Role definitions, permission matrix, what each role sees |

## Developer Guides

| File | Purpose |
|---|---|
| [guides/local-setup.md](guides/local-setup.md) | First-run setup: env vars, Supabase, dev server |
| [guides/adding-a-feature.md](guides/adding-a-feature.md) | Conventions for new pages, components, queries, types |
| [guides/deployment.md](guides/deployment.md) | Build, migrations, environment variable checklist |

## Feature Documentation

| File | Purpose |
|---|---|
| [features/projects.md](features/projects.md) | Project lifecycle, ProjectDetail tabs, data hook |
| [features/purchase-orders.md](features/purchase-orders.md) | PO wizard, approval workflow, milestones |
| [features/cash-flow.md](features/cash-flow.md) | Dashboard chart modes, milestone data sources, 90-day KPI |
| [features/approvals.md](features/approvals.md) | Approval queue logic per role, vouchers, costings, reports |
| [features/reports.md](features/reports.md) | VAT report, WHT report, treasury, cost variance, CEO alerts |

## Reference

| File | Purpose |
|---|---|
| [reference/component-library.md](reference/component-library.md) | Badge, MetricCard, VendorCombobox, NotifToast prop tables and examples |
| [reference/utilities.md](reference/utilities.md) | Formatters, marginTransfer, overrunNotification, workflow service |
| [reference/supabase-queries.md](reference/supabase-queries.md) | Common query patterns, RLS gotchas, normalization |

## Training

| File | Purpose |
|---|---|
| [training/staff-onboarding.md](training/staff-onboarding.md) | **Staff training file — converts directly to PowerPoint** |

---

*Update this index whenever a file is added, renamed, or removed.*
