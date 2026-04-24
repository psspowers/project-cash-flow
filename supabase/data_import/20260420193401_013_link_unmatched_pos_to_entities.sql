
/*
  # Link all unmatched POs to correct entities

  ## Summary
  This migration resolves all 24 purchase orders that had NULL vendor_id by:

  1. Creating 9 new vendor entities based on user-confirmed names
  2. Creating 2 individual staff-advance entries (K.Kittikun, K.Nakkarin) using the
     existing shared "PSS Internal — Staff Advance" entity
  3. Linking every previously-unmatched PO to its correct entity

  ## New Entities Created (vendor)
  - Kamelo International Logistics Co., Ltd
  - Thaipatanakit Transformer Co Ltd
  - Boom Wachira Transport Ltd Pvt
  - Provincial Electricity Authority
  - K Anuthep Chuen-iam (Land Fill)
  - K Kochaporn Wongprathanporn (Consultant)
  - K Kittiratmontri (Consultant)
  - United Manufacturing Co Ltd
  - Thung Thong Pattana Co., Ltd.

  ## Typo / Alias Matches (mapped to existing entities)
  - "Archtech Solar"        -> Arctech Solar
  - "Staubil"               -> Staubli Thailand Co.,Ltd.
  - "Homepro"               -> HOME PRODUCT CENTER Co.,Ltd.
  - "นายยุทธนา"              -> ยุทธนา บุญพุฒ (Architect)
  - "KNS"                   -> KSN FORTUNE SUCCESSFUL Co.,Ltd.
  - "PJ"                    -> P.J.Sumtech Co.,Ltd.
  - "506 Pcs"               -> Jinko Solar (mapped to existing Jinko entity if present,
                               otherwise new vendor created)
  - "Thai Patanakit"        -> Thaipatanakit Transformer Co Ltd (new)
  - "Kamello"/"Kamelo"      -> Kamelo International Logistics Co., Ltd (new)
  - "K.Kittikun","K.Nakkarin" -> PSS Internal — Staff Advance
  - "นางสาว กชพร ว่องประทานพร" -> K Kochaporn Wongprathanporn (Consultant)
  - "Kittiratmontri-consultant" -> K Kittiratmontri (Consultant)
  - "Anuthep Chuen-iam - lnad fill" -> K Anuthep Chuen-iam (Land Fill)
  - "United manufacturimg"  -> United Manufacturing Co Ltd (new)
  - "Thung Thong Pattana Co., Ltd." -> Thung Thong Pattana Co., Ltd. (new)

  ## Notes
  - Jinko Solar may or may not already exist; handled with INSERT ... ON CONFLICT DO NOTHING
  - All new entities are type = 'vendor' except staff advances which use the existing
    'PSS Internal — Staff Advance' internal entity
*/

-- ---------------------------------------------------------------
-- 1. Insert new vendor entities (skip if name already exists)
-- ---------------------------------------------------------------
INSERT INTO entities (name, type) VALUES
  ('Kamelo International Logistics Co., Ltd', 'vendor'),
  ('Thaipatanakit Transformer Co Ltd',        'vendor'),
  ('Boom Wachira Transport Ltd Pvt',          'vendor'),
  ('Provincial Electricity Authority',        'vendor'),
  ('K Anuthep Chuen-iam (Land Fill)',         'vendor'),
  ('K Kochaporn Wongprathanporn (Consultant)','vendor'),
  ('K Kittiratmontri (Consultant)',           'vendor'),
  ('United Manufacturing Co Ltd',             'vendor'),
  ('Thung Thong Pattana Co., Ltd.',           'vendor'),
  ('Jinko Solar',                             'vendor')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------
-- 2. Update POs — typo / alias matches to existing entities
-- ---------------------------------------------------------------

-- Archtech Solar -> Arctech Solar
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'Arctech Solar')
WHERE supplier_name_raw = 'Archtech Solar' AND vendor_id IS NULL;

-- Staubil -> Staubli Thailand Co.,Ltd.
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'Staubli Thailand Co.,Ltd.')
WHERE supplier_name_raw = 'Staubil' AND vendor_id IS NULL;

-- Homepro -> HOME PRODUCT CENTER Co.,Ltd.
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'HOME PRODUCT CENTER Co.,Ltd.')
WHERE supplier_name_raw = 'Homepro' AND vendor_id IS NULL;

-- นายยุทธนา -> ยุทธนา บุญพุฒ (Architect)
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'ยุทธนา บุญพุฒ (Architect)')
WHERE supplier_name_raw = 'นายยุทธนา' AND vendor_id IS NULL;

-- KNS -> KSN FORTUNE SUCCESSFUL Co.,Ltd.
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'KSN FORTUNE SUCCESSFUL Co.,Ltd.')
WHERE supplier_name_raw = 'KNS' AND vendor_id IS NULL;

-- PJ -> P.J.Sumtech Co.,Ltd.
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'P.J.Sumtech Co.,Ltd.')
WHERE supplier_name_raw = 'PJ' AND vendor_id IS NULL;

-- 506 Pcs -> Jinko Solar
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'Jinko Solar')
WHERE supplier_name_raw = '506 Pcs' AND vendor_id IS NULL;

-- K.Kittikun and K.Nakkarin -> PSS Internal — Staff Advance
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'PSS Internal — Staff Advance')
WHERE supplier_name_raw IN ('K.Kittikun', 'K.Nakkarin') AND vendor_id IS NULL;

-- ---------------------------------------------------------------
-- 3. Update POs — new entities
-- ---------------------------------------------------------------

-- Kamello / Kamelo -> Kamelo International Logistics Co., Ltd
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'Kamelo International Logistics Co., Ltd')
WHERE supplier_name_raw IN ('Kamello', 'Kamelo') AND vendor_id IS NULL;

-- Thai Patanakit -> Thaipatanakit Transformer Co Ltd
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'Thaipatanakit Transformer Co Ltd')
WHERE supplier_name_raw = 'Thai Patanakit' AND vendor_id IS NULL;

-- Boom Wachira Transport -> Boom Wachira Transport Ltd Pvt
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'Boom Wachira Transport Ltd Pvt')
WHERE supplier_name_raw = 'Boom Wachira Transport' AND vendor_id IS NULL;

-- PEA -> Provincial Electricity Authority
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'Provincial Electricity Authority')
WHERE supplier_name_raw = 'PEA' AND vendor_id IS NULL;

-- Anuthep Chuen-iam - lnad fill -> K Anuthep Chuen-iam (Land Fill)
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'K Anuthep Chuen-iam (Land Fill)')
WHERE supplier_name_raw = 'Anuthep Chuen-iam - lnad fill' AND vendor_id IS NULL;

-- นางสาว กชพร ว่องประทานพร -> K Kochaporn Wongprathanporn (Consultant)
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'K Kochaporn Wongprathanporn (Consultant)')
WHERE supplier_name_raw = 'นางสาว กชพร ว่องประทานพร' AND vendor_id IS NULL;

-- Kittiratmontri-consultant -> K Kittiratmontri (Consultant)
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'K Kittiratmontri (Consultant)')
WHERE supplier_name_raw = 'Kittiratmontri-consultant' AND vendor_id IS NULL;

-- United manufacturimg -> United Manufacturing Co Ltd
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'United Manufacturing Co Ltd')
WHERE supplier_name_raw = 'United manufacturimg' AND vendor_id IS NULL;

-- Thung Thong Pattana Co., Ltd. -> same (new entity)
UPDATE purchase_orders
SET vendor_id = (SELECT id FROM entities WHERE name = 'Thung Thong Pattana Co., Ltd.')
WHERE supplier_name_raw = 'Thung Thong Pattana Co., Ltd.' AND vendor_id IS NULL;
