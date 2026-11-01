import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const production = process.argv.includes('--production');
const origin = production ? 'https://api.briochettvzla.com' : 'http://localhost:8787';
const local = production ? '' : await readFile('apps/api/.dev.vars', 'utf8');
const token = production
  ? process.env.BOOTSTRAP_TOKEN
  : local.match(/^BOOTSTRAP_TOKEN=(.+)$/m)?.[1];
if (!token)
  throw new Error(
    'Falta BOOTSTRAP_TOKEN. Proporciónalo por una variable de entorno, nunca como argumento.',
  );
const account = {
  name: process.env.ADMIN_NAME || 'Administración Briochett',
  email: process.env.ADMIN_EMAIL || 'administracion@briochett.invalid',
  username: process.env.ADMIN_USERNAME || 'administrador',
  role: 'administracion',
  password: randomBytes(24).toString('base64url'),
};
const response = await fetch(origin + '/internal/bootstrap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  body: JSON.stringify(account),
});
if (!response.ok)
  throw new Error(
    'No se pudo inicializar la cuenta: ' + response.status + ' ' + (await response.text()),
  );
await mkdir('.credentials', { recursive: true, mode: 0o700 });
await writeFile(
  '.credentials/' + (production ? 'produccion' : 'administrador-local') + '.json',
  JSON.stringify(
    {
      url: production ? 'https://app.briochettvzla.com' : 'http://localhost:5173',
      ...account,
      mustChangePassword: true,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  'Cuenta inicial creada. Credenciales guardadas en .credentials/' +
    (production ? 'produccion' : 'administrador-local') +
    '.json. Cambia la contraseña en el primer acceso.',
);
