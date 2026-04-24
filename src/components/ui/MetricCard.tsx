import { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  accent?: 'green' | 'amber' | 'red' | 'blue' | 'default';
  trend?: { value: string; up: boolean };
}

const accentBorder: Record<string, string> = {
  green: 'border-l-[#1D9E75]',
  amber: 'border-l-[#EF9F27]',
  red: 'border-l-[#E24B4A]',
  blue: 'border-l-[#378ADD]',
  default: 'border-l-gray-300',
};

export default function MetricCard({ title, value, sub, icon, accent = 'default', trend }: MetricCardProps) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 border-l-4 ${accentBorder[accent]} p-5`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{title}</p>
          <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
          {trend && (
            <p className={`text-xs mt-1 font-medium ${trend.up ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
              {trend.up ? '▲' : '▼'} {trend.value}
            </p>
          )}
        </div>
        {icon && (
          <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 ml-3 shrink-0">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
