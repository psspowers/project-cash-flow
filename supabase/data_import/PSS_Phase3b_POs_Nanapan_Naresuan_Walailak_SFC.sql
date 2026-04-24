-- ============================================================
-- PSS CASH FLOW SYSTEM — DATA IMPORT
-- Phase 3b: Purchase Orders
-- Projects: Nanapan, Naresuan, Walailak, SFC Phase 2
-- Source: PROJECT_FORECAST_PROJECT_Y2025Y2026.xlsx
-- All amounts verified directly from Excel columns
-- Run AFTER Phase 3a (LPF + Renaissance POs)
-- ============================================================
-- IMPORTANT NOTES:
-- 1. All amounts excl VAT / VAT / incl VAT taken from Excel exactly
-- 2. Polytechnology = INVERTERS in every project
-- 3. Naresuan vendors mostly blank in sheet — names from descriptions
-- 4. SFC POs: col5=excl VAT, col6=incl VAT (no separate VAT column)
--    VAT = incl - excl for SFC
-- 5. Walailak col6=excl, col7=VAT, col8=incl
-- 6. PSS2025-028 (QTC Transformer): sheet shows incl only ฿909,500
--    excl = 909500/1.07 = 849,953.27
-- ============================================================

-- ============================================================
-- NANAPAN — 34 POs
-- ============================================================

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2023-302', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%อานนท์%' LIMIT 1),
  'ค่าเซ็นรับรองแบบและรายการคำนวณโดยสามัญวิศวกรโยธา for Nanapan (อานนท์)',
  '08_engineering', 30000, 0, 30000, '2024-02-02', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2023-303', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%ยุทธนา%' LIMIT 1),
  'ค่าเซ็นรับรองแบบและเอกสารประกอบเพื่อยื่นขออนุญาตโดยสามัญสถาปนิก for Nanapan (ยุทธนา)',
  '08_engineering', 25774, 0, 25774, '2024-01-02', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

-- PSS2023-306: Polytechnology — INVERTERS (USD 224,857)
INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2023-306', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Polytechnology%' LIMIT 1),
  'Inverter 50KTL 10Y, Smart Logger and Optimizer for Nanapan (Polytechnology, USD 224,857)',
  '04_inverters_electrical', 7386552.45, 0, 7386552.45, '2024-01-01', 'partially_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-020', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%CS Energy%' LIMIT 1),
  'ค่าบริการจัดทำรายงาน COP, ESA for Nanapan (CS Energy)',
  '08_engineering', 300000, 21000, 321000, '2024-04-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-133', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%วรินทร์%' LIMIT 1),
  'Certified documents to submit for permit — Nanapan (วรินทร์ เกียรตินุกูล)',
  '08_engineering', 30000, 0, 30000, '2024-09-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-142', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Envision%' LIMIT 1),
  'Monitoring System (weather panel, sensor) for Nanapan (Envision)',
  '10_testing_warranty', 113800, 7966, 121766, '2024-09-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-197R1', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Zigma%' LIMIT 1),
  'Mounting structures, basket tray, walkway for Nanapan (Zigma Act)',
  '03_mounting', 2970011.10, 207900.78, 3177911.88, '2024-10-01', 'partially_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-205', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%SSV%' LIMIT 1),
  'Supply and installation of Solar Rooftop systems for Nanapan (SSV Solar)',
  '07_installation', 8508240, 595576.80, 9103816.80, '2024-10-01', 'partially_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-212', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Zigma%' LIMIT 1),
  'Additional mounting L-feet for Nanapan (Zigma Act)',
  '03_mounting', 25123, 1758.61, 26881.61, '2024-11-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-220', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Zigma%' LIMIT 1),
  'Additional accessories for mounting and walkway for Nanapan (Zigma Act)',
  '03_mounting', 11489.40, 804.26, 12293.66, '2024-11-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-066', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Staubli%' LIMIT 1),
  'PV Connector MC4 for Nanapan (Staubli Thailand)',
  '06_cabling', 69000, 4830, 73830, '2025-06-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-067', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%ATHENS%' LIMIT 1),
  'DC Solar Cable for Nanapan (Athens Electrical)',
  '06_cabling', 1120000, 78400, 1198400, '2025-06-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-070R2', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%NP Electric%' OR name ILIKE '%NP.ELECTRIC%' LIMIT 1),
  'MDB, DB, modify busbar and test relay for Nanapan (NP Electric)',
  '05_hv_switchgear', 2064600, 144522, 2209122, '2025-06-01', 'partially_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-071', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%NP.Construction%' OR name ILIKE '%NP Construction%' LIMIT 1),
  'CTPT Zero Export and LBS installation for Nanapan (NP Construction)',
  '05_hv_switchgear', 145000, 10150, 155150, '2025-06-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-072R1', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%NP.Construction%' OR name ILIKE '%NP Construction%' LIMIT 1),
  'CTPT Zero Export and LBS equipment for Nanapan (NP Construction)',
  '05_hv_switchgear', 674000, 47180, 721180, '2025-07-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-073', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%ATHENS%' LIMIT 1),
  'AC Cable for Nanapan (Athens Electrical)',
  '06_cabling', 1114155, 77990.85, 1192145.85, '2025-07-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-074', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Multi Utilities%' LIMIT 1),
  'Ground cable and AC cable for Nanapan (Multi Utilities)',
  '06_cabling', 397712.42, 27839.87, 425552.29, '2025-07-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-080', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%DHIPAYA%' LIMIT 1),
  'Project insurance CAR for Nanapan (Dhipaya Insurance)',
  '10_testing_warranty', 79328, 5552.96, 84880.96, '2025-07-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-091', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Multi Utilities%' LIMIT 1),
  'Transportation cost for ground cable for Nanapan (Multi Utilities)',
  '09_logistics', 3500, 245, 3745, '2025-08-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-098', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Envision%' LIMIT 1),
  'FTP to remote server monitoring for Nanapan (Envision)',
  '10_testing_warranty', 46000, 3220, 49220, '2025-08-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-100', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Multi Utilities%' LIMIT 1),
  'Transportation cost for AC cable for Nanapan (Multi Utilities)',
  '09_logistics', 3500, 245, 3745, '2025-08-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-101', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Envision%' LIMIT 1),
  'tGW-725 data logger for Nanapan (Envision)',
  '10_testing_warranty', 7800, 546, 8346, '2025-09-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-102', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%BEST OVERSEAS%' LIMIT 1),
  'Transportation cost for PV modules for Nanapan (Best Overseas)',
  '09_logistics', 107500, 7525, 115025, '2025-09-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-103', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%NYX%' LIMIT 1),
  'LiYCY-OZ communication cable for Nanapan (NYX Cable)',
  '06_cabling', 17258, 1208.06, 18466.06, '2025-09-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-108', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%PENGUIN%' LIMIT 1),
  'Fiber optic cable for Nanapan (Penguin Engineers)',
  '06_cabling', 17626.17, 1233.83, 18860, '2025-09-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-111', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%ATHENS%' LIMIT 1),
  'Additional AC and ground cable for Nanapan (Athens Electrical)',
  '06_cabling', 51182.52, 3582.78, 54765.30, '2025-10-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-112', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Zigma%' LIMIT 1),
  'Additional mounting structure for optimizer for Nanapan (Zigma Act)',
  '03_mounting', 19992, 1399.44, 21391.44, '2025-10-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-113', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%ATHENS%' LIMIT 1),
  'Additional ground cable for Nanapan (Athens Electrical)',
  '06_cabling', 2462.21, 172.35, 2634.56, '2025-10-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-122', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Zigma%' LIMIT 1),
  'Cable clips for Nanapan (Zigma Act)',
  '06_cabling', 20178.55, 1412.50, 21591.05, '2025-10-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-123', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%PENGUIN%' LIMIT 1),
  'Additional fiber optic for Nanapan (Penguin Engineers)',
  '06_cabling', 3271.03, 228.97, 3500, '2025-10-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-126', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Parabolic%' LIMIT 1),
  'Smart logger for Nanapan (Parabolic Systems)',
  '04_inverters_electrical', 17000, 1190, 18190, '2025-10-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-128', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%INTERLINK%' LIMIT 1),
  'Additional fiber optic for Nanapan (Interlink Communication)',
  '06_cabling', 3600, 252, 3852, '2025-10-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-133', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%NP Electric%' OR name ILIKE '%NP.ELECTRIC%' LIMIT 1),
  'Converter 485 to fiber for Nanapan (NP Electric)',
  '05_hv_switchgear', 4400, 308, 4708, '2025-10-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-136', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Homepro%' OR name ILIKE '%HOME PRODUCT%' LIMIT 1),
  'TV for monitoring system for Nanapan (Homepro)',
  '10_testing_warranty', 10036.46, 702.55, 10739.01, '2025-10-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-189', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Suriya%' LIMIT 1),
  'Electrical engineer fees for signing and certifying documents for Nanapan (Suriya)',
  '08_engineering', 40000, 0, 40000, '2025-11-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Nanapan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

-- ============================================================
-- NARESUAN — 28 POs
-- NOTE: Vendor column is blank in sheet for most Naresuan POs
-- Vendor names extracted from PO description text
-- New entities needed: QTC, Texplore, Green Grow Energy,
-- ธารทอง legal, Precision Power, Parabolic Asia, Apichaya
-- ============================================================

-- Add missing Naresuan-specific entities first
INSERT INTO entities (name, type, is_related_party) VALUES
  ('Parabolic Asia Engineering Co.,Ltd.', 'vendor', false),
  ('Texplore Co.,Ltd.', 'vendor', false),
  ('Green Grow Energy Co.,Ltd.', 'vendor', false),
  ('QTC Energy Co.,Ltd.', 'vendor', false),
  ('Precision Power Co.,Ltd.', 'vendor', false),
  ('ห้างหุ้นส่วนสามัญ ธารทอง (Legal)', 'vendor', false),
  ('นายสุริยะ สุขะวัฒนะ (Transport)', 'vendor', false),
  ('Apichaya Construction', 'vendor', false),
  ('Haipronet Co.,Ltd.', 'vendor', false),
  ('Raksachon Trading Co.,Ltd.', 'vendor', false),
  ('Thai Solution Service Co.,Ltd.', 'vendor', false),
  ('Green Power Systems Co.,Ltd.', 'vendor', false)
ON CONFLICT (name) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-027', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%A-NGUN%' LIMIT 1),
  'Rental van for Naresuan project site visit (A-ngun Travel)',
  '09_logistics', 5000, 350, 5350, '2024-04-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-045', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%ธารทอง%' LIMIT 1),
  'ค่าที่ปรึกษาทางกฎหมาย Naresuan University (ธารทอง Legal)',
  '08_engineering', 220000, 0, 220000, '2024-04-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-061', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%สุริยะ%' LIMIT 1),
  'รถตู้ VIP for Naresuan site visits (นายสุริยะ สุขะวัฒนะ)',
  '09_logistics', 5200, 0, 5200, '2024-06-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-151', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%A-NGUN%' LIMIT 1),
  'Rental van 10 seat for Naresuan site visit Jul 2024 Phitsanulok (A-ngun Travel)',
  '09_logistics', 5000, 350, 5350, '2024-07-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-192', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Green Grow%' LIMIT 1),
  'Engineering design review and procurement advisory for Naresuan (Green Grow Energy)',
  '08_engineering', 660000, 46200, 706200, '2024-07-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-195', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Parabolic Asia%' LIMIT 1),
  'Project construction works permit and license for Naresuan (Parabolic Asia)',
  '08_engineering', 2000000, 140000, 2140000, '2024-08-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-196', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Parabolic Asia%' LIMIT 1),
  'Engineering works for Naresuan University solar project (Parabolic Asia)',
  '08_engineering', 1500000, 105000, 1605000, '2024-09-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-200', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%A-NGUN%' LIMIT 1),
  'Rental van 10 seat for Naresuan Sep 2024 Phitsanulok (A-ngun Travel)',
  '09_logistics', 7400, 518, 7918, '2024-09-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-007', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%MATRIX INTERFACE%' LIMIT 1),
  'Mounting support structure for Naresuan University solar (Matrix Interface)',
  '03_mounting', 5700000, 399000, 6099000, '2025-01-01', 'partially_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

-- PSS2025-015: Parabolic Asia — main EPC ฿65M excl VAT
INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-015', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Parabolic Asia%' LIMIT 1),
  'Supply and installation of Solar System Naresuan University — main EPC (Parabolic Asia)',
  '01_civil', 65000000, 4550000, 69550000, '2025-02-01', 'partially_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

-- PSS2025-028: QTC Transformer — ฿909,500 incl VAT only in sheet
-- excl = 909500/1.07 = 849,953.27
INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-028', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%QTC%' LIMIT 1),
  'Transformer 2000 kVA for Naresuan University (QTC Energy)',
  '05_hv_switchgear', 849953.27, 59496.73, 909450, '2025-02-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-030', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%CPT Drives%' LIMIT 1),
  'MDB, DB panels for Naresuan University (CPT Drives)',
  '05_hv_switchgear', 10000000, 700000, 10700000, '2025-02-01', 'partially_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-060', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%MATRIX INTERFACE%' LIMIT 1),
  'Mounting support structure additional for Naresuan (Matrix Interface)',
  '03_mounting', 116916.83, 8184.18, 125101.01, '2025-04-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-064', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%MATRIX INTERFACE%' LIMIT 1),
  'Mounting support structure additional 2 for Naresuan (Matrix Interface)',
  '03_mounting', 244092.60, 17086.48, 261179.08, '2025-05-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-068', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%MATRIX INTERFACE%' LIMIT 1),
  'Mounting support structure additional transportation for Naresuan (Matrix Interface)',
  '09_logistics', 7500, 525, 8025, '2025-05-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-084', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Apichaya%' LIMIT 1),
  'Roof repair for Naresuan University building (Apichaya Construction)',
  '01_civil', 45000, 0, 45000, '2025-05-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-086', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Texplore%' LIMIT 1),
  'Mooring and anchoring system for Naresuan floating solar (Texplore)',
  '07_installation', 1656000, 115920, 1771920, '2025-05-01', 'partially_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-087', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Texplore%' LIMIT 1),
  'Floating solar solutions for Naresuan University (Texplore)',
  '07_installation', 5796000, 405720, 6201720, '2025-05-01', 'partially_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

-- PSS2025-099R2: Polytechnology — INVERTERS USD989,152.94
-- THB amount ฿13,645,676.88 excl VAT as per Excel
INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-099R2', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Polytechnology%' LIMIT 1),
  'Inverter, Optimizer, Smart Logger and sDongle for Naresuan (Polytechnology, USD 989,152.94)',
  '04_inverters_electrical', 13645676.88, 955197.38, 14600874.26, '2025-04-01', 'partially_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

-- PSS2025-166: Polytechnology — INVERTERS BOI
INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-166', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Polytechnology%' LIMIT 1),
  'Inverter, Optimizer, Smart Logger BOI import for Naresuan (Polytechnology)',
  '04_inverters_electrical', 15999842.52, 1119988.98, 17119831.50, '2025-06-01', 'partially_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

-- PSS2025-132: Polytechnology — INVERTERS floating
INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-132', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Polytechnology%' LIMIT 1),
  'Inverter, Smart Logger for solar floating section Naresuan (Polytechnology)',
  '04_inverters_electrical', 1921794, 134525.58, 2056319.58, '2025-07-01', 'partially_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-127', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%CPT Drives%' LIMIT 1),
  'MDB panel cabinet change for Naresuan University (CPT Drives)',
  '05_hv_switchgear', 25000, 1750, 26750, '2025-07-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-138', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%CPT Drives%' LIMIT 1),
  'Modify cabinet type indoor to outdoor MDB DB for Naresuan (CPT Drives)',
  '05_hv_switchgear', 212000, 14840, 226840, '2025-08-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-141', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Precision Power%' LIMIT 1),
  'RMU for Naresuan University solar project (Precision Power)',
  '05_hv_switchgear', 576000, 40320, 616320, '2025-08-01', 'partially_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-143', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%CPT Drives%' LIMIT 1),
  'Modify MDB add ground mount for Naresuan University (CPT Drives)',
  '05_hv_switchgear', 95600, 6692, 102292, '2025-09-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-152', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Staubli%' LIMIT 1),
  'PV Connector MC4 for Naresuan University solar (Staubli Thailand)',
  '06_cabling', 84736, 5931.52, 90667.52, '2025-09-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-154', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%BEST OVERSEAS%' LIMIT 1),
  'Import, customs clearance and transport for optimizer Naresuan (Best Overseas)',
  '09_logistics', 51500, 3605, 55105, '2025-09-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-156', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Parabolic%' AND name NOT ILIKE '%Asia%' LIMIT 1),
  'Forklift for PV module unloading at Naresuan (via Niramon advance)',
  '09_logistics', 19000, 1330, 20330, '2025-09-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-157', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Parabolic%' AND name NOT ILIKE '%Asia%' LIMIT 1),
  'Hiab crane for PV module placement at Naresuan (via Niramon advance)',
  '09_logistics', 12149.53, 850.47, 13000, '2025-09-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Naresuan%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

-- ============================================================
-- WALAILAK — 14 POs
-- Correct column mapping: col6=excl VAT, col7=VAT, col8=incl VAT
-- PSS2025-106 SSV: excl=63,000,000 vat=4,410,000 incl=67,410,000
-- ============================================================

-- PSS2025-106: SSV Solar — main floating EPC
INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-106', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%SSV%' LIMIT 1),
  'Solar floating installation for Walailak — main EPC contract (SSV Solar)',
  '07_installation', 63000000, 4410000, 67410000, '2025-10-22', 'partially_paid'
FROM projects p WHERE p.name ILIKE '%Walailak%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-004', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Kanda%' LIMIT 1),
  'Topographical survey and bathymetric survey for Walailak (Kanda Survey)',
  '08_engineering', 65420.56, 4579.44, 70000, '2025-01-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Walailak%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-002', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Eng PSU%' OR name ILIKE '%Songkla%' LIMIT 1),
  'Soil boring test for Walailak floating solar site (Eng PSU)',
  '08_engineering', 46728.97, 3271.03, 50000, '2025-01-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Walailak%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-016', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Thai Solution%' LIMIT 1),
  'CoP report for Walailak floating solar (Thai Solution Service)',
  '08_engineering', 392523.36, 27476.64, 420000, '2025-01-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Walailak%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-054', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Raksachon%' LIMIT 1),
  'Civil works for Walailak floating solar site (Raksachon Trading)',
  '01_civil', 3539360, 247755.20, 3787115.20, '2025-04-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Walailak%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-065', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%DHIPAYA%' LIMIT 1),
  'Project insurance CAR for Walailak floating solar (Dhipaya Insurance)',
  '10_testing_warranty', 401361, 28095.27, 429456.27, '2025-04-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Walailak%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-076', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Raksachon%' LIMIT 1),
  'Additional civil works for Walailak floating solar site (Raksachon Trading)',
  '01_civil', 696035, 48722.45, 744757.45, '2025-06-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Walailak%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-121', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Green Power%' LIMIT 1),
  'Inverter rack and SMBD stand for Walailak floating solar (Green Power Systems)',
  '04_inverters_electrical', 250000, 17500, 267500, '2025-07-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Walailak%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-131', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Thai Solution%' LIMIT 1),
  'ESA report for Walailak floating solar (Thai Solution Service)',
  '08_engineering', 85000, 5950, 90950, '2025-08-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Walailak%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-137', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Raksachon%' LIMIT 1),
  'Electrical lighting and receptacle installation for Walailak (Raksachon)',
  '06_cabling', 25000, 1750, 26750, '2025-09-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Walailak%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-151', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%BEST OVERSEAS%' LIMIT 1),
  'Import, customs clearance and transport charge for Walailak equipment (Best Overseas)',
  '09_logistics', 774700.93, 54229.07, 828930, '2025-09-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Walailak%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-177', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Haipronet%' LIMIT 1),
  'Fuse link 35KV for Walailak floating solar HV connection (Haipronet)',
  '05_hv_switchgear', 7500, 525, 8025, '2025-10-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%Walailak%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

-- PSS2025-081 and PSS2025-080: Dhipaya insurance for LPF and Nanapan
-- These appear in Walailak sheet but are for other projects
-- Already inserted in Phase 3a (PSS2025-081 for LPF)
-- PSS2025-080 is for Nanapan — already inserted above
-- Skip these in Walailak

-- ============================================================
-- SFC PHASE 2 — 18 POs
-- SFC sheet columns: col5=excl VAT, col6=incl VAT
-- VAT = incl - excl (computed)
-- ============================================================

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2023-297', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Polytechnology%' LIMIT 1),
  'Inverter 50KTL 10Y, Smart Logger and Optimizer for SFC Phase 2 (Polytechnology)',
  '04_inverters_electrical', 1582876.40, 110801.35, 1693677.75, '2025-04-30', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-102', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%SSV%' LIMIT 1),
  'Supply and installation of Solar Rooftop for SFC Phase 2 — SFC portion (SSV Solar)',
  '07_installation', 649185, 45442.95, 694627.95, '2024-06-17', 'partially_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-103', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%SSV%' LIMIT 1),
  'Supply and installation of Solar Rooftop for SCC portion of SFC Phase 2 (SSV Solar)',
  '07_installation', 734330, 51403.10, 785733.10, '2024-06-17', 'partially_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-107', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Zigma%' LIMIT 1),
  'Mounting, basket tray, walkway for SCC portion of SFC Phase 2 (Zigma Act)',
  '03_mounting', 220269.42, 15418.86, 235688.28, '2024-06-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-108', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Zigma%' LIMIT 1),
  'Mounting, basket tray, walkway for SFC portion of SFC Phase 2 (Zigma Act)',
  '03_mounting', 370270.68, 25918.95, 396189.63, '2024-06-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-131', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%CSS%' LIMIT 1),
  'AC cable and communication cable for SFC Phase 2 (CSS Communication)',
  '06_cabling', 284087.64, 19886.13, 303973.78, '2024-06-24', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-138', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Envision%' LIMIT 1),
  'Monitoring system weather panel for SCC portion SFC Phase 2 (Envision)',
  '10_testing_warranty', 99700, 6979, 106679, '2024-06-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-139', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Envision%' LIMIT 1),
  'Monitoring system weather panel for SFC portion SFC Phase 2 (Envision)',
  '10_testing_warranty', 113800, 7966, 121766, '2024-06-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-148', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Zigma%' LIMIT 1),
  'Additional mounting for SFC Phase 2 (Zigma Act)',
  '03_mounting', 36855.54, 2579.89, 39435.43, '2024-07-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-160', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%DHIPAYA%' LIMIT 1),
  'Contractor all risks insurance for SFC Phase 2 (Dhipaya Insurance)',
  '10_testing_warranty', 16506, 1155.42, 17661.42, '2024-07-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2024-185', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%NP Electric%' OR name ILIKE '%NP.ELECTRIC%' LIMIT 1),
  'DB panel for SCC portion of SFC Phase 2 (NP Electric)',
  '05_hv_switchgear', 37500, 2625, 40125, '2024-09-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-024', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%DHIPAYA%' LIMIT 1),
  'Endorsement for contract works insurance SFC Phase 2 (Dhipaya Insurance)',
  '10_testing_warranty', 16599, 1161.93, 17760.93, '2025-01-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-056', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Multi Utilities%' LIMIT 1),
  'AC cable for SFC Phase 2 (Multi Utilities)',
  '06_cabling', 33322.59, 2332.58, 35655.17, '2025-03-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-059', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%ATHENS%' LIMIT 1),
  'DC cable for SFC Phase 2 (Athens Electrical)',
  '06_cabling', 300000, 21000, 321000, '2025-04-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-075R1', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%NP Electric%' OR name ILIKE '%NP.ELECTRIC%' LIMIT 1),
  'CT, VT and PQM panel for SCC portion of SFC Phase 2 (NP Electric)',
  '05_hv_switchgear', 159900, 11193, 171093, '2025-04-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-085', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%NP Electric%' OR name ILIKE '%NP.ELECTRIC%' LIMIT 1),
  'Modify busbar for SFC portion of SFC Phase 2 (NP Electric)',
  '05_hv_switchgear', 29000, 2030, 31030, '2025-05-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-088', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Multi Utilities%' LIMIT 1),
  'Additional AC cable for SFC portion of SFC Phase 2 (Multi Utilities)',
  '06_cabling', 11533.97, 807.38, 12341.35, '2025-06-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-096', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Multi Utilities%' LIMIT 1),
  'Additional AC cable 2nd order for SFC portion of SFC Phase 2 (Multi Utilities)',
  '06_cabling', 95207.40, 6664.52, 101871.92, '2025-07-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

INSERT INTO purchase_orders (pss_po_no, project_id, vendor_id, description,
  cost_category, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, po_date, status)
SELECT 'PSS2025-115', p.id,
  (SELECT id FROM entities WHERE name ILIKE '%Zigma%' LIMIT 1),
  'Additional mounting structure for SFC Phase 2 (Zigma Act)',
  '03_mounting', 5401, 378.07, 5779.07, '2025-08-01', 'fully_paid'
FROM projects p WHERE p.name ILIKE '%SFC%' LIMIT 1
ON CONFLICT (pss_po_no) DO NOTHING;

-- ============================================================
-- VERIFY: PO counts and totals per project
-- ============================================================
SELECT
  p.name as project,
  COUNT(po.id) as po_count,
  TO_CHAR(SUM(po.po_amount_excl_vat), 'FM฿999,999,999,999') as total_excl_vat,
  TO_CHAR(SUM(po.po_amount_incl_vat), 'FM฿999,999,999,999') as total_incl_vat
FROM purchase_orders po
JOIN projects p ON po.project_id = p.id
GROUP BY p.name
ORDER BY p.name;
