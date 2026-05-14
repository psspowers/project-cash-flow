import { CheckCircle2, Circle, XCircle, Clock } from 'lucide-react';
import type { POStatus } from '../../types';

const CEO_THRESHOLD = 3_000_000;

export type DotState = 'done' | 'active' | 'pending' | 'rejected';

export interface TimelineStep {
  key: string;
  label: string;
  roleLabel: string;
  dotState: DotState;
  actorName?: string;
}

interface Props {
  po: {
    status: POStatus;
    version: number;
    po_amount_incl_vat: number;
    rejected_by?: string;
  };
  auditActorMap: Map<string, string>;
}

function resolveSteps(
  status: POStatus,
  version: number,
  amount: number,
  auditActorMap: Map<string, string>,
): TimelineStep[] {
  const isAmendment = version > 1;
  const needsCeo = amount >= CEO_THRESHOLD;

  const STATUS_ORDER_STANDARD: POStatus[] = [
    'draft',
    'pending_cc',
    'pending_cm',
    'pending_evp',
    ...(needsCeo ? ['pending_ceo' as POStatus] : []),
    'approved',
  ];

  const STATUS_ORDER_AMENDMENT: POStatus[] = [
    'draft_revision',
    'pending_revision_approval',
    ...(needsCeo ? ['pending_ceo' as POStatus] : []),
    'approved',
  ];

  // For display purposes map each status to a human step label
  const STEP_META: Record<string, { label: string; roleLabel: string }> = {
    draft:                    { label: 'Draft',                roleLabel: 'Procurement' },
    pending_cc:               { label: 'Cost Controller',      roleLabel: 'Cost Controller' },
    pending_cm:               { label: 'Const. Manager',       roleLabel: 'Construction Manager' },
    pending_evp:              { label: 'EVP',                  roleLabel: 'EVP' },
    pending_ceo:              { label: 'CEO',                  roleLabel: 'CEO' },
    approved:                 { label: 'Approved',             roleLabel: 'EVP / CEO' },
    draft_revision:           { label: 'Draft Revision',       roleLabel: 'Procurement' },
    pending_revision_approval:{ label: 'EVP Decision',         roleLabel: 'EVP' },
  };

  const order = isAmendment ? STATUS_ORDER_AMENDMENT : STATUS_ORDER_STANDARD;

  // Determine the index of the current status in the order list
  // Treat paid/voided as terminal variants of approved/rejected
  let activeStatus: POStatus = status;
  if (status === 'partially_paid' || status === 'fully_paid') activeStatus = 'approved';
  if (status === 'voided' || status === 'cancelled') activeStatus = 'voided' as POStatus;

  const activeIdx = order.indexOf(activeStatus);
  const isRejected = status === 'voided' || status === 'cancelled';
  const isApproved = activeStatus === 'approved';

  return order.map((stepStatus, idx) => {
    const meta = STEP_META[stepStatus] ?? { label: stepStatus, roleLabel: stepStatus };
    const actorName = auditActorMap.get(stepStatus);

    let dotState: DotState;
    if (isRejected) {
      // All steps done up to active, then the final active is rejected, rest pending
      if (idx < activeIdx) dotState = 'done';
      else if (idx === activeIdx) dotState = 'rejected';
      else dotState = 'pending';
    } else if (isApproved) {
      dotState = 'done';
    } else if (idx < activeIdx) {
      dotState = 'done';
    } else if (idx === activeIdx) {
      dotState = 'active';
    } else {
      dotState = 'pending';
    }

    return {
      key: stepStatus,
      label: meta.label,
      roleLabel: meta.roleLabel,
      dotState,
      actorName: dotState === 'done' ? (actorName ?? undefined) : undefined,
    };
  });
}

function Dot({ state }: { state: DotState }) {
  if (state === 'done') {
    return (
      <CheckCircle2
        size={20}
        className="text-[#1D9E75] fill-[#1D9E75] shrink-0"
        strokeWidth={2.5}
      />
    );
  }
  if (state === 'active') {
    return (
      <span className="relative flex items-center justify-center shrink-0" style={{ width: 20, height: 20 }}>
        <span className="absolute inset-0 rounded-full bg-[#1D9E75]/25 animate-ping" />
        <Clock size={20} className="relative text-[#1D9E75]" strokeWidth={2} />
      </span>
    );
  }
  if (state === 'rejected') {
    return (
      <XCircle size={20} className="text-[#E24B4A] fill-[#E24B4A] shrink-0" strokeWidth={2.5} />
    );
  }
  // pending
  return (
    <Circle size={20} className="text-gray-300 shrink-0" strokeWidth={1.5} />
  );
}

export default function WorkflowTimeline({ po, auditActorMap }: Props) {
  const steps = resolveSteps(po.status, po.version, po.po_amount_incl_vat, auditActorMap);

  return (
    <div className="overflow-x-auto py-1">
      <div className="flex items-start min-w-max px-1">
        {steps.map((step, idx) => (
          <div key={step.key} className="flex items-start">
            {/* Step node */}
            <div className="flex flex-col items-center gap-1" style={{ minWidth: 72 }}>
              <Dot state={step.dotState} />
              <span
                className={`text-[10px] font-medium text-center leading-tight ${
                  step.dotState === 'active'
                    ? 'text-[#1D9E75]'
                    : step.dotState === 'done'
                    ? 'text-gray-500'
                    : step.dotState === 'rejected'
                    ? 'text-[#E24B4A]'
                    : 'text-gray-300'
                }`}
                style={{ maxWidth: 72 }}
              >
                {step.label}
              </span>
              {step.dotState === 'active' && (
                <span className="text-[9px] text-[#1D9E75]/80 font-normal text-center leading-tight" style={{ maxWidth: 72 }}>
                  Awaiting:<br />{step.roleLabel}
                </span>
              )}
              {step.dotState === 'done' && step.actorName && (
                <span className="text-[9px] text-gray-400 font-normal text-center leading-tight" style={{ maxWidth: 72 }}>
                  {step.actorName}
                </span>
              )}
            </div>

            {/* Connector line (not after last step) */}
            {idx < steps.length - 1 && (
              <div
                className={`h-px mt-[9px] mx-1 flex-shrink-0 ${
                  steps[idx + 1].dotState === 'pending' || steps[idx + 1].dotState === 'rejected'
                    ? 'bg-gray-200'
                    : 'bg-[#1D9E75]'
                }`}
                style={{ width: 32 }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
