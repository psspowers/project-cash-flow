import type { UserRole } from '../types';

// Roles that can create POs, submit drafts, and write supplier data
export const PROCUREMENT_WRITE_ROLES: UserRole[] = ['cost_controller', 'procurement'];

// Roles that can view Purchase Orders and Suppliers (finance team is read-only)
export const PROCUREMENT_READ_ROLES: UserRole[] = [
  'cost_controller',
  'procurement',
  'banking_finance_officer',
  'accounts_supervisor',
  'accounts_manager',
];

// Roles that can access the analytics / monthly analyzer section
export const ANALYZER_ROLES: UserRole[] = [
  'cost_controller',
  'accounts_supervisor',
  'accounts_manager',
  'evp',
  'ceo',
];

// Roles that can enter actual SG&A monthly figures (Finance team + CEO)
export const FINANCE_ROLES: UserRole[] = [
  'accounts_manager',
  'accounts_supervisor',
  'ceo',
];

export function hasRole(role: UserRole | undefined | null, allowed: UserRole[]): boolean {
  return role != null && allowed.includes(role);
}
