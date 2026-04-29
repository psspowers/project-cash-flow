import { createContext, useContext } from 'react';
import type { ProjectData } from '../hooks/useProjectData';
import type { ProjectCosting, VariationOrder } from '../types';

export interface ProjectDetailContextValue extends ProjectData {
  // Derived values computed once in ProjectDetail and shared
  estimation: ProjectCosting | undefined;
  budget: ProjectCosting | undefined;
  isCostController: boolean;
  isAccountsManager: boolean;
  isCM: boolean;
  isEVP: boolean;
  isCEO: boolean;
  isPO: boolean;
  canReschedule: boolean;
  isFinancialsLocked: boolean;
  totalReceived: number;
  totalPaid: number;
  profileName: (uid?: string | null) => string;
  voTotalCost: (vo: VariationOrder) => number;
}

export const ProjectDetailContext = createContext<ProjectDetailContextValue | null>(null);

export function useProjectDetail(): ProjectDetailContextValue {
  const ctx = useContext(ProjectDetailContext);
  if (!ctx) throw new Error('useProjectDetail must be used inside ProjectDetail');
  return ctx;
}
