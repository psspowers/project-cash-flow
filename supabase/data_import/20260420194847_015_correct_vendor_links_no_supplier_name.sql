
/*
  # Correct vendor_id for all POs that had no supplier_name_raw

  ## Summary
  A previous migration incorrectly linked 80 POs (those with no supplier_name_raw)
  to entity 11111111-1111-1111-1111-111111111101 (HYAPADOS 2 CO.,LTD. — a subsidiary).
  This migration overwrites each of those POs with the correct vendor entity, identified
  from the description field or confirmed by user.

  ## Group A — Vendor identifiable from description
  Best Overseas, Zigma, NP Electric, CPT Drives, Parabolic Asia, Matrix Interface,
  Dhipaya, Multi Utilities, SSV Solar, Envision, Texplore, Polytechnology, Athens,
  Staubli, Green Grow Energy, Eng PSU, A-NGUN Travel, Apichaya, Precision Power,
  ห้างหุ้นส่วนสามัญ ธารทอง, นายสุริยะ สุขะวัฒนะ

  ## Group B — User confirmed
  - PSS2023-012: CES Labs Landkrabng University
  - PSS2023-180: CSS Communication Co.,Ltd.
  - PSS2024-055: CSS Communication Co.,Ltd.  (C2C_CSS grounding)
  - PSS2024-118: CSS Communication Co.,Ltd.  (C2C_Exchange = CSS)
  - PSS2024-131: CSS Communication Co.,Ltd.  (AC + Comm cable)
  - PSS2024-134: K Kochaporn Wongprathanporn (Consultant)
  - PSS2025-089: K Panuwat — PSS Internal Staff Advance (new entity)
  - PSS2025-090: K Nikorn  — PSS Internal Staff Advance (new entity)

  ## Planning-stage drafts (vendor not yet decided — left as PSS Internal placeholder)
  PSS-KKU-PLAN-001/002/003, PSS-LPF2-SITE-001, PSS-NAR-EXP029,
  PSS-RCP-PVMOD-001, PSS-RCP-SITE-001,
  PSS-WAL-EXP016/017/018
*/

-- Note: we force-update regardless of current vendor_id to fix the bad HYAPADOS links

-- ---------------------------------------------------------------
-- Best Overseas
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'BEST OVERSEAS Co.,Ltd.')
WHERE pss_po_no IN (
  'PSS-REN-EXP027','PSS-REN-EXP028','PSS-REN-EXP029',
  'PSS-SFC-EXP021','PSS-SFC-EXP023','PSS-SFC-EXP024','PSS-SFC-EXP025',
  'PSS-NAN-EXP037','PSS2025-154'
);

-- ---------------------------------------------------------------
-- Zigma
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'Zigma Engineering Co.,Ltd.')
WHERE pss_po_no IN ('PSS2024-107','PSS2024-108','PSS2024-148','PSS2025-115');

-- ---------------------------------------------------------------
-- NP Electric
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'NP Electric Co.,Ltd.')
WHERE pss_po_no IN ('PSS2024-185','PSS2025-075','PSS2025-085');

-- ---------------------------------------------------------------
-- CPT Drives
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'CPT Drives Co.,Ltd.')
WHERE pss_po_no IN (
  'PSS2024-089','PSS2024-090','PSS2025-030',
  'PSS2025-127','PSS2025-138','PSS2025-143',
  'PSS-SFC-EXP015'
);

-- ---------------------------------------------------------------
-- Parabolic Asia
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'Parabolic Asia Engineering Co.,Ltd.')
WHERE pss_po_no IN ('PSS2024-195','PSS2024-196','PSS2025-015');

-- ---------------------------------------------------------------
-- Matrix Interface
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'MATRIX INTERFACE Co.,Ltd.')
WHERE pss_po_no IN ('PSS2025-007','PSS2025-060','PSS2025-064','PSS2025-068');

-- ---------------------------------------------------------------
-- Dhipaya Insurance
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'DHIPAYA INSURANCE Co.,Ltd.')
WHERE pss_po_no IN ('PSS2024-160','PSS2025-024');

-- ---------------------------------------------------------------
-- Multi Utilities
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'Multi Utilities Co.,Ltd.')
WHERE pss_po_no IN ('PSS2025-056','PSS2025-088','PSS2025-096');

-- ---------------------------------------------------------------
-- SSV Solar
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'SSV Solar Co.,Ltd.')
WHERE pss_po_no IN ('PSS2024-102','PSS2024-103');

-- ---------------------------------------------------------------
-- Envision Energy
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'Envision Energy')
WHERE pss_po_no IN ('PSS2024-138','PSS2024-139');

-- ---------------------------------------------------------------
-- Texplore
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'Texplore Co.,Ltd.')
WHERE pss_po_no IN ('PSS2025-086','PSS2025-087');

-- ---------------------------------------------------------------
-- Polytechnology
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'Polytechnology Co.,Ltd.')
WHERE pss_po_no IN ('PSS2023-297','PSS2025-132','PSS2025-166');

-- ---------------------------------------------------------------
-- Athens Electrical (_Ethens)
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'ATHENS ELECTRICAL Co.,Ltd.')
WHERE pss_po_no = 'PSS2025-059';

-- ---------------------------------------------------------------
-- Staubli
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'Staubli Thailand Co.,Ltd.')
WHERE pss_po_no = 'PSS2025-152';

-- ---------------------------------------------------------------
-- Green Grow Energy
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'Green Grow Energy Co.,Ltd.')
WHERE pss_po_no = 'PSS2024-192';

-- ---------------------------------------------------------------
-- Eng PSU
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'Eng PSU (Prince of Songkla University)')
WHERE pss_po_no = 'PSS2025-002';

-- ---------------------------------------------------------------
-- A-NGUN Travel
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'A-NGUN Travel Co.,Ltd.')
WHERE pss_po_no IN (
  'PSS2024-027','PSS2024-151','PSS2024-200',
  'PSS-LPF-EXP026','PSS-LPF-EXP037',
  'PSS-REN-EXP030','PSS-REN-EXP032'
);

-- ---------------------------------------------------------------
-- Apichaya Construction
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'Apichaya Construction')
WHERE pss_po_no = 'PSS2025-084';

-- ---------------------------------------------------------------
-- Precision Power
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'Precision Power Co.,Ltd.')
WHERE pss_po_no = 'PSS2025-141';

-- ---------------------------------------------------------------
-- ห้างหุ้นส่วนสามัญ ธารทอง (Legal consultant Naresuan)
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'ห้างหุ้นส่วนสามัญ ธารทอง (Legal)')
WHERE pss_po_no = 'PSS2024-045';

-- ---------------------------------------------------------------
-- นายสุริยะ สุขะวัฒนะ (VIP van Naresuan)
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'นายสุริยะ สุขะวัฒนะ (Transport)')
WHERE pss_po_no = 'PSS2024-061';

-- ---------------------------------------------------------------
-- PSS-REN-EXP031 — License fee (government/PEA)
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'Provincial Electricity Authority')
WHERE pss_po_no = 'PSS-REN-EXP031';

-- ---------------------------------------------------------------
-- PSS-REN-EXP034 — Survey expense, no named vendor
-- PSS-WAL-EXP002 — Walailak consultant contract, no named vendor
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'PSS Internal — Staff Advance')
WHERE pss_po_no IN ('PSS-REN-EXP034','PSS-WAL-EXP002');

-- ---------------------------------------------------------------
-- GROUP B — CSS Communication (4 POs)
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'CSS Communication Co.,Ltd.')
WHERE pss_po_no IN ('PSS2023-180','PSS2024-055','PSS2024-118','PSS2024-131');

-- ---------------------------------------------------------------
-- GROUP B — CES Labs Landkrabng University
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'CES Labs Landkrabng University')
WHERE pss_po_no = 'PSS2023-012';

-- ---------------------------------------------------------------
-- GROUP B — K Kochaporn Wongprathanporn (Consultant) — SFC/SCC contract
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'K Kochaporn Wongprathanporn (Consultant)')
WHERE pss_po_no = 'PSS2024-134';

-- ---------------------------------------------------------------
-- GROUP B — K Panuwut and K Nikorn — staff cash advance (KKU bidding cert fees)
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'PSS Internal — Staff Advance')
WHERE pss_po_no IN ('PSS2025-089','PSS2025-090');

-- ---------------------------------------------------------------
-- Planning-stage drafts — vendor not yet selected, set to PSS Internal as placeholder
-- ---------------------------------------------------------------
UPDATE purchase_orders SET vendor_id = (SELECT id FROM entities WHERE name = 'PSS Internal — Staff Advance')
WHERE pss_po_no IN (
  'PSS-KKU-PLAN-001','PSS-KKU-PLAN-002','PSS-KKU-PLAN-003',
  'PSS-LPF2-SITE-001',
  'PSS-NAR-EXP029',
  'PSS-RCP-PVMOD-001','PSS-RCP-SITE-001',
  'PSS-WAL-EXP016','PSS-WAL-EXP017','PSS-WAL-EXP018'
);
