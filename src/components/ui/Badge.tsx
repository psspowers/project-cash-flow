interface BadgeProps {
  label: string;
  variant?: 'green' | 'amber' | 'red' | 'gray' | 'blue';
}

const styles: Record<string, string> = {
  green: 'bg-[#1D9E75]/10 text-[#1D9E75] border border-[#1D9E75]/20',
  amber: 'bg-[#EF9F27]/10 text-[#EF9F27] border border-[#EF9F27]/20',
  red: 'bg-[#E24B4A]/10 text-[#E24B4A] border border-[#E24B4A]/20',
  gray: 'bg-gray-100 text-gray-500 border border-gray-200',
  blue: 'bg-[#378ADD]/10 text-[#378ADD] border border-[#378ADD]/20',
};

export default function Badge({ label, variant = 'gray' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[variant]}`}>
      {label}
    </span>
  );
}

export function statusVariant(status: string): 'green' | 'amber' | 'red' | 'gray' | 'blue' {
  const map: Record<string, 'green' | 'amber' | 'red' | 'gray' | 'blue'> = {
    active: 'green',
    received: 'green',
    paid: 'green',
    fully_paid: 'green',
    issued: 'green',
    cleared: 'green',
    cm_approved: 'blue',
    evp_approved: 'green',
    approved: 'green',
    approved_cm: 'blue',
    approved_evp: 'blue',
    released: 'blue',
    upcoming: 'blue',
    invoiced: 'amber',
    partially_paid: 'amber',
    submitted: 'amber',
    pending_manager: 'amber',
    draft: 'gray',
    planned: 'gray',
    completed: 'gray',
    cm_rejected: 'red',
    evp_rejected: 'red',
    bounced: 'red',
  };
  return map[status] ?? 'gray';
}
