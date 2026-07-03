import { supabase } from '../lib/supabase';
import type { UserRole, POStatus } from '../types';
import {
  PO_CEO_THRESHOLD,
  VOUCHER_MANAGER_THRESHOLD,
  VOUCHER_CEO_NOTIFY_THRESHOLD,
} from '../config/thresholds';

type NotificationType = 'info' | 'warning' | 'success' | 'error' | 'alert';

async function getProfileByRole(role: UserRole): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('role', role)
    .maybeSingle();
  return data as { id: string } | null;
}

export async function notify(
  userId: string,
  title: string,
  message: string,
  type: NotificationType = 'info',
  entityType?: string,
  entityId?: string,
): Promise<void> {
  await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message,
    type,
    is_read: false,
    related_entity_type: entityType ?? null,
    related_entity_id: entityId ?? null,
  });
}

// ─── Vendor Invoice Workflow ──────────────────────────────────────────────────

export interface InvoiceSubmitParams {
  poId: string;
  milestoneId: string | null;
  amount: number;
  invoiceNo: string;
  projectId: string;
  vendorId: string | null;
  costControllerId: string;
  projectName: string;
  poNumber: string | null;
  vendorName: string;
  milestoneNumber: number | null;
  existingInvoiceId?: string | null;
}

export async function submitInvoice(params: InvoiceSubmitParams): Promise<{ error: string | null }> {
  const {
    poId, milestoneId, amount, invoiceNo, projectId, vendorId,
    costControllerId, projectName, poNumber, vendorName, milestoneNumber,
    existingInvoiceId,
  } = params;

  if (existingInvoiceId) {
    const { error: updateError } = await supabase
      .from('vendor_invoices')
      .update({
        vendor_invoice_no: invoiceNo,
        invoice_amount_incl_vat: amount,
        net_payable: amount,
        po_milestone_id: milestoneId,
      })
      .eq('id', existingInvoiceId);

    if (updateError) {
      if (updateError.code === '23505') return { error: 'An invoice with this number already exists on this Purchase Order. Duplicate invoices are not allowed.' };
      return { error: updateError.message };
    }
  } else {
    const { error: insertError } = await supabase.from('vendor_invoices').insert({
      po_id: poId,
      project_id: projectId,
      vendor_id: vendorId,
      po_milestone_id: milestoneId,
      vendor_invoice_no: invoiceNo,
      invoice_amount_incl_vat: amount,
      received_amount: 0,
      wht_3pct: 0,
      net_payable: amount,
      status: 'received',
    });

    if (insertError) {
      if (insertError.code === '23505') return { error: 'An invoice with this number already exists on this Purchase Order. Duplicate invoices are not allowed.' };
      return { error: insertError.message };
    }
  }

  if (milestoneId) {
    await supabase.from('po_milestones').update({ status: 'invoiced' }).eq('id', milestoneId);
  }

  const invoiceRef = milestoneNumber != null
    ? `${poNumber ?? 'Draft PO'} Milestone #${milestoneNumber}`
    : `${poNumber ?? 'Direct Bill'}`;

  const cm = await getProfileByRole('construction_manager');
  if (cm) {
    await notify(
      cm.id,
      `Supplier invoice pending review — ${projectName}`,
      `${vendorName} has submitted invoice ${invoiceNo} for ${invoiceRef}. Logged by Cost Controller. Awaiting your review.`,
      'info',
      'project',
      projectId,
    );
  }

  // Also notify the cost controller that it was logged (confirmation)
  await notify(
    costControllerId,
    `Invoice logged — ${projectName}`,
    `Invoice ${invoiceNo} from ${vendorName} for ${invoiceRef} has been logged and is awaiting Construction Manager review.`,
    'info',
    'project',
    projectId,
  );

  return { error: null };
}

export async function approveInvoiceCM(
  invoiceId: string,
  cmId: string,
  projectName: string,
  invoiceNo: string,
  projectId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('vendor_invoices')
    .update({ status: 'approved_cm', rejected_by: null, rejection_comment: null })
    .eq('id', invoiceId);

  if (error) return { error: error.message };

  const evp = await getProfileByRole('evp');
  if (evp) {
    await notify(
      evp.id,
      `Supplier invoice ready for final approval — ${projectName}`,
      `Construction Manager has approved invoice ${invoiceNo}. Awaiting your final sign-off.`,
      'info',
      'project',
      projectId,
    );
  }

  return { error: null };
}

export async function rejectInvoiceCM(
  invoiceId: string,
  cmId: string,
  comment: string,
  projectName: string,
  invoiceNo: string,
  projectId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('vendor_invoices')
    .update({ status: 'rejected', rejected_by: cmId, rejection_comment: comment })
    .eq('id', invoiceId);

  if (error) return { error: error.message };

  const cc = await getProfileByRole('cost_controller');
  if (cc) {
    await notify(
      cc.id,
      `Supplier invoice rejected — ${projectName}`,
      `Construction Manager rejected invoice ${invoiceNo}: "${comment}"`,
      'warning',
      'project',
      projectId,
    );
  }

  return { error: null };
}

export async function approveInvoiceEVP(
  invoiceId: string,
  evpId: string,
  amount: number,
  projectName: string,
  invoiceNo: string,
  projectId: string,
): Promise<{ error: string | null }> {
  if (amount < PO_CEO_THRESHOLD) {
    const { error } = await supabase
      .from('vendor_invoices')
      .update({ status: 'released' })
      .eq('id', invoiceId);

    if (error) return { error: error.message };

    const acct = await getProfileByRole('accounts_supervisor');
    if (acct) {
      await notify(
        acct.id,
        `Invoice released for payment — ${projectName}`,
        `Invoice ${invoiceNo} (฿${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}) has been approved by EVP and is ready for payment processing.`,
        'success',
        'project',
        projectId,
      );
    }
  } else {
    const { error } = await supabase
      .from('vendor_invoices')
      .update({ status: 'approved_evp' })
      .eq('id', invoiceId);

    if (error) return { error: error.message };

    const ceo = await getProfileByRole('ceo');
    if (ceo) {
      await notify(
        ceo.id,
        `Large invoice requires CEO approval — ${projectName}`,
        `EVP has approved invoice ${invoiceNo} (฿${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}). Amount exceeds ฿3M — your final approval is required before payment.`,
        'alert',
        'project',
        projectId,
      );
    }
  }

  return { error: null };
}

export async function approveInvoiceCEO(
  invoiceId: string,
  ceoId: string,
  projectName: string,
  invoiceNo: string,
  amount: number,
  projectId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('vendor_invoices')
    .update({ status: 'released' })
    .eq('id', invoiceId);

  if (error) return { error: error.message };

  const acct = await getProfileByRole('accounts_supervisor');
  if (acct) {
    await notify(
      acct.id,
      `Invoice released for payment — ${projectName}`,
      `Invoice ${invoiceNo} (฿${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}) has been approved by CEO and is ready for payment processing.`,
      'success',
      'project',
      projectId,
    );
  }

  return { error: null };
}

export async function rejectInvoice(
  invoiceId: string,
  userId: string,
  comment: string,
  projectName: string,
  invoiceNo: string,
  projectId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('vendor_invoices')
    .update({ status: 'rejected', rejected_by: userId, rejection_comment: comment })
    .eq('id', invoiceId);

  if (error) return { error: error.message };

  const [cc, cm, evp] = await Promise.all([
    getProfileByRole('cost_controller'),
    getProfileByRole('construction_manager'),
    getProfileByRole('evp'),
  ]);

  const notifyTargets = [cc, cm, evp].filter(Boolean) as { id: string }[];
  await Promise.all(notifyTargets.map(p =>
    notify(
      p.id,
      `Supplier invoice rejected — ${projectName}`,
      `Invoice ${invoiceNo} has been rejected: "${comment}". Cost Controller must resolve and resubmit.`,
      'warning',
      'project',
      projectId,
    )
  ));

  return { error: null };
}

// ─── PO State Machine ─────────────────────────────────────────────────────────

export { PO_CEO_THRESHOLD };

export async function logPOAction(
  poId: string,
  action: string,
  fromStatus: POStatus | null,
  toStatus: POStatus,
  actorId: string,
  notes?: string,
): Promise<void> {
  await supabase.from('po_audit_log').insert({
    po_id: poId,
    action,
    from_status: fromStatus ?? null,
    to_status: toStatus,
    actor_id: actorId,
    notes: notes ?? null,
  });
}

export interface POActionParams {
  poId: string;
  actorId: string;
  projectName: string;
  projectId: string;
  poDescription: string;
  poAmountInclVat: number;
  currentStatus: POStatus;
}

// Step a → b: Procurement submits to Cost Controller
export async function submitPO(params: POActionParams): Promise<{ error: string | null }> {
  const { poId, actorId, projectName, projectId, poDescription, currentStatus } = params;

  const { error } = await supabase
    .from('purchase_orders')
    .update({ status: 'pending_cc', submitted_by: actorId, submitted_at: new Date().toISOString() })
    .eq('id', poId);

  if (error) return { error: error.message };

  await logPOAction(poId, 'submitted', currentStatus, 'pending_cc', actorId);

  const cc = await getProfileByRole('cost_controller');
  if (cc) {
    await notify(
      cc.id,
      `PO awaiting budget review — ${projectName}`,
      `A new purchase order has been submitted for your review.\n\nScope: ${poDescription}\n\nYour mandate: Verify that this PO fits within the project budget, that payment terms are acceptable, and that the milestone schedule is realistic.`,
      'info',
      'purchase_order',
      poId,
    );
  }

  return { error: null };
}

// Step b → c: Cost Controller approves, forwards to Construction Manager
export async function approvePO_CC(
  params: POActionParams,
  ccNotes?: string,
): Promise<{ error: string | null }> {
  const { poId, actorId, projectName, projectId, poDescription, currentStatus } = params;

  const { error } = await supabase
    .from('purchase_orders')
    .update({ status: 'pending_cm' })
    .eq('id', poId);

  if (error) return { error: error.message };

  await logPOAction(poId, 'approved_cc', currentStatus, 'pending_cm', actorId, ccNotes);

  const cm = await getProfileByRole('construction_manager');
  if (cm) {
    await notify(
      cm.id,
      `PO awaiting technical review — ${projectName}`,
      `Cost Controller has approved the budget fit for this PO.\n\nScope: ${poDescription}\n\nYour mandate: Confirm the supplier is technically qualified, quantities are correct, scope matches site requirements, and the construction schedule is achievable.`,
      'info',
      'purchase_order',
      poId,
    );
  }

  return { error: null };
}

// Step c → d: Construction Manager approves, forwards to EVP
export async function approvePO_CM(
  params: POActionParams,
  cmNotes?: string,
): Promise<{ error: string | null }> {
  const { poId, actorId, projectName, projectId, poDescription, poAmountInclVat, currentStatus } = params;

  const { error } = await supabase
    .from('purchase_orders')
    .update({ status: 'pending_evp' })
    .eq('id', poId);

  if (error) return { error: error.message };

  await logPOAction(poId, 'approved_cm', currentStatus, 'pending_evp', actorId, cmNotes);

  const evp = await getProfileByRole('evp');
  if (evp) {
    await notify(
      evp.id,
      `PO awaiting commercial approval — ${projectName}`,
      `Construction Manager has confirmed technical suitability.\n\nScope: ${poDescription}\nAmount: ฿${poAmountInclVat.toLocaleString('en-US', { maximumFractionDigits: 0 })} (incl. VAT)\n\nYour mandate: Evaluate whether the budget is commercially justified, the supplier is the right choice, and payment terms comply with company policy.${poAmountInclVat >= PO_CEO_THRESHOLD ? '\n\nNote: This PO exceeds ฿3M and will require CEO approval after your sign-off.' : ''}`,
      'info',
      'purchase_order',
      poId,
    );
  }

  return { error: null };
}

// Step d → e (under ฿3M) or d → d.1 (≥ ฿3M): EVP approves
export async function approvePO_EVP(
  params: POActionParams,
  evpNotes?: string,
): Promise<{ error: string | null }> {
  const { poId, actorId, projectName, projectId, poDescription, poAmountInclVat, currentStatus } = params;

  if (poAmountInclVat >= PO_CEO_THRESHOLD) {
    // Escalate to CEO
    const { error } = await supabase
      .from('purchase_orders')
      .update({ status: 'pending_ceo' })
      .eq('id', poId);

    if (error) return { error: error.message };

    await logPOAction(poId, 'approved_evp_escalated', currentStatus, 'pending_ceo', actorId, evpNotes);

    const ceo = await getProfileByRole('ceo');
    if (ceo) {
      await notify(
        ceo.id,
        `Large PO requires CEO approval — ${projectName}`,
        `EVP has approved this purchase order. Amount exceeds ฿3M — your final approval is required.\n\nScope: ${poDescription}\nAmount: ฿${poAmountInclVat.toLocaleString('en-US', { maximumFractionDigits: 0 })} (incl. VAT)\n\nYour mandate: Confirm this expenditure is strategically sound and authorised within the project budget envelope.`,
        'alert',
        'purchase_order',
        poId,
      );
    }
  } else {
    // Final approval — issue PO number
    const { data: project } = await supabase
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .maybeSingle();

    const projectCode = project?.name
      ? project.name.split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '')
      : 'PSS';

    const { data: pssNo, error: rpcError } = await supabase.rpc('generate_pss_po_number', { p_project_code: projectCode });
    if (rpcError) return { error: rpcError.message };

    const { error } = await supabase
      .from('purchase_orders')
      .update({
        status: 'approved',
        pss_po_no: pssNo,
        approved_by: actorId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', poId);

    if (error) return { error: error.message };

    await logPOAction(poId, 'approved_evp_final', currentStatus, 'approved', actorId, evpNotes);

    const procurement = await getProfileByRole('procurement');
    if (procurement) {
      await notify(
        procurement.id,
        `PO approved — issue PO number — ${projectName}`,
        `EVP has given final approval for this PO.\n\nScope: ${poDescription}\nPSS PO Number: ${pssNo}\n\nAction required: Issue the official PO document and send to vendor.`,
        'success',
        'purchase_order',
        poId,
      );
    }

    const cc = await getProfileByRole('cost_controller');
    if (cc) {
      await notify(
        cc.id,
        `PO approved — ${projectName}`,
        `Purchase order "${poDescription}" has been fully approved. PO No: ${pssNo}.`,
        'success',
        'purchase_order',
        poId,
      );
    }
  }

  return { error: null };
}

// Step d.1 → e: CEO approves (for POs ≥ ฿3M)
export async function approvePO_CEO(
  params: POActionParams,
  ceoNotes?: string,
): Promise<{ error: string | null }> {
  const { poId, actorId, projectName, projectId, poDescription, poAmountInclVat, currentStatus } = params;

  const { data: project } = await supabase
    .from('projects')
    .select('name')
    .eq('id', projectId)
    .maybeSingle();

  const projectCode = project?.name
    ? project.name.split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '')
    : 'PSS';

  const { data: pssNo, error: rpcError } = await supabase.rpc('generate_pss_po_number', { p_project_code: projectCode });
  if (rpcError) return { error: rpcError.message };

  const { error } = await supabase
    .from('purchase_orders')
    .update({
      status: 'approved',
      pss_po_no: pssNo,
      approved_by: actorId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', poId);

  if (error) return { error: error.message };

  await logPOAction(poId, 'approved_ceo', currentStatus, 'approved', actorId, ceoNotes);

  const procurement = await getProfileByRole('procurement');
  if (procurement) {
    await notify(
      procurement.id,
      `PO approved by CEO — issue PO number — ${projectName}`,
      `CEO has given final approval for this PO.\n\nScope: ${poDescription}\nAmount: ฿${poAmountInclVat.toLocaleString('en-US', { maximumFractionDigits: 0 })} (incl. VAT)\nPSS PO Number: ${pssNo}\n\nAction required: Issue the official PO document and send to vendor.`,
      'success',
      'purchase_order',
      poId,
    );
  }

  const [cc, evp] = await Promise.all([
    getProfileByRole('cost_controller'),
    getProfileByRole('evp'),
  ]);

  for (const profile of [cc, evp]) {
    if (profile) {
      await notify(
        profile.id,
        `PO approved by CEO — ${projectName}`,
        `Purchase order "${poDescription}" (฿${poAmountInclVat.toLocaleString('en-US', { maximumFractionDigits: 0 })}) has been approved by the CEO. PO No: ${pssNo}.`,
        'success',
        'purchase_order',
        poId,
      );
    }
  }

  return { error: null };
}

// Reject a PO at any stage — returns to draft with rejection record
export async function rejectPO(
  params: POActionParams,
  rejectorId: string,
  reason: string,
): Promise<{ error: string | null }> {
  const { poId, projectName, projectId, poDescription, currentStatus } = params;

  const { error } = await supabase
    .from('purchase_orders')
    .update({
      status: 'draft',
      rejected_by: rejectorId,
      rejected_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', poId);

  if (error) return { error: error.message };

  await logPOAction(poId, 'rejected', currentStatus, 'draft', rejectorId, reason);

  const [cc, procurement] = await Promise.all([
    getProfileByRole('cost_controller'),
    getProfileByRole('procurement'),
  ]);

  for (const profile of [cc, procurement]) {
    if (profile) {
      await notify(
        profile.id,
        `PO rejected — action required — ${projectName}`,
        `Purchase order "${poDescription}" has been rejected at stage ${currentStatus}.\n\nReason: "${reason}"\n\nPlease revise and resubmit.`,
        'warning',
        'purchase_order',
        poId,
      );
    }
  }

  return { error: null };
}

// ─── Revision Request Flow ────────────────────────────────────────────────────

export interface RevisionRequestParams {
  poId: string;
  requestorId: string;
  projectName: string;
  projectId: string;
  poDescription: string;
  pssPoNo: string | null;
  revisionReason: string;
  currentStatus: POStatus;
}

// Procurement or CC requests a revision/cancellation — notifies EVP
export async function requestPOChange(params: RevisionRequestParams): Promise<{ error: string | null }> {
  const { poId, requestorId, projectName, projectId, poDescription, pssPoNo, revisionReason, currentStatus } = params;

  const { error } = await supabase
    .from('purchase_orders')
    .update({
      status: 'pending_revision_approval',
      revision_reason: revisionReason,
      revision_requested_by: requestorId,
      revision_requested_at: new Date().toISOString(),
    })
    .eq('id', poId);

  if (error) return { error: error.message };

  await logPOAction(poId, 'revision_requested', currentStatus, 'pending_revision_approval', requestorId, revisionReason);

  const evp = await getProfileByRole('evp');
  if (evp) {
    await notify(
      evp.id,
      `PO revision request requires your decision — ${projectName}`,
      `A revision request has been raised for ${pssPoNo ?? 'PO (no number)'}: "${poDescription}".\n\nReason for change: "${revisionReason}"\n\nAction required: Authorize a Revision (creates a new draft that re-enters the approval chain) or authorize a Void (permanently closes the PO). You may also reject this request if no change is warranted.`,
      'alert',
      'purchase_order',
      poId,
    );
  }

  return { error: null };
}

export interface GrantPOChangeParams {
  poId: string;
  evpId: string;
  decision: 'revise' | 'void';
  projectName: string;
  projectId: string;
  poDescription: string;
  pssPoNo: string | null;
  currentVersion: number;
  decisionNotes?: string;
}

// EVP grants revision: either voids the PO or creates a new draft_revision copy
export async function grantPOChange(params: GrantPOChangeParams): Promise<{ error: string | null; newPoId?: string }> {
  const {
    poId, evpId, decision, projectName, projectId,
    poDescription, pssPoNo, currentVersion, decisionNotes,
  } = params;

  if (decision === 'void') {
    const { error } = await supabase
      .from('purchase_orders')
      .update({
        status: 'voided',
        superseded_at: new Date().toISOString(),
      })
      .eq('id', poId);

    if (error) return { error: error.message };

    await logPOAction(poId, 'voided', 'pending_revision_approval', 'voided', evpId, decisionNotes);

    const [cc, procurement] = await Promise.all([
      getProfileByRole('cost_controller'),
      getProfileByRole('procurement'),
    ]);

    for (const profile of [cc, procurement]) {
      if (profile) {
        await notify(
          profile.id,
          `PO voided — ${projectName}`,
          `EVP has authorised the cancellation of ${pssPoNo ?? 'PO (no number)'}: "${poDescription}". This PO is now permanently closed.${decisionNotes ? `\n\nEVP note: "${decisionNotes}"` : ''}`,
          'warning',
          'purchase_order',
          poId,
        );
      }
    }

    return { error: null };
  }

  // decision === 'revise': fetch the original PO and duplicate it as a new draft_revision
  const { data: original, error: fetchError } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('id', poId)
    .maybeSingle();

  if (fetchError || !original) return { error: fetchError?.message ?? 'Original PO not found' };

  const newVersion = currentVersion + 1;

  const { data: newPO, error: insertError } = await supabase
    .from('purchase_orders')
    .insert({
      project_id: original.project_id,
      vendor_id: original.vendor_id,
      description: original.description,
      cost_category: original.cost_category,
      po_amount_excl_vat: original.po_amount_excl_vat,
      vat_7pct: original.vat_7pct,
      po_amount_incl_vat: original.po_amount_incl_vat,
      wht_applies: original.wht_applies,
      wht_3pct: original.wht_3pct,
      wht_applicable: original.wht_applicable,
      wht_rate: original.wht_rate,
      has_supplier_milestones: original.has_supplier_milestones,
      supplier_name_raw: original.supplier_name_raw,
      notes: original.notes,
      status: 'draft_revision',
      version: newVersion,
      parent_po_id: poId,
      revision_reason: original.revision_reason,
      pss_po_no: null,
      pending_invoice_amount: 0,
      pending_remaining_amount: 0,
    })
    .select('id')
    .single();

  if (insertError || !newPO) return { error: insertError?.message ?? 'Failed to create revision draft' };

  // Mark original as superseded
  await supabase
    .from('purchase_orders')
    .update({ superseded_at: new Date().toISOString() })
    .eq('id', poId);

  await logPOAction(poId, 'superseded', 'pending_revision_approval', 'pending_revision_approval', evpId, `Superseded by revision v${newVersion} (${newPO.id})`);
  await logPOAction(newPO.id, 'revision_created', null, 'draft_revision', evpId, `Revision of ${pssPoNo ?? poId} (v${currentVersion} → v${newVersion})`);

  const [cc, procurement] = await Promise.all([
    getProfileByRole('cost_controller'),
    getProfileByRole('procurement'),
  ]);

  for (const profile of [cc, procurement]) {
    if (profile) {
      await notify(
        profile.id,
        `PO revision authorised — begin editing v${newVersion} — ${projectName}`,
        `EVP has authorised a revision of ${pssPoNo ?? 'PO (no number)'}: "${poDescription}".\n\nA new draft (Version ${newVersion}) has been created pre-populated with the original data. Please review, make the necessary changes, and resubmit through the full approval chain.${decisionNotes ? `\n\nEVP note: "${decisionNotes}"` : ''}`,
        'info',
        'purchase_order',
        newPO.id,
      );
    }
  }

  return { error: null, newPoId: newPO.id };
}

// EVP rejects the revision request — PO reverts to approved
export async function rejectPOChangeRequest(
  poId: string,
  evpId: string,
  projectName: string,
  projectId: string,
  poDescription: string,
  pssPoNo: string | null,
  reason: string,
  priorStatus: POStatus,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('purchase_orders')
    .update({
      status: priorStatus,
      revision_reason: null,
      revision_requested_by: null,
      revision_requested_at: null,
    })
    .eq('id', poId);

  if (error) return { error: error.message };

  await logPOAction(poId, 'revision_request_rejected', 'pending_revision_approval', priorStatus, evpId, reason);

  const [cc, procurement] = await Promise.all([
    getProfileByRole('cost_controller'),
    getProfileByRole('procurement'),
  ]);

  for (const profile of [cc, procurement]) {
    if (profile) {
      await notify(
        profile.id,
        `PO revision request declined — ${projectName}`,
        `EVP has declined the revision request for ${pssPoNo ?? 'PO (no number)'}: "${poDescription}".\n\nReason: "${reason}"\n\nThe PO remains in its prior status.`,
        'warning',
        'purchase_order',
        poId,
      );
    }
  }

  return { error: null };
}

// ─── Costing Workflow ─────────────────────────────────────────────────────────

export interface CostingActionParams {
  costingId: string;
  projectId: string;
  projectName: string;
  actorId: string;
  stage: 'estimation' | 'budget';
  comment?: string | null;
}

export async function submitCosting(params: CostingActionParams): Promise<{ error: string | null }> {
  const { costingId, projectId, projectName, actorId, stage } = params;

  const { error: costingErr } = await supabase
    .from('project_costings')
    .update({ status: 'submitted', submitted_by: actorId, submitted_at: new Date().toISOString() })
    .eq('id', costingId);
  if (costingErr) return { error: costingErr.message };

  const projectStatus = stage === 'estimation' ? 'estimation_submitted' : 'budget_submitted';
  const { error: projErr } = await supabase
    .from('projects')
    .update({ status: projectStatus })
    .eq('id', projectId);
  if (projErr) return { error: projErr.message };

  const cm = await getProfileByRole('construction_manager');
  if (cm) {
    const label = stage === 'estimation' ? 'Estimation' : 'Budget';
    await notify(
      cm.id,
      `${label} ready for review — ${projectName}`,
      `The ${label.toLowerCase()} for ${projectName} has been submitted. Awaiting your review.`,
      'info',
      'project',
      projectId,
    );
  }

  return { error: null };
}

export async function approveCostingCM(params: CostingActionParams): Promise<{ error: string | null }> {
  const { costingId, projectId, projectName, actorId, stage, comment } = params;

  const { error: costingErr } = await supabase
    .from('project_costings')
    .update({ status: 'cm_approved', cm_approved_by: actorId, cm_approved_at: new Date().toISOString(), cm_comments: comment ?? null })
    .eq('id', costingId);
  if (costingErr) return { error: costingErr.message };

  const projectStatus = stage === 'estimation' ? 'estimation_cm_approved' : 'budget_cm_approved';
  const { error: projErr } = await supabase
    .from('projects')
    .update({ status: projectStatus })
    .eq('id', projectId);
  if (projErr) return { error: projErr.message };

  const evp = await getProfileByRole('evp');
  if (evp) {
    const label = stage === 'estimation' ? 'Estimation' : 'Budget';
    await notify(
      evp.id,
      `${label} costing ready for your approval — ${projectName}`,
      `Construction Manager has reviewed and approved the ${label.toLowerCase()} for ${projectName}. Awaiting your final sign-off.`,
      'info',
      'project',
      projectId,
    );
  }

  return { error: null };
}

export async function approveCostingEVP(params: CostingActionParams): Promise<{ error: string | null }> {
  const { costingId, projectId, projectName, actorId, stage, comment } = params;

  const { error: costingErr } = await supabase
    .from('project_costings')
    .update({ status: 'evp_approved', evp_approved_by: actorId, evp_approved_at: new Date().toISOString(), evp_comments: comment ?? null })
    .eq('id', costingId);
  if (costingErr) return { error: costingErr.message };

  const projectStatus = stage === 'estimation' ? 'estimation_approved' : 'active';
  const { error: projErr } = await supabase
    .from('projects')
    .update({ status: projectStatus })
    .eq('id', projectId);
  if (projErr) return { error: projErr.message };

  const cc = await getProfileByRole('cost_controller');
  if (cc) {
    const label = stage === 'estimation' ? 'Estimation' : 'Budget';
    const msg = stage === 'estimation'
      ? `EVP has approved the estimation for ${projectName}. You can now create the budget.`
      : `EVP has approved the budget for ${projectName}. The project is now active. You can create purchase orders.`;
    await notify(cc.id, `${label} approved — ${projectName}`, msg, 'success', 'project', projectId);
  }

  if (stage === 'budget') {
    const acct = await getProfileByRole('accounts_supervisor');
    if (acct) {
      await notify(
        acct.id,
        `New active project — ${projectName}`,
        `Project ${projectName} is now active. Cash receipts and payments can be recorded.`,
        'success',
        'project',
        projectId,
      );
    }
  }

  return { error: null };
}

export async function rejectCostingCM(
  costingId: string,
  projectId: string,
  projectName: string,
  actorId: string,
  stage: 'estimation' | 'budget',
  comment: string,
  stageLabel: string,
): Promise<{ error: string | null }> {
  const { error: costingErr } = await supabase
    .from('project_costings')
    .update({ status: 'cm_rejected', cm_approved_by: actorId, cm_approved_at: new Date().toISOString(), cm_comments: comment })
    .eq('id', costingId);
  if (costingErr) return { error: costingErr.message };

  const backStatus = stage === 'budget' ? 'budget_draft' : 'estimation_draft';
  const { error: projErr } = await supabase
    .from('projects')
    .update({
      status: backStatus,
      last_rejection_comment: comment,
      last_rejected_by: actorId,
      last_rejected_at: new Date().toISOString(),
      last_rejected_stage: stageLabel,
    })
    .eq('id', projectId);
  if (projErr) return { error: projErr.message };

  const cc = await getProfileByRole('cost_controller');
  if (cc) {
    await notify(cc.id, `${stageLabel} rejected`, `Rejected by Construction Manager: ${comment}`, 'warning', 'project', projectId);
  }

  return { error: null };
}

export async function rejectCostingEVP(
  costingId: string,
  projectId: string,
  projectName: string,
  actorId: string,
  stage: 'estimation' | 'budget',
  comment: string,
  stageLabel: string,
): Promise<{ error: string | null }> {
  const { error: costingErr } = await supabase
    .from('project_costings')
    .update({ status: 'evp_rejected', evp_approved_by: actorId, evp_approved_at: new Date().toISOString(), evp_comments: comment })
    .eq('id', costingId);
  if (costingErr) return { error: costingErr.message };

  const backStatus = stage === 'budget' ? 'budget_draft' : 'estimation_draft';
  const { error: projErr } = await supabase
    .from('projects')
    .update({
      status: backStatus,
      last_rejection_comment: comment,
      last_rejected_by: actorId,
      last_rejected_at: new Date().toISOString(),
      last_rejected_stage: stageLabel,
    })
    .eq('id', projectId);
  if (projErr) return { error: projErr.message };

  const cc = await getProfileByRole('cost_controller');
  if (cc) {
    await notify(cc.id, `${stageLabel} rejected`, `Rejected by EVP: ${comment}`, 'warning', 'project', projectId);
  }

  return { error: null };
}

// ─── Cash Transfer Workflow ────────────────────────────────────────────────────

export interface TransferActionParams {
  transferId: string;
  actorId: string;
  actorName: string;
  amount: number;
  fromProjectName: string;
  toProjectName: string;
  notes?: string | null;
}

export async function recommendTransferEVP(params: TransferActionParams): Promise<{ error: string | null }> {
  const { transferId, actorId, actorName, amount, fromProjectName, toProjectName, notes } = params;

  const { error } = await supabase
    .from('project_cash_transfers')
    .update({ status: 'evp_recommended', recommended_by: actorId, recommended_at: new Date().toISOString(), recommended_notes: notes ?? null })
    .eq('id', transferId);
  if (error) return { error: error.message };

  const ceo = await getProfileByRole('ceo');
  if (ceo) {
    await notify(
      ceo.id,
      'Margin transfer requires your approval',
      `${actorName} recommends approving a transfer of ฿${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })} from ${fromProjectName} to ${toProjectName}.${notes ? ` ${notes}` : ''} Requires your final approval.`,
      'info',
      'project_cash_transfer',
      transferId,
    );
  }

  return { error: null };
}

export async function approveTransferCEO(params: TransferActionParams): Promise<{ error: string | null }> {
  const { transferId, actorId, actorName, amount, fromProjectName, toProjectName } = params;

  const { error } = await supabase
    .from('project_cash_transfers')
    .update({ status: 'ceo_approved', approved_by: actorId, approved_at: new Date().toISOString(), transfer_date: new Date().toISOString().slice(0, 10) })
    .eq('id', transferId);
  if (error) return { error: error.message };

  const approvedDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const amtStr = `฿${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  const [cc, acct] = await Promise.all([
    getProfileByRole('cost_controller'),
    getProfileByRole('accounts_supervisor'),
  ]);

  if (cc) {
    await notify(
      cc.id,
      `Margin transfer approved — ${amtStr}`,
      `${actorName} has approved the transfer of ${amtStr} from ${fromProjectName} to ${toProjectName}.`,
      'info',
      'project_cash_transfer',
      transferId,
    );
  }
  if (acct) {
    await notify(
      acct.id,
      `Margin transfer approved for your records`,
      `${amtStr} transferred from ${fromProjectName} to ${toProjectName} approved by CEO on ${approvedDate}.`,
      'info',
      'project_cash_transfer',
      transferId,
    );
  }

  return { error: null };
}

export async function rejectTransferCEO(
  transferId: string,
  actorId: string,
  actorName: string,
  amount: number,
  fromProjectName: string,
  toProjectName: string,
  reason: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('project_cash_transfers')
    .update({ status: 'rejected', rejected_by: actorId, rejected_at: new Date().toISOString(), rejection_reason: reason })
    .eq('id', transferId);
  if (error) return { error: error.message };

  const amtStr = `฿${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const cc = await getProfileByRole('cost_controller');
  if (cc) {
    await notify(
      cc.id,
      'Transfer proposal rejected',
      `${actorName} rejected the transfer of ${amtStr} from ${fromProjectName} to ${toProjectName}. Reason: ${reason}`,
      'warning',
      'project_cash_transfer',
      transferId,
    );
  }

  return { error: null };
}

// ─── Voucher Co-Sign Workflow ─────────────────────────────────────────────────

export async function approveVoucherCosign(
  voucherId: string,
  actorId: string,
): Promise<{ error: string | null }> {
  const { error: vErr } = await supabase
    .from('payment_vouchers')
    .update({ status: 'approved', manager_approved_by: actorId, manager_approved_at: new Date().toISOString() })
    .eq('id', voucherId);
  if (vErr) return { error: vErr.message };

  const { error: cErr } = await supabase
    .from('checks')
    .update({ signed_by_manager: actorId })
    .eq('voucher_id', voucherId);
  if (cErr) return { error: cErr.message };

  return { error: null };
}

export async function rejectVoucherCosign(
  voucherId: string,
  actorId: string,
  comment: string,
  vendorInvoiceId: string | null | undefined,
): Promise<{ error: string | null }> {
  const { error: vErr } = await supabase
    .from('payment_vouchers')
    .update({ status: 'rejected', rejection_comment: comment, rejected_by: actorId, rejected_at: new Date().toISOString() })
    .eq('id', voucherId);
  if (vErr) return { error: vErr.message };

  if (vendorInvoiceId) {
    await supabase.from('vendor_invoices').update({ status: 'released' }).eq('id', vendorInvoiceId);
  }

  return { error: null };
}

// ─── Mark Invoice Paid ────────────────────────────────────────────────────────

export async function markInvoicePaid(invoiceId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('vendor_invoices')
    .update({ status: 'paid' })
    .eq('id', invoiceId);
  return { error: error?.message ?? null };
}

// ─── Check Lifecycle ──────────────────────────────────────────────────────────

export async function issueCheckAndMarkPaid(
  checkId: string,
  voucherId: string,
  invoiceId: string | null | undefined,
  checkNo: string,
  checkDate: string,
  bankAccount: string,
  actorId: string,
): Promise<{ error: string | null }> {
  const updates: Promise<unknown>[] = [
    supabase.from('payment_vouchers').update({ status: 'issued' }).eq('id', voucherId),
    supabase.from('checks').update({ check_no: checkNo, check_date: checkDate, bank_account: bankAccount, status: 'issued', signed_by_supervisor: actorId }).eq('id', checkId),
  ];
  if (invoiceId) {
    updates.push(supabase.from('vendor_invoices').update({ status: 'paid' }).eq('id', invoiceId));
  }
  await Promise.all(updates);
  return { error: null };
}

export async function approveCheckEdit(
  checkId: string,
  voucherId: string,
  invoiceId: string | null | undefined,
  edits: { bankAccount: string; checkNo: string; checkDate: string; payee: string },
  actorId: string,
): Promise<{ error: string | null }> {
  const updates: Promise<unknown>[] = [
    supabase.from('checks').update({
      bank_account: edits.bankAccount,
      check_no: edits.checkNo.trim() || null,
      check_date: edits.checkDate || null,
      payee: edits.payee.trim() || null,
      status: 'issued',
      edit_request_status: 'approved',
      signed_by_manager: actorId,
    }).eq('id', checkId),
    supabase.from('payment_vouchers').update({ status: 'issued', manager_approved_by: actorId, manager_approved_at: new Date().toISOString() }).eq('id', voucherId),
  ];
  if (invoiceId) {
    updates.push(supabase.from('vendor_invoices').update({ status: 'paid' }).eq('id', invoiceId));
  }
  await Promise.all(updates);
  return { error: null };
}

export async function markCheckCleared(
  checkId: string,
  clearedAt: string,
  note: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('checks')
    .update({ status: 'cleared', cleared_at: new Date(clearedAt).toISOString(), cleared_note: note ?? null })
    .eq('id', checkId);
  return { error: error?.message ?? null };
}

// ─── Payment Notification Helper ──────────────────────────────────────────────

export async function notifyPaymentIssued(
  voucherId: string,
  netPaid: number,
  vendorName: string,
  projectName: string,
): Promise<void> {
  const notifications: {
    user_id: string;
    title: string;
    message: string;
    type: 'warning' | 'info';
    is_read: boolean;
    related_entity_type: string;
    related_entity_id: string;
  }[] = [];

  if (netPaid >= VOUCHER_MANAGER_THRESHOLD) {
    const mgr = await getProfileByRole('accounts_manager');
    if (mgr) {
      notifications.push({
        user_id: mgr.id,
        title: 'Sign-off required',
        message: `Payment of ฿${netPaid.toLocaleString('en-US', { maximumFractionDigits: 0 })} to ${vendorName} for ${projectName} requires your co-signature.`,
        type: 'warning',
        is_read: false,
        related_entity_type: 'payment_voucher',
        related_entity_id: voucherId,
      });
    }
  }
  if (netPaid >= VOUCHER_CEO_NOTIFY_THRESHOLD) {
    const ceo = await getProfileByRole('ceo');
    if (ceo) {
      notifications.push({
        user_id: ceo.id,
        title: 'Large payment approved',
        message: `Payment of ฿${netPaid.toLocaleString('en-US', { maximumFractionDigits: 0 })} to ${vendorName} for ${projectName} has been approved.`,
        type: 'info',
        is_read: false,
        related_entity_type: 'payment_voucher',
        related_entity_id: voucherId,
      });
    }
  }
  if (notifications.length > 0) {
    await supabase.from('notifications').insert(notifications);
  }
}
