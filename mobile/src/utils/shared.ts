// Mobile version: KaTeX rendering is handled via WebView in MathText component.
// This file exports the non-web utility functions only.

export const SUBJECT_COLORS: Record<string, string> = {
  CHEM: '#0A66C2',
  PHYS: '#0857A6',
  MATH: '#4A93DD',
  ECON: '#5D5B54',
};

export const SUBJECT_ICONS: Record<string, string> = {
  CHEM: '⚗️',
  PHYS: '⚛️',
  MATH: '📐',
  ECON: '📊',
};

export function getSubjectColor(subject: string): string {
  const code = String(subject || '').toUpperCase();
  return SUBJECT_COLORS[code] ?? '#0857A6';
}

export function getFirstName(user: any): string {
  const name = user?.name || user?.displayName || '';
  return String(name).split(/\s+/)[0] || '';
}

export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function calculateCompletionPercentage(completed: number, total: number): number {
  if (!total) return 0;
  return Math.round((completed / total) * 100);
}

export function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
}
