import { mkdir, writeFile, access } from 'node:fs/promises';
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
    `API_ORIGIN=http://127.0.0.1:8787\nFRONTEND_ORIGIN=http://127.0.0.1:5173\nENVIRONMENT=development\nBETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}\nBOOTSTRAP_TOKEN=${randomBytes(48).toString('base64url')}\n`,
    { mode: 0o600 },
  );
if (!(await exists('apps/web/.env.local')))
  await writeFile('apps/web/.env.local', 'VITE_API_ORIGIN=http://127.0.0.1:8787\n');
console.log('Configuración local lista. Los secretos se guardaron fuera del control de versiones.');
