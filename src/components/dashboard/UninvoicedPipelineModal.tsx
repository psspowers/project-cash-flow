import { useEffect, useState } from 'react';
import { X, Package, FileQuestion, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fmtTHB2dp } from './AnalysisPivotTable';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VendorInvoiceRef {
  id: string;
  status: string;
}

interface PurchaseOrderRef {
  pss_po_no: string | null;
  description: string | null;
  supplier_name_raw: string | null;
  project_id: string | null;
  entities: { name: string | null } | null;
}

interface ProjectRef {
  name: string;
}

interface RawMilestone {
  id: string;
  milestone_number: number;
  amount_due: number;
  planned_payment_date: string | null;
  status: string;
  purchase_orders: PurchaseOrderRef | null;
  projects: ProjectRef | null;
  vendor_invoices: VendorInvoiceRef[];
}

interface PipelineRow {
  milestoneId: string;
  milestoneNumber: number;
  amountDue: number;
  plannedDate: string | null;
  poNo: string | null;
  description: string | null;
  supplier: string | null;
  projectName: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string; // UUID or 'ALL'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const [y, m] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function isUnassigned(poNo: string | null): boolean {
  if (!poNo) return true;
  return poNo.startsWith('EXP-') || poNo.startsWith('NON-PO');
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function POBadge({ poNo }: { poNo: string | null }) {
  if (!poNo) {
    return (
      <span className="px-2 py-0.5 text-[11px] font-medium bg-red-100 text-red-800 rounded-full whitespace-nowrap">
        UNASSIGNED
      </span>
    );
  }
  if (poNo.startsWith('EXP-') || poNo.startsWith('NON-PO')) {
    return (
      <span className="px-2 py-0.5 text-[11px] font-medium bg-orange-100 text-orange-800 rounded-full font-mono whitespace-nowrap">
        {poNo}
      </span>
    );
  }
  return (
    <span className="font-mono text-[12px] text-gray-700 whitespace-nowrap">{poNo}</span>
  );
}

interface TableSectionProps {
  title: string;
  icon: React.ReactNode;
  rows: PipelineRow[];
  subtotal: number;
  accent: string;
}

function TableSection({ title, icon, rows, subtotal, accent }: TableSectionProps) {
  if (rows.length === 0) return null;

  return (
    <div className="mb-6">
      {/* Section header with subtotal */}
      <div className={`flex items-center justify-between px-4 py-2.5 rounded-t-lg border ${accent}`}>
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[12px] font-semibold text-gray-700">{title}</span>
          <span className="text-[11px] text-gray-400">({rows.length} item{rows.length !== 1 ? 's' : ''})</span>
        </div>
        <div className="text-right">
          <span className="text-[11px] text-gray-400 mr-2">Sub-total</span>
          <span className="text-[13px] font-bold text-gray-900 tabular-nums">{fmtTHB2dp(subtotal)}</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-t-0 border-gray-200 rounded-b-lg">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Project</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">PO Number</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide min-w-[160px]">Supplier</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide min-w-[180px]">Description</th>
              <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">MS #</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Planned Date</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Amount Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 bg-white">
            {rows.map((row) => (
              <tr key={row.milestoneId} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5 text-[12px] text-gray-700 font-medium whitespace-nowrap max-w-[140px] truncate">
                  {row.projectName ?? '—'}
                </td>
                <td className="px-4 py-2.5">
                  <POBadge poNo={row.poNo} />
                </td>
                <td className="px-4 py-2.5 text-[12px] text-gray-500 min-w-[160px]">
                  {row.supplier ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5 text-[12px] text-gray-500 min-w-[180px] max-w-[220px] truncate">
                  {row.description ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5 text-center text-[12px] text-gray-500">{row.milestoneNumber}</td>
                <td className="px-4 py-2.5 text-[12px] text-gray-500 whitespace-nowrap">{fmtDate(row.plannedDate)}</td>
                <td className="px-4 py-2.5 text-right text-[12px] font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                  {fmtTHB2dp(row.amountDue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function UninvoicedPipelineModal({ isOpen, onClose, projectId }: Props) {
  const [data, setData] = useState<PipelineRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchPipeline = async () => {
      setIsLoading(true);
      setError(null);

      const { data: milestoneData, error: milestoneError } = await supabase
        .from('po_milestones')
        .select(`
          id,
          milestone_number,
          amount_due,
          planned_payment_date,
          status,
          purchase_orders!inner (
            pss_po_no,
            description,
            supplier_name_raw,
            project_id,
            project:projects ( name ),
            vendor:entities!vendor_id ( name )
          ),
          vendor_invoices ( id, status )
        `)
        .eq('status', 'pending')
        .order('planned_payment_date', { ascending: true, nullsFirst: false });

      if (milestoneError) {
        setError(milestoneError.message);
        setIsLoading(false);
        return;
      }

      const raw = (milestoneData ?? []) as unknown as Array<{
        id: string;
        milestone_number: number;
        amount_due: number;
        planned_payment_date: string | null;
        status: string;
        purchase_orders: {
          pss_po_no: string | null;
          description: string | null;
          supplier_name_raw: string | null;
          project_id: string | null;
          project: { name: string } | null;
          vendor: { name: string | null } | null;
        } | null;
        vendor_invoices: { id: string; status: string }[];
      }>;

      // O+P Rule: keep only milestones with no active (non-rejected) invoice
      const filtered = raw.filter((pm) => {
        if (!pm.purchase_orders) return false;
        // Filter by project if specified
        if (projectId !== 'ALL' && pm.purchase_orders.project_id !== projectId) return false;
        const hasActiveInvoice = pm.vendor_invoices?.some((vi) => vi.status !== 'rejected');
        return !hasActiveInvoice;
      });

      const rows: PipelineRow[] = filtered.map((pm) => ({
        milestoneId: pm.id,
        milestoneNumber: pm.milestone_number,
        amountDue: Number(pm.amount_due),
        plannedDate: pm.planned_payment_date,
        poNo: pm.purchase_orders?.pss_po_no ?? null,
        description: pm.purchase_orders?.description ?? null,
        supplier: pm.purchase_orders?.supplier_name_raw ?? pm.purchase_orders?.vendor?.name ?? null,
        projectName: pm.purchase_orders?.project?.name ?? null,
      }));

      setData(rows);
      setIsLoading(false);
    };

    fetchPipeline();
  }, [isOpen, projectId]);

  // Bucket splitting
  const standardPOs = data.filter((pm) => !isUnassigned(pm.poNo));
  const unassignedPOs = data.filter((pm) => isUnassigned(pm.poNo));

  const standardTotal = standardPOs.reduce((s, r) => s + r.amountDue, 0);
  const unassignedTotal = unassignedPOs.reduce((s, r) => s + r.amountDue, 0);
  const grandTotal = standardTotal + unassignedTotal;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 pt-12 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl border border-black/[0.08] mb-12"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center">
              <Package size={15} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">Yet to Invoice — Pipeline Reconciliation</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Pending milestones with no active invoice (O+P Rule applied)
                {projectId !== 'ALL' && <span className="ml-1 text-amber-600 font-medium">— filtered by project</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Grand Total */}
            {!isLoading && !error && (
              <div className="text-right">
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Grand Total</p>
                <p className="text-2xl font-black text-gray-900 tabular-nums">{fmtTHB2dp(grandTotal)}</p>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700 ml-2"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {isLoading && (
            <div className="space-y-3 py-8">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              <span>Failed to load pipeline data: {error}</span>
            </div>
          )}

          {!isLoading && !error && data.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                <Package size={22} className="text-green-400" />
              </div>
              <p className="text-[14px] font-semibold text-gray-600">All milestones are invoiced</p>
              <p className="text-[12px] text-gray-400">No pending milestones without an active invoice were found.</p>
            </div>
          )}

          {!isLoading && !error && data.length > 0 && (
            <>
              {/* Standard POs table */}
              <TableSection
                title="Standard Purchase Orders"
                icon={<Package size={14} className="text-blue-500" />}
                rows={standardPOs}
                subtotal={standardTotal}
                accent="bg-blue-50 border-blue-200"
              />

              {/* Unassigned / Expenses table */}
              <TableSection
                title="Non-PO / Unassigned Commitments"
                icon={<FileQuestion size={14} className="text-orange-500" />}
                rows={unassignedPOs}
                subtotal={unassignedTotal}
                accent="bg-orange-50 border-orange-200"
              />

              {/* Grand Total footer */}
              <div className="mt-2 flex items-center justify-between px-4 py-3 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold text-amber-800 uppercase tracking-wide">Grand Total — Yet to Invoice</span>
                  <span className="text-[11px] text-amber-600">({data.length} milestone{data.length !== 1 ? 's' : ''})</span>
                </div>
                <span className="text-[18px] font-black text-amber-800 tabular-nums">{fmtTHB2dp(grandTotal)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
