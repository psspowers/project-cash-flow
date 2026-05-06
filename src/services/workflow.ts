import { supabase } from '../lib/supabase';
import type { UserRole, POStatus } from '../types';

type NotificationType = 'info' | 'warning' | 'success' | 'error' | 'alert';

async function getProfileByRole(role: UserRole): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('role', role)
    .maybeSingle();
  return data as { id: string } | null;
}

async function notify(
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
  milestoneId: string;
  amount: number;
  invoiceNo: string;
  projectId: string;
  vendorId: string | null;
  costControllerId: string;
  projectName: string;
  poNumber: string | null;
  vendorName: string;
  milestoneNumber: number;
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

  await supabase.from('po_milestones').update({ status: 'invoiced' }).eq('id', milestoneId);

  const cm = await getProfileByRole('construction_manager');
  if (cm) {
    await notify(
      cm.id,
      `Supplier invoice pending review — ${projectName}`,
      `${vendorName} has submitted invoice ${invoiceNo} for ${poNumber ?? 'Draft PO'} Milestone #${milestoneNumber}. Logged by Cost Controller. Awaiting your review.`,
      'info',
      'project',
      projectId,
    );
  }

  // Also notify the cost controller that it was logged (confirmation)
  await notify(
    costControllerId,
    `Invoice logged — ${projectName}`,
    `Invoice ${invoiceNo} from ${vendorName} for Milestone #${milestoneNumber} has been logged and is awaiting Construction Manager review.`,
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

const EVP_CEO_THRESHOLD = 3_000_000;

export async function approveInvoiceEVP(
  invoiceId: string,
  evpId: string,
  amount: number,
  projectName: string,
  invoiceNo: string,
  projectId: string,
): Promise<{ error: string | null }> {
  if (amount < EVP_CEO_THRESHOLD) {
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

export const PO_CEO_THRESHOLD = 3_000_000;

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

    const { data: pssNo } = await supabase.rpc('generate_pss_po_number', { p_project_code: projectCode });

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

  const { data: pssNo } = await supabase.rpc('generate_pss_po_number', { p_project_code: projectCode });

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
