import { format, parseISO } from 'date-fns';

export function formatTHB(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '฿0';
  const abs = Math.abs(amount);
  const formatted = '฿' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return amount < 0 ? '-' + formatted : formatted;
}

export function formatTHBCompact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '฿0';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) return sign + '฿' + (abs / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return sign + '฿' + (abs / 1_000).toFixed(0) + 'K';
  return formatTHB(amount);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy');
  } catch {
    return dateStr;
  }
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0%';
  return value.toFixed(1) + '%';
}
