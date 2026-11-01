export const routeFrequencies = ['semanal', 'quincenal', 'mensual'] as const;
export type RouteFrequency = (typeof routeFrequencies)[number];
export type RouteRecurrence = { frequency: RouteFrequency; until: string };

export function addCalendarDays(day: string, amount: number) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function recurringRouteDates(start: string, repeat: RouteRecurrence | null): string[] {
  const anchor = new Date(start + 'T12:00:00Z');
  if (!Number.isFinite(+anchor)) return [];
  if (!repeat) return [start];
  const end = new Date(repeat.until + 'T12:00:00Z');
  if (!Number.isFinite(+end) || end < anchor || +end - +anchor > 366 * 86400000) return [];
  const dates: string[] = [];
  if (repeat.frequency !== 'mensual') {
    const interval = repeat.frequency === 'quincenal' ? 14 : 7;
    for (let day = start; day <= repeat.until; day = addCalendarDays(day, interval))
      dates.push(day);
    return dates;
  }
  const ordinal = Math.floor((anchor.getUTCDate() - 1) / 7);
  for (let month = 0; month <= 12; month++) {
    const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + month, 1, 12));
    const date = new Date(first);
    date.setUTCDate(1 + ((anchor.getUTCDay() - first.getUTCDay() + 7) % 7) + ordinal * 7);
    if (date.getUTCMonth() !== first.getUTCMonth()) continue;
    const day = date.toISOString().slice(0, 10);
    if (day > repeat.until) break;
    dates.push(day);
  }
  return dates;
}
