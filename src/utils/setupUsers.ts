import { supabase } from '../lib/supabase';

const DEFAULT_USERS = [
  { email: 'niramon@psspowers.com', password: 'PSS@2026', full_name: 'Niramon Srimukda', role: 'cost_controller' },
  { email: 'suraphol@psspowers.com', password: 'PSS@2026', full_name: 'Suraphol Sanyom', role: 'construction_manager' },
  { email: 'nakkarin@psspowers.com', password: 'PSS@2026', full_name: 'Nakkarin Saingarmsatit', role: 'evp' },
  { email: 'nareerat@psspowers.com', password: 'PSS@2026', full_name: 'Nareerat Maksoongnern', role: 'accounts_supervisor' },
  { email: 'chudapak@psspowers.com', password: 'PSS@2026', full_name: 'Chudapak Juthachutinan', role: 'accounts_manager' },
  { email: 'sam@psspowers.com', password: 'PSS@2026', full_name: 'Sam Yamdagni', role: 'ceo' },
];

export async function setupDefaultUsers() {
  for (const user of DEFAULT_USERS) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: user.email,
        password: user.password,
      });

      if (data?.user && !error) {
        await supabase.from('user_profiles').upsert({
          id: data.user.id,
          full_name: user.full_name,
          email: user.email,
          role: user.role,
        }, { onConflict: 'id' });
      }
    } catch {
    }
  }
}
