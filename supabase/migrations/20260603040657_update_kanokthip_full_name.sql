/*
  # Update Kanokthip's full name

  Changes full_name from "Kanokthip Phetruang" to "Kanokthip Phongphaew"
  for the user with email kanokthip@psspowers.com.
*/

UPDATE user_profiles
SET full_name = 'Kanokthip Phongphaew'
WHERE email = 'kanokthip@psspowers.com';
