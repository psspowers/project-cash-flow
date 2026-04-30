import { supabase } from '../lib/supabase';

const TARGET_BUDGETS: Record<string, number> = {
  'LPF2': 13270000,
  'RCP': 20748166,
  'KKU': 283245000,
  'Walailak': 99985055,
  'Naresuan': 164461637,
  'Nanapan': 27822549,
  'Renaissance': 6980451,
  'LPF': 11592365,
};

export async function executeBudgetPatch() {
  const { data: projects } = await supabase.from('projects').select('*');
  if (!projects) return alert('No projects found.');

  let successCount = 0;

  for (const proj of projects) {
    let target = 0;
    if (proj.name.includes('LPF2')) target = TARGET_BUDGETS['LPF2'];
    else if (proj.name.includes('LPF')) target = TARGET_BUDGETS['LPF'];
    else if (proj.name.includes('RCP')) target = TARGET_BUDGETS['RCP'];
    else if (proj.name.includes('KKU')) target = TARGET_BUDGETS['KKU'];
    else if (proj.name.includes('Walailak')) target = TARGET_BUDGETS['Walailak'];
    else if (proj.name.includes('Naresuan')) target = TARGET_BUDGETS['Naresuan'];
    else if (proj.name.includes('Nanapan')) target = TARGET_BUDGETS['Nanapan'];
    else if (proj.name.includes('Renaissance')) target = TARGET_BUDGETS['Renaissance'];

    if (!target) continue;

    const { data: costings } = await supabase.from('project_costings')
      .select('*')
      .eq('project_id', proj.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!costings || costings.length === 0) continue;
    const baseline = costings[0];

    const oldTotal = baseline.total_cost_excl_vat || 1;
    const factor = target / oldTotal;

    const patch = {
      project_id: proj.id,
      stage: 'budget',
      status: 'evp_approved',
      sales_price_excl_vat: baseline.sales_price_excl_vat,
      sales_price_incl_vat: baseline.sales_price_incl_vat,
      cost_01_civil: Number((baseline.cost_01_civil * factor).toFixed(2)),
      cost_02_pv_modules: Number((baseline.cost_02_pv_modules * factor).toFixed(2)),
      cost_03_mounting: Number((baseline.cost_03_mounting * factor).toFixed(2)),
      cost_04_inverters: Number((baseline.cost_04_inverters * factor).toFixed(2)),
      cost_05_hv_switchgear: Number((baseline.cost_05_hv_switchgear * factor).toFixed(2)),
      cost_06_cabling: Number((baseline.cost_06_cabling * factor).toFixed(2)),
      cost_07_installation: Number((baseline.cost_07_installation * factor).toFixed(2)),
      cost_08_engineering: Number((baseline.cost_08_engineering * factor).toFixed(2)),
      cost_09_logistics: Number((baseline.cost_09_logistics * factor).toFixed(2)),
      cost_10_testing: Number((baseline.cost_10_testing * factor).toFixed(2)),
      total_cost_excl_vat: target,
      gross_margin_amount: baseline.sales_price_excl_vat - target,
      gross_margin_pct: ((baseline.sales_price_excl_vat - target) / baseline.sales_price_excl_vat) * 100,
      evp_approved_at: new Date().toISOString(),
      evp_approved_by: 'System Admin',
    };

    const { data: existingBudget } = await supabase.from('project_costings')
      .select('id').eq('project_id', proj.id).eq('stage', 'budget').maybeSingle();

    if (existingBudget) {
      const { error } = await supabase.from('project_costings').update(patch).eq('id', existingBudget.id);
      if (error) { alert(`Failed to update ${proj.name}: ${error.message}`); return; }
    } else {
      const { error } = await supabase.from('project_costings').insert([patch]);
      if (error) { alert(`Failed to insert ${proj.name}: ${error.message}`); return; }
    }
    successCount++;
  }

  alert(`DATABASE PATCH COMPLETE: ${successCount} budgets successfully scaled and EVP-Approved.`);
}
