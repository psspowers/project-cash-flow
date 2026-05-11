/*
  # Update RCP – 788 kWp Rooftop Sales Price

  ## Change
  - Project: RCP – 788 kWp Rooftop (id: 44444444-aaaa-bbbb-cccc-aaaaaaaaaaaa)
  - New sales price incl. VAT 7%: ฿23,750,319.20
  - Derived sales price excl. VAT: ฿22,196,560.00 (23,750,319.20 / 1.07)

  ## Affected Records
  - Both `estimation` and `budget` stage costings are updated to keep them in sync.
*/

UPDATE project_costings
SET
  sales_price_incl_vat = 23750319.20,
  sales_price_excl_vat = 22196560.00
WHERE project_id = '44444444-aaaa-bbbb-cccc-aaaaaaaaaaaa'
  AND stage IN ('estimation', 'budget');
