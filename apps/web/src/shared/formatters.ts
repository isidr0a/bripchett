export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error. Vuelve a intentar.';
export function dateTime(value: string) {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export const toISO = (value: string) => new Date(value + ':00-04:00').toISOString();
