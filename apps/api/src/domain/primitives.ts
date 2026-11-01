export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();

export async function hash(data: unknown) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(typeof data === 'string' ? data : JSON.stringify(data)),
  );
  return Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, '0')).join('');
}

export async function tokenEquals(a: string, b: string) {
  const [aHash, bHash] = await Promise.all([hash(a), hash(b)]);
  let difference = 0;
  for (let i = 0; i < aHash.length; i++) difference |= aHash.charCodeAt(i) ^ bHash.charCodeAt(i);
  return difference === 0;
}
