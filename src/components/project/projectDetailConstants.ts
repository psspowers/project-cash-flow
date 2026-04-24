import type { CostingCategoryKey, CostCategory } from '../../types';

export const CATEGORY_MAP: Record<CostingCategoryKey, CostCategory> = {
  cost_01_civil: '01_civil',
  cost_02_pv_modules: '02_pv_modules',
  cost_03_mounting: '03_mounting',
  cost_04_inverters: '04_inverters_electrical',
  cost_05_hv_switchgear: '05_hv_switchgear',
  cost_06_cabling: '06_cabling',
  cost_07_installation: '07_installation',
  cost_08_engineering: '08_engineering',
  cost_09_logistics: '09_logistics',
  cost_10_testing: '10_testing_warranty',
};

export const CATEGORY_KEY_LABELS: Record<CostingCategoryKey, string> = {
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

export const CAT_LABELS: Record<string, string> = {
  '01_civil': '01 Civil',
  '02_pv_modules': '02 PV Modules',
  '03_mounting': '03 Mounting',
  '04_inverters_electrical': '04 Inverters',
  '05_hv_switchgear': '05 HV Switchgear',
  '06_cabling': '06 Cabling',
  '07_installation': '07 Installation',
  '08_engineering': '08 Engineering',
  '09_logistics': '09 Logistics',
  '10_testing_warranty': '10 Testing',
};

export const STATUS_BANNER: Record<string, { color: string; bg: string; border: string; message: string }> = {
  estimation_draft:       { color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', message: 'Estimation in progress — not yet submitted' },
  estimation_submitted:   { color: 'text-[#B45309]', bg: 'bg-amber-50', border: 'border-amber-200', message: 'Estimation submitted — awaiting CM review (Suraphol Sanyom)' },
  estimation_cm_approved: { color: 'text-[#1d4ed8]', bg: 'bg-blue-50', border: 'border-blue-200', message: 'Estimation CM-approved — awaiting EVP approval (Nakkarin Saingarmsatit)' },
  estimation_approved:    { color: 'text-[#166534]', bg: 'bg-green-50', border: 'border-green-200', message: "Estimation approved — budget not yet started. Click 'Start Budget' to proceed." },
  budget_draft:           { color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', message: 'Budget in progress — not yet submitted' },
  budget_submitted:       { color: 'text-[#B45309]', bg: 'bg-amber-50', border: 'border-amber-200', message: 'Budget submitted — awaiting CM review (Suraphol Sanyom)' },
  budget_cm_approved:     { color: 'text-[#1d4ed8]', bg: 'bg-blue-50', border: 'border-blue-200', message: 'Budget CM-approved — awaiting EVP final approval (Nakkarin Saingarmsatit)' },
  active:                 { color: 'text-[#166534]', bg: 'bg-green-50', border: 'border-green-200', message: 'Project active — budget is locked. Purchase orders can now be created.' },
  completed:              { color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', message: 'Project completed' },
};

export const DRAFT_STAGES = new Set(['estimation_draft', 'budget_draft']);

export function emptyCosting(): Record<CostingCategoryKey, string> {
  const obj = {} as Record<CostingCategoryKey, string>;
  (['cost_01_civil','cost_02_pv_modules','cost_03_mounting','cost_04_inverters','cost_05_hv_switchgear','cost_06_cabling','cost_07_installation','cost_08_engineering','cost_09_logistics','cost_10_testing'] as CostingCategoryKey[]).forEach(k => { obj[k] = '0'; });
  return obj;
}
