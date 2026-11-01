import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const origin = 'http://127.0.0.1:8787',
  front = 'http://127.0.0.1:5173';
const config = await readFile('apps/api/.dev.vars', 'utf8');
if (!/^ENVIRONMENT=development$/m.test(config))
  throw new Error('Solo se permiten datos de prueba en desarrollo.');
const token = config.match(/^BOOTSTRAP_TOKEN=(.+)$/m)?.[1];
const credentials = {};
async function request(path, data, cookie = '', method = 'POST') {
  const r = await fetch(origin + path, {
    method,
    headers: {
      Origin: front,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(path + ': ' + r.status + ' ' + JSON.stringify(body));
  return {
    body,
    cookie: r.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; '),
  };
}
const tmp = randomBytes(24).toString('base64url');
const admin = {
  name: 'Administración · Desarrollo',
  email: 'admin@briochett.invalid',
  username: 'admin.dev',
  role: 'administracion',
  password: tmp,
};
const res = await fetch(origin + '/internal/bootstrap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  body: JSON.stringify(admin),
});
if (!res.ok)
  throw new Error(
    'La base ya está inicializada o no está disponible. Usa una base local vacía para generar datos de prueba.',
  );
async function activate(user) {
  let login = await request('/api/auth/sign-in/username', {
    username: user.username,
    password: user.password,
  });
  const password = randomBytes(18).toString('base64url');
  const changed = await request(
    '/api/auth/change-password',
    { currentPassword: user.password, newPassword: password, revokeOtherSessions: true },
    login.cookie,
  );
  credentials[user.role] = { username: user.username, password };
  return {
    cookie: changed.cookie || login.cookie,
    ...(await request('/api/v1/me', undefined, changed.cookie || login.cookie, 'GET')).body,
  };
}
const a = await activate(admin),
  users = {};
for (const [role, name, username] of [
  ['vendedor', 'Carlos Pérez', 'carlos.dev'],
  ['preparacion', 'Preparación · Desarrollo', 'preparacion.dev'],
  ['supervision', 'Supervisión · Desarrollo', 'supervision.dev'],
]) {
  const u = {
    name,
    username,
    email: username + '@briochett.invalid',
    password: randomBytes(24).toString('base64url'),
    role,
  };
  const created = await request('/api/v1/users', u, a.cookie);
  users[role] = { id: created.body.id, ...(await activate(u)) };
}
const date = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Caracas',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
for (const [i, name] of ['Burger Point', 'Hot Dog House', 'Fast Grill', 'Urban Burger'].entries()) {
  await request(
    '/api/v1/clients',
    {
      name,
      rif: 'J-0000000' + (i + 1),
      contact: 'Encargado de compras',
      phone: i === 0 ? '' : '0412-000000' + (i + 1),
      address: i === 0 ? '' : 'Dirección de ejemplo ' + (i + 1),
      zone: 'Centro',
      sellerId: users.vendedor.id,
      active: true,
      geo:
        i === 0
          ? null
          : {
              latitude: 7.77 + i * 0.001,
              longitude: -72.22,
              accuracy: 12,
              capturedAt: new Date().toISOString(),
              confirmed: true,
            },
      slots: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '08:00', end: '18:00' })),
      recurrence: 'semanal',
      recurrenceStart: date,
    },
    a.cookie,
  );
}
for (const [sku, name, priceUsd] of [
  ['BRI', 'Pan Brioche Hamburguesa', '0.50'],
  ['PAP', 'Pan de Papa', '0.55'],
  ['INT', 'Pan Integral', '0.60'],
  ['TRA', 'Pan Tradicional', '0.45'],
])
  await request('/api/v1/products', { sku, name, priceUsd, active: true }, a.cookie);
for (const [currency, rate] of [
  ['COP', '4200.00'],
  ['VES', '120.00'],
])
  await request('/api/v1/rates', { currency, rate }, a.cookie);
await mkdir('.credentials', { recursive: true, mode: 0o700 });
await writeFile(
  '.credentials/desarrollo.json',
  JSON.stringify(
    {
      url: front,
      warning: 'Cuentas y precios ficticios. Solo desarrollo local.',
      accounts: credentials,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log('Datos de desarrollo creados. Credenciales locales en .credentials/desarrollo.json.');
