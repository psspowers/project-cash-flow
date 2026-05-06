import { FileText, RefreshCw, X } from 'lucide-react';

interface Props {
  poNumber: string | null;
  isLocked: boolean;
  onSelectNonCommercial: () => void;
  onSelectCommercial: () => void;
  onClose: () => void;
}

export default function AmendmentChoiceModal({
  poNumber,
  isLocked,
  onSelectNonCommercial,
  onSelectCommercial,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md border border-gray-200 shadow-xl">
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Amend Purchase Order</h2>
            <p className="text-xs text-gray-400 mt-0.5">{poNumber ?? 'No PO number'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-3">
          <p className="text-xs text-gray-500 mb-4">
            Choose the type of amendment. Commercial edits will require full re-approval through the approval chain.
          </p>

          {/* Non-Commercial Option */}
          <button
            onClick={onSelectNonCommercial}
            className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-[#1D9E75] hover:bg-[#1D9E75]/5 transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1D9E75]/10 flex items-center justify-center shrink-0 group-hover:bg-[#1D9E75]/20 transition-colors">
                <FileText size={15} className="text-[#1D9E75]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Non-Commercial Edit</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  Update description or internal notes only. No re-approval required. PO remains approved.
                </p>
              </div>
            </div>
          </button>

          {/* Commercial Option */}
          <button
            onClick={isLocked ? undefined : onSelectCommercial}
            disabled={isLocked}
            className={`w-full text-left p-4 rounded-lg border-2 transition-all group ${
              isLocked
                ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
                : 'border-gray-200 hover:border-[#0f1923] hover:bg-gray-50 cursor-pointer'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                isLocked ? 'bg-gray-100' : 'bg-[#0f1923]/8 group-hover:bg-[#0f1923]/15'
              }`}>
                <RefreshCw size={15} className={isLocked ? 'text-gray-400' : 'text-[#0f1923]'} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Commercial Amendment</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  Change amounts, milestones, supplier, or payment terms. Creates a new revision draft requiring full re-approval.
                </p>
                {isLocked && (
                  <p className="text-xs text-[#E24B4A] mt-1.5 font-medium">
                    A revision is already in progress. Resolve it before creating another amendment.
                  </p>
                )}
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
