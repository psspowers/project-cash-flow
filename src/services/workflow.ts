import { supabase } from '../lib/supabase';
import type { UserRole } from '../types';

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
}

export async function submitInvoice(params: InvoiceSubmitParams): Promise<{ error: string | null }> {
  const {
    poId, milestoneId, amount, invoiceNo, projectId, vendorId,
    costControllerId, projectName, poNumber, vendorName, milestoneNumber,
  } = params;

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

  if (insertError) return { error: insertError.message };

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
