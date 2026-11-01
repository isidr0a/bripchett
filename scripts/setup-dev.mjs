import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};
await mkdir('.credentials', { recursive: true, mode: 0o700 });
if (!(await exists('apps/api/.dev.vars')))
  await writeFile(
    'apps/api/.dev.vars',
    `API_ORIGIN=http://localhost:8787\nFRONTEND_ORIGIN=http://localhost:5173\nENVIRONMENT=development\nBETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}\nBOOTSTRAP_TOKEN=${randomBytes(48).toString('base64url')}\n`,
    { mode: 0o600 },
  );
if (!(await exists('apps/web/.env.local')))
  await writeFile('apps/web/.env.local', 'VITE_API_ORIGIN=http://localhost:8787\n');
// Actualiza únicamente los orígenes locales anteriores; conserva secretos y opciones personales.
for (const path of ['apps/api/.dev.vars', 'apps/web/.env.local']) {
  const current = await readFile(path, 'utf8');
  const updated = current.replace(
    /^(API_ORIGIN|FRONTEND_ORIGIN|VITE_API_ORIGIN)=http:\/\/127\.0\.0\.1:(5173|8787)\r?$/gm,
    '$1=http://localhost:$2',
  );
  if (updated !== current) await writeFile(path, updated);
}
console.log('Configuración local lista. Los secretos se guardaron fuera del control de versiones.');
