/*
  # Create new user accounts

  1. New Users
    - kanokthip@psspowers.com — role: procurement_executive, full_name: Kanokthip
    - pawitchaya@psspowers.com — role: banking_finance_officer, full_name: Pawitchaya

  2. Notes
    - Passwords are hashed using bcrypt
    - Users are inserted into auth.users then user_profiles
    - Uses DO block to handle already-exists gracefully
*/

DO $$
DECLARE
  v_kanokthip_id uuid;
  v_pawitchaya_id uuid;
BEGIN
  -- Kanokthip
  SELECT id INTO v_kanokthip_id FROM auth.users WHERE email = 'kanokthip@psspowers.com';
  IF v_kanokthip_id IS NULL THEN
    v_kanokthip_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
    ) VALUES (
      v_kanokthip_id,
      '00000000-0000-0000-0000-000000000000',
      'kanokthip@psspowers.com',
      crypt('PSS@2026', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      'authenticated',
      'authenticated',
      now(),
      now()
    );
  END IF;

  INSERT INTO user_profiles (id, email, full_name, role)
  VALUES (v_kanokthip_id, 'kanokthip@psspowers.com', 'Kanokthip', 'procurement_executive')
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

  -- Pawitchaya
  SELECT id INTO v_pawitchaya_id FROM auth.users WHERE email = 'pawitchaya@psspowers.com';
  IF v_pawitchaya_id IS NULL THEN
    v_pawitchaya_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
    ) VALUES (
      v_pawitchaya_id,
      '00000000-0000-0000-0000-000000000000',
      'pawitchaya@psspowers.com',
      crypt('PSS@2026', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      'authenticated',
      'authenticated',
      now(),
      now()
    );
  END IF;

  INSERT INTO user_profiles (id, email, full_name, role)
  VALUES (v_pawitchaya_id, 'pawitchaya@psspowers.com', 'Pawitchaya', 'banking_finance_officer')
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

END $$;
