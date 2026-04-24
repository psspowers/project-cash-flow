import { format, parseISO } from 'date-fns';

export function formatTHB(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '฿0';
  return '฿' + amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatTHBCompact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '฿0';
  if (Math.abs(amount) >= 1_000_000) {
    return '฿' + (amount / 1_000_000).toFixed(2) + 'M';
  }
  if (Math.abs(amount) >= 1_000) {
    return '฿' + (amount / 1_000).toFixed(1) + 'K';
  }
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
