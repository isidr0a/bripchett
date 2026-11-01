import type { Client } from '@briochett/contracts';
import { fail } from './errors';
export function caracasDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
export function visitFits(client: Client, iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return false;
  const dayDate = caracasDate(date),
    local = new Date(dayDate + 'T12:00:00Z'),
    day = local.getUTCDay();
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Caracas',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  if (!client.slots.some((s) => s.day === day && s.start <= time && time < s.end)) return false;
  const anchor = new Date(client.recurrenceStart + 'T00:00:00Z'),
    target = new Date(dayDate + 'T00:00:00Z'),
    days = Math.floor((+target - +anchor) / 86400000);
  if (days < 0) return false;
  if (client.recurrence === 'quincenal') return Math.floor(days / 7) % 2 === 0;
  if (client.recurrence === 'mensual')
    return Math.floor((local.getUTCDate() - 1) / 7) === Math.floor((anchor.getUTCDate() - 1) / 7);
  return true;
}
export function requireSchedule(c: Client, at: string) {
  if (!visitFits(c, at))
    fail(
      422,
      'VISIT_WINDOW',
      'La fecha no coincide con los días, horario o recurrencia del negocio.',
    );
}
