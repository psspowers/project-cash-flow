import { SupabaseClient } from '@supabase/supabase-js';

export interface MarginTransferPosition {
  contractInclVat: number;
  totalReceived: number;
  collectionRate: number;
  collectionRatePct: string;
  budgetCostExclVat: number;
  forecastMarginAtCompletion: number;
  releasableMargin: number;
  alreadyTransferred: number;
  availableToTransfer: number;
  hasApprovedBudget: boolean;
  isTransferBlocked: boolean;
  blockReason: string | null;
}

export async function computeMarginTransferPosition(
  supabase: SupabaseClient,
  projectId: string
): Promise<MarginTransferPosition> {
  const [projRes, budgetRes, receiptsRes, transfersRes] = await Promise.all([
    supabase
      .from('projects')
      .select('contract_incl_vat')
      .eq('id', projectId)
      .maybeSingle(),
    supabase
      .from('project_costings')
      .select('total_cost_excl_vat, gross_margin_amount')
      .eq('project_id', projectId)
      .eq('stage', 'budget')
      .eq('status', 'evp_approved')
      .maybeSingle(),
    supabase
      .from('cash_receipts')
      .select('net_received')
      .eq('project_id', projectId),
    supabase
      .from('project_cash_transfers')
      .select('amount')
      .eq('from_project_id', projectId)
      .eq('status', 'ceo_approved'),
  ]);

  const contractInclVat = (projRes.data?.contract_incl_vat as number) ?? 0;
  const budgetCostExclVat = (budgetRes.data?.total_cost_excl_vat as number) ?? 0;
  const budgetGrossMargin = (budgetRes.data?.gross_margin_amount as number) ?? 0;
  const hasApprovedBudget = !!budgetRes.data;

  const totalReceived = ((receiptsRes.data ?? []) as { net_received: number }[])
    .reduce((s, r) => s + r.net_received, 0);

  const alreadyTransferred = ((transfersRes.data ?? []) as { amount: number }[])
    .reduce((s, t) => s + t.amount, 0);

  if (!hasApprovedBudget) {
    return {
      contractInclVat,
      totalReceived,
      collectionRate: 0,
      collectionRatePct: '0.0%',
      budgetCostExclVat: 0,
      forecastMarginAtCompletion: 0,
      releasableMargin: 0,
      alreadyTransferred,
      availableToTransfer: 0,
      hasApprovedBudget: false,
      isTransferBlocked: true,
      blockReason:
        'No approved budget — margin cannot be calculated until the budget is EVP-approved.',
    };
  }

  const forecastMarginAtCompletion = budgetGrossMargin;

  if (forecastMarginAtCompletion <= 0) {
    const collectionRate = contractInclVat > 0 ? totalReceived / contractInclVat : 0;
    return {
      contractInclVat,
      totalReceived,
      collectionRate,
      collectionRatePct: (collectionRate * 100).toFixed(1) + '%',
      budgetCostExclVat,
      forecastMarginAtCompletion,
      releasableMargin: 0,
      alreadyTransferred,
      availableToTransfer: 0,
      hasApprovedBudget: true,
      isTransferBlocked: true,
      blockReason:
        'This project has no forecast margin. Transfers are only permitted from profitable projects.',
    };
  }

  const collectionRate = contractInclVat > 0 ? totalReceived / contractInclVat : 0;
  const releasableMargin = forecastMarginAtCompletion * collectionRate;
  const availableToTransfer = Math.max(0, releasableMargin - alreadyTransferred);

  if (availableToTransfer <= 0) {
    return {
      contractInclVat,
      totalReceived,
      collectionRate,
      collectionRatePct: (collectionRate * 100).toFixed(1) + '%',
      budgetCostExclVat,
      forecastMarginAtCompletion,
      releasableMargin,
      alreadyTransferred,
      availableToTransfer: 0,
      hasApprovedBudget: true,
      isTransferBlocked: true,
      blockReason: `No transferable margin available. Collection rate: ${(collectionRate * 100).toFixed(1)}% — earned margin: ฿${Math.round(releasableMargin).toLocaleString()} — already transferred: ฿${Math.round(alreadyTransferred).toLocaleString()}.`,
    };
  }

  return {
    contractInclVat,
    totalReceived,
    collectionRate,
    collectionRatePct: (collectionRate * 100).toFixed(1) + '%',
    budgetCostExclVat,
    forecastMarginAtCompletion,
    releasableMargin,
    alreadyTransferred,
    availableToTransfer,
    hasApprovedBudget: true,
    isTransferBlocked: false,
    blockReason: null,
  };
}
