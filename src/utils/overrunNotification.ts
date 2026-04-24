import { SupabaseClient } from '@supabase/supabase-js';
import { COSTING_CATEGORY_KEYS, CostingCategoryKey, CostCategory, fmtTHB } from '../types';

const CATEGORY_LABELS: Record<CostingCategoryKey, string> = {
  cost_01_civil: '01 Civil Works',
  cost_02_pv_modules: '02 PV Modules',
  cost_03_mounting: '03 Mounting',
  cost_04_inverters: '04 Inverters & Electrical',
  cost_05_hv_switchgear: '05 HV Switchgear',
  cost_06_cabling: '06 Cabling',
  cost_07_installation: '07 Installation',
  cost_08_engineering: '08 Engineering',
  cost_09_logistics: '09 Logistics',
  cost_10_testing: '10 Testing & Warranty',
};

const CAT_KEY_TO_CATEGORY: Record<CostingCategoryKey, CostCategory> = {
  cost_01_civil: '01_civil',
  cost_02_pv_modules: '02_pv_modules',
  cost_03_mounting: '03_mounting',
  cost_04_inverters: '04_inverters',
  cost_05_hv_switchgear: '05_hv_switchgear',
  cost_06_cabling: '06_cabling',
  cost_07_installation: '07_installation',
  cost_08_engineering: '08_engineering',
  cost_09_logistics: '09_logistics',
  cost_10_testing: '10_testing',
};

export async function checkAndNotifyOverrun(
  supabase: SupabaseClient,
  projectId: string,
  checkNo: string,
  currentUserId: string
): Promise<void> {
  const [{ data: budgetData }, { data: voData }, { data: projData }] = await Promise.all([
    supabase
      .from('project_costings')
      .select('*')
      .eq('project_id', projectId)
      .eq('stage', 'budget')
      .eq('status', 'evp_approved')
      .maybeSingle(),
    supabase
      .from('variation_orders')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'evp_approved'),
    supabase
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .maybeSingle(),
  ]);

  if (!budgetData || !projData) return;

  const projectName = (projData as { name: string }).name;
  const vos = (voData ?? []) as Record<string, unknown>[];

  const [{ data: evpProf }, { data: ceoProf }] = await Promise.all([
    supabase.from('user_profiles').select('id').eq('role', 'evp').maybeSingle(),
    supabase.from('user_profiles').select('id').eq('role', 'ceo').maybeSingle(),
  ]);

  for (const catKey of COSTING_CATEGORY_KEYS) {
    const poCategory = CAT_KEY_TO_CATEGORY[catKey];
    const budgetAmt = (budgetData as Record<string, unknown>)[catKey] as number ?? 0;
    const voAdj = vos.reduce((s, v) => s + ((v[catKey] as number) ?? 0), 0);
    const effectiveBudget = budgetAmt + voAdj;

    const { data: paidData } = await supabase
      .from('payment_vouchers')
      .select('net_paid, purchase_order:purchase_orders!po_id(cost_category, project_id)')
      .eq('status', 'issued');

    const paid = (paidData ?? []).filter((pv: Record<string, unknown>) => {
      const po = pv.purchase_order as Record<string, unknown> | null;
      return po && po.project_id === projectId && po.cost_category === poCategory;
    }).reduce((s: number, pv: Record<string, unknown>) => s + (pv.net_paid as number), 0);

    if (paid <= effectiveBudget) continue;

    const { data: prevPaidData } = await supabase
      .from('payment_vouchers')
      .select('net_paid, purchase_order:purchase_orders!po_id(cost_category, project_id)')
      .eq('status', 'issued')
      .neq('check_no', checkNo);

    const prevPaid = (prevPaidData ?? []).filter((pv: Record<string, unknown>) => {
      const po = pv.purchase_order as Record<string, unknown> | null;
      return po && po.project_id === projectId && po.cost_category === poCategory;
    }).reduce((s: number, pv: Record<string, unknown>) => s + (pv.net_paid as number), 0);

    if (prevPaid > effectiveBudget) continue;

    const overrunAmt = paid - effectiveBudget;
    const catLabel = CATEGORY_LABELS[catKey];
    const msg = `After issuing check ${checkNo}, actual spend in ${catLabel} on ${projectName} is ${fmtTHB(paid)}, exceeding the budget of ${fmtTHB(effectiveBudget)} by ${fmtTHB(overrunAmt)}. This is a confirmed loss.`;
    const title = `Cost overrun confirmed — ${projectName} ${catLabel}`;

    if (evpProf) {
      await supabase.from('notifications').insert({
        user_id: (evpProf as { id: string }).id,
        title,
        message: msg,
        type: 'warning',
        is_read: false,
      });
    }
    if (ceoProf) {
      await supabase.from('notifications').insert({
        user_id: (ceoProf as { id: string }).id,
        title,
        message: msg,
        type: 'warning',
        is_read: false,
      });
    }
  }
}
