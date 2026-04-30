/*
  # Fix estimation sales_price_incl_vat

  All estimation costings imported via data scripts were missing sales_price_incl_vat (stored as 0).
  This backfills the value as sales_price_excl_vat * 1.07 for every estimation row where it is 0 or NULL.
*/

UPDATE project_costings
SET sales_price_incl_vat = ROUND(sales_price_excl_vat * 1.07, 2)
WHERE stage = 'estimation'
  AND (sales_price_incl_vat = 0 OR sales_price_incl_vat IS NULL)
  AND sales_price_excl_vat > 0;
