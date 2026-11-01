import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import app from '../apps/api/src/index';
import { createAuth } from '../apps/api/src/infrastructure/auth/better-auth';
import { calculateLine } from '../apps/api/src/domain/pricing';
import { visitFits } from '../apps/api/src/domain/scheduling';
import type { Bindings } from '../apps/api/src/config/bindings';
import { randomUUID } from 'node:crypto';

let mf: Miniflare, env: Bindings, db: D1Database;
const cookies: Record<string, string> = {},
  users: Record<string, any> = {};
let client: any, otherClient: any, incomplete: any, product: any;
async function request(
  path: string,
  role = 'administracion',
  method = 'GET',
  data?: unknown,
  extra: Record<string, string> = {},
) {
  const r = await app.request(
    'http://127.0.0.1:8787' + path,
    {
      method,
      headers: {
        Origin: env.FRONTEND_ORIGIN,
        ...(cookies[role] ? { Cookie: cookies[role] } : {}),
        ...(data ? { 'Content-Type': 'application/json' } : {}),
        ...extra,
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    },
    env,
  );
  const body = await r.json().catch(() => null);
  return { status: r.status, body, response: r };
}
async function createUser(role: string, name: string) {
  const result = await createAuth(env).api.createUser({
    body: {
      name,
      email: role + '@briochett.invalid',
      password: 'Initial-dev-2026!',
      role: role === 'second' ? 'vendedor' : role,
      data: { username: role, active: true, mustChangePassword: false },
    },
  });
  await db.prepare('UPDATE user SET mustChangePassword=0 WHERE id=?').bind(result.user.id).run();
  users[role] = result.user;
  const login = await request('/api/auth/sign-in/username', role, 'POST', {
    username: role,
    password: 'Initial-dev-2026!',
  });
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  cookies[role] = login.response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}
const baseClient = (name: string, sellerId: string) => ({
  name,
  rif: 'J-' + randomUUID().slice(0, 8),
  contact: 'Contacto de prueba',
  phone: '0000000000',
  address: 'Dirección ficticia',
  zone: 'Centro',
  sellerId,
  active: true,
  geo: {
    latitude: 7.77,
    longitude: -72.22,
    accuracy: 12,
    capturedAt: new Date().toISOString(),
    confirmed: true,
  },
  slots: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '08:00', end: '18:00' })),
  recurrence: 'semanal',
  recurrenceStart: '2026-01-01',
});
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: '2026-10-30',
      d1Databases: ['DB'],
    }),
  );
  db = (await mf.getD1Database('DB')) as unknown as D1Database;
  env = {
    DB: db,
    API_ORIGIN: 'http://127.0.0.1:8787',
    FRONTEND_ORIGIN: 'http://127.0.0.1:5173',
    BETTER_AUTH_SECRET: 'test-only-secret-not-for-production-2026-000000',
    BOOTSTRAP_TOKEN: 'test-only-bootstrap',
    ENVIRONMENT: 'test',
  };
  for (const file of ['0001_initial.sql', '0002_concurrency_guards.sql']) {
    const sql = await readFile(new URL('../apps/api/migrations/' + file, import.meta.url), 'utf8');
    const lines = sql.split('\n'),
      statements: string[] = [];
    let pending = '';
    for (const line of lines) {
      if (!line.trim()) continue;
      if (pending) {
        pending += ' ' + line.trim();
        if (line.trim() === 'END;' || line.trim().endsWith('END; END;')) {
          statements.push(pending);
          pending = '';
        }
      } else if (line.trim().startsWith('CREATE TRIGGER') && !line.trim().endsWith('END;'))
        pending = line.trim();
      else statements.push(line.trim());
    }
    if (pending) throw new Error('Incomplete migration');
    for (const statement of statements) await db.exec(statement);
  }
  for (const [role, name] of [
    ['administracion', 'Administrador'],
    ['vendedor', 'Carlos'],
    ['second', 'María'],
    ['preparacion', 'Preparación'],
    ['supervision', 'Supervisión'],
  ])
    await createUser(role, name);
  client = (
    await request(
      '/api/v1/clients',
      'administracion',
      'POST',
      baseClient('Burger Point', users.vendedor.id),
    )
  ).body;
  otherClient = (
    await request(
      '/api/v1/clients',
      'administracion',
      'POST',
      baseClient('Cliente ajeno', users.second.id),
    )
  ).body;
  incomplete = (
    await request('/api/v1/clients', 'administracion', 'POST', {
      ...baseClient('Cliente incompleto', users.vendedor.id),
      geo: null,
      phone: '',
      address: '',
    })
  ).body;
  product = (
    await request('/api/v1/products', 'administracion', 'POST', {
      sku: 'BRI',
      name: 'Pan Brioche',
      priceUsd: '0.55',
      active: true,
    })
  ).body;
  expect(client.id).toBeTruthy();
  expect(product.id).toBeTruthy();
});
afterAll(async () => {
  await mf?.dispose();
});

describe('Autenticación y permisos', () => {
  it('requiere sesión y deshabilita registro público', async () => {
    expect((await request('/api/v1/clients', 'none')).status).toBe(401);
    expect(
      (
        await request('/api/auth/sign-up/email', 'none', 'POST', {
          email: 'x@example.invalid',
          password: 'abcdefghijk',
          name: 'x',
        })
      ).status,
    ).toBe(404);
  });
  it('valida el origen de las escrituras', async () => {
    expect(
      (
        await request(
          '/api/v1/products',
          'administracion',
          'POST',
          { sku: 'BAD', name: 'Producto', priceUsd: '1', active: true },
          { Origin: 'https://otro.invalid' },
        )
      ).status,
    ).toBe(403);
  });
  it('limita módulo y mutaciones por los cuatro roles', async () => {
    for (const r of ['vendedor', 'preparacion', 'supervision'])
      expect((await request('/api/v1/users', r)).status).toBe(403);
    expect((await request('/api/v1/clients', 'preparacion')).status).toBe(403);
    expect((await request('/api/v1/clients', 'supervision')).status).toBe(200);
    expect(
      (
        await request('/api/v1/products', 'supervision', 'POST', {
          sku: 'x',
          name: 'Producto',
          priceUsd: '1',
        })
      ).status,
    ).toBe(403);
  });
  it('oculta clientes ajenos y bloquea completar sus datos', async () => {
    expect((await request('/api/v1/clients/' + otherClient.id, 'vendedor')).status).toBe(404);
    expect(
      (
        await request(
          '/api/v1/clients/' + otherClient.id + '/completion',
          'vendedor',
          'PATCH',
          baseClient('Otro', users.second.id),
        )
      ).status,
    ).toBe(404);
    const list = await request('/api/v1/clients', 'vendedor');
    expect(list.body.items.every((c: any) => c.sellerId === users.vendedor.id)).toBe(true);
  });
  it('exige cambiar contraseña inicial', async () => {
    await db.prepare('UPDATE user SET mustChangePassword=1 WHERE id=?').bind(users.second.id).run();
    expect((await request('/api/v1/orders', 'second')).body.error.code).toBe(
      'PASSWORD_CHANGE_REQUIRED',
    );
    expect((await request('/api/v1/me', 'second')).status).toBe(200);
    await db.prepare('UPDATE user SET mustChangePassword=0 WHERE id=?').bind(users.second.id).run();
  });
  it('no expone administración de Better Auth directamente', async () => {
    expect(
      (await request('/api/auth/admin/create-user', 'vendedor', 'POST', { name: 'x' })).status,
    ).toBe(404);
  });
});
describe('Clientes y GPS', () => {
  it('busca por nombre, código y RIF', async () => {
    for (const q of ['Burger', client.code, client.rif]) {
      const r = await request('/api/v1/clients?q=' + encodeURIComponent(q), 'vendedor');
      expect(r.status).toBe(200);
      expect(
        r.body.items.some((c: any) => c.id === client.id),
        q,
      ).toBe(true);
    }
  });
  it('rechaza coordenadas inválidas y GPS sin confirmar', async () => {
    for (const geo of [
      {
        latitude: 100,
        longitude: 0,
        accuracy: 1,
        capturedAt: new Date().toISOString(),
        confirmed: true,
      },
      {
        latitude: 7,
        longitude: -72,
        accuracy: 1,
        capturedAt: new Date().toISOString(),
        confirmed: false,
      },
    ])
      expect(
        (
          await request('/api/v1/clients/' + incomplete.id + '/completion', 'vendedor', 'PATCH', {
            ...incomplete,
            geo,
            phone: '000000',
            address: 'Dirección',
          })
        ).status,
      ).toBe(422);
  });
  it('bloquea pedidos con datos incompletos y permite guardar la ficha', async () => {
    const q = await request('/api/v1/orders/quote', 'vendedor', 'POST', {
      clientId: incomplete.id,
      currency: 'USD',
      items: [{ productId: product.id, quantity: 2 }],
    });
    expect(q.body.error.code).toBe('CLIENT_INCOMPLETE');
    const saved = await request(
      '/api/v1/clients/' + incomplete.id + '/completion',
      'vendedor',
      'PATCH',
      { ...baseClient(incomplete.name, users.vendedor.id), rif: incomplete.rif },
    );
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.geo.confirmed).toBe(true);
    expect(saved.body.geoUpdatedBy).toBe(users.vendedor.id);
    expect(
      (
        await request('/api/v1/orders/quote', 'vendedor', 'POST', {
          clientId: incomplete.id,
          currency: 'USD',
          items: [{ productId: product.id, quantity: 2 }],
        })
      ).status,
    ).toBe(200);
  });
});
describe('Precios, pedidos y preparación', () => {
  const input = () => ({
    clientId: client.id,
    currency: 'COP',
    items: [{ productId: product.id, quantity: 3 }],
  });
  let saved: any, key: string;
  it('usa redondeo decimal por precio unitario', () => {
    const line = calculateLine({ id: 'p', name: 'p', sku: 'p', priceUsd: '0.10' }, 3, '1.05');
    expect(line.unitPrice).toBe('0.11');
    expect(line.subtotal).toBe('0.33');
  });
  it('requiere tasa para monedas convertidas', async () => {
    expect(
      (await request('/api/v1/orders/quote', 'vendedor', 'POST', input())).body.error.code,
    ).toBe('RATE_MISSING');
    for (const [currency, rate] of [
      ['COP', '4200.123456'],
      ['VES', '120.50'],
    ])
      expect(
        (await request('/api/v1/rates', 'administracion', 'POST', { currency, rate })).status,
      ).toBe(201);
  });
  it('calcula las tres monedas y rechaza cantidades o productos repetidos', async () => {
    for (const currency of ['USD', 'COP', 'VES']) {
      const r = await request('/api/v1/orders/quote', 'vendedor', 'POST', { ...input(), currency });
      expect(r.status).toBe(200);
      expect(r.body.totalUsd).toBe('1.65');
    }
    expect(
      (
        await request('/api/v1/orders/quote', 'vendedor', 'POST', {
          ...input(),
          items: [{ productId: product.id, quantity: 0 }],
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request('/api/v1/orders/quote', 'vendedor', 'POST', {
          ...input(),
          items: [
            { productId: product.id, quantity: 2 },
            { productId: product.id, quantity: 2 },
          ],
        })
      ).status,
    ).toBe(422);
  });
  it('registra con partidas y no crea comanda todavía', async () => {
    const q = (await request('/api/v1/orders/quote', 'vendedor', 'POST', input())).body;
    key = randomUUID();
    const r = await request(
      '/api/v1/orders',
      'vendedor',
      'POST',
      { ...input(), quoteVersion: q.version, notes: 'Prueba' },
      { 'Idempotency-Key': key },
    );
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    saved = r.body;
    expect(saved.total).toBe('6930.21');
    const count = await db
      .prepare('SELECT count(*) n FROM commands WHERE order_id=?')
      .bind(saved.id)
      .first<any>();
    expect(count.n).toBe(0);
  });
  it('un reintento idéntico no duplica; otra carga con la misma clave se rechaza', async () => {
    const q = (await request('/api/v1/orders/quote', 'vendedor', 'POST', input())).body;
    const r = await request(
      '/api/v1/orders',
      'vendedor',
      'POST',
      { ...input(), quoteVersion: q.version, notes: 'Prueba' },
      { 'Idempotency-Key': key },
    );
    expect(r.body.id).toBe(saved.id);
    expect(
      (
        await request(
          '/api/v1/orders',
          'vendedor',
          'POST',
          { ...input(), quoteVersion: q.version, notes: 'Diferente' },
          { 'Idempotency-Key': key },
        )
      ).status,
    ).toBe(409);
  });
  it('conserva tasa y precios históricos, y exige revisar un resumen obsoleto', async () => {
    const q = (await request('/api/v1/orders/quote', 'vendedor', 'POST', input())).body;
    await request('/api/v1/rates', 'administracion', 'POST', { currency: 'COP', rate: '4300' });
    await request('/api/v1/products/' + product.id, 'administracion', 'PATCH', {
      sku: 'BRI',
      name: 'Pan Brioche',
      priceUsd: '0.60',
      active: true,
    });
    const history = await request('/api/v1/orders/' + saved.id, 'vendedor');
    expect(history.body.total).toBe('6930.21');
    expect(history.body.items[0].priceUsd).toBe('0.55');
    expect(
      (
        await request(
          '/api/v1/orders',
          'vendedor',
          'POST',
          { ...input(), quoteVersion: q.version, notes: '' },
          { 'Idempotency-Key': randomUUID() },
        )
      ).body.error.code,
    ).toBe('QUOTE_CHANGED');
  });
  it('solo Administración valida y genera una comanda única', async () => {
    expect(
      (await request('/api/v1/orders/' + saved.id + '/validate', 'vendedor', 'POST')).status,
    ).toBe(403);
    expect(
      (await request('/api/v1/orders/' + saved.id + '/validate', 'administracion', 'POST')).status,
    ).toBe(200);
    expect(
      (await request('/api/v1/orders/' + saved.id + '/validate', 'administracion', 'POST')).status,
    ).toBe(409);
    const count = await db
      .prepare('SELECT count(*) n FROM commands WHERE order_id=?')
      .bind(saved.id)
      .first<any>();
    expect(count.n).toBe(1);
  });
  it('preparación avanza sin consultar importes y evita anular después de empezar', async () => {
    const list = await request('/api/v1/commands', 'preparacion'),
      command = list.body.items.find((k: any) => k.number === saved.number);
    expect(command).toBeTruthy();
    expect(command.total).toBeUndefined();
    expect(
      (await request('/api/v1/commands/' + command.id + '/advance', 'supervision', 'POST')).status,
    ).toBe(403);
    expect(
      (await request('/api/v1/commands/' + command.id + '/advance', 'preparacion', 'POST')).body
        .status,
    ).toBe('en_preparacion');
    expect(
      (await request('/api/v1/orders/' + saved.id + '/cancel', 'administracion', 'POST')).status,
    ).toBe(409);
    expect(
      (await request('/api/v1/commands/' + command.id + '/advance', 'preparacion', 'POST')).body
        .status,
    ).toBe('listo');
    expect(
      (await request('/api/v1/commands/' + command.id + '/advance', 'preparacion', 'POST')).status,
    ).toBe(409);
  });
  it('no permite al vendedor leer pedidos de otro autor', async () => {
    const q = (
      await request('/api/v1/orders/quote', 'administracion', 'POST', {
        ...input(),
        currency: 'USD',
      })
    ).body;
    const r = await request(
      '/api/v1/orders',
      'administracion',
      'POST',
      { ...input(), currency: 'USD', quoteVersion: q.version, notes: '' },
      { 'Idempotency-Key': randomUUID() },
    );
    expect((await request('/api/v1/orders/' + r.body.id, 'vendedor')).status).toBe(404);
  });
  it('concurrencia de reintentos conserva un único pedido', async () => {
    const q = (
      await request('/api/v1/orders/quote', 'vendedor', 'POST', { ...input(), currency: 'USD' })
    ).body;
    const id = randomUUID();
    const data = { ...input(), currency: 'USD', quoteVersion: q.version, notes: 'Concurrente' };
    const rs = await Promise.all([
      request('/api/v1/orders', 'vendedor', 'POST', data, { 'Idempotency-Key': id }),
      request('/api/v1/orders', 'vendedor', 'POST', data, { 'Idempotency-Key': id }),
    ]);
    expect(
      rs.every((r) => [200, 201].includes(r.status)),
      JSON.stringify(rs.map((r) => r.body)),
    ).toBe(true);
    expect(rs[0].body.id).toBe(rs[1].body.id);
  });
});
describe('Rutas, visitas, reportes e integración', () => {
  it('respeta horarios y recurrencia en Caracas', () => {
    expect(visitFits(client, '2026-11-02T13:00:00Z')).toBe(true);
    expect(visitFits(client, '2026-11-02T02:00:00Z')).toBe(false);
    expect(
      visitFits(
        { ...client, recurrence: 'quincenal', recurrenceStart: '2026-11-02' },
        '2026-11-09T13:00:00Z',
      ),
    ).toBe(false);
  });
  it('crea ruta ordenada y rechaza clientes ajenos a su vendedor', async () => {
    const body = {
      name: 'Ruta de prueba',
      sellerId: users.vendedor.id,
      date: '2026-11-03',
      stops: [
        { clientId: client.id, time: '09:00' },
        { clientId: incomplete.id, time: '10:00' },
      ],
    };
    expect(
      (
        await request('/api/v1/routes', 'administracion', 'POST', {
          ...body,
          stops: [{ clientId: otherClient.id, time: '09:00' }],
        })
      ).status,
    ).toBe(422);
    const route = await request('/api/v1/routes', 'administracion', 'POST', body);
    expect(route.status).toBe(201);
    const list = await request('/api/v1/routes', 'vendedor');
    expect(
      list.body.items.find((r: any) => r.id === route.body.id).stops.map((s: any) => s.clientId),
    ).toEqual([client.id, incomplete.id]);
  });
  it('visita sin pedido programa seguimiento y no se registra dos veces', async () => {
    const visit = await request('/api/v1/visits', 'vendedor', 'POST', {
      clientId: client.id,
      scheduledAt: '2030-11-05T13:00:00Z',
    });
    expect(visit.status).toBe(201);
    const result = {
      result: 'sin_pedido',
      notes: 'Negocio sin requerimiento',
      nextAt: '2030-11-12T13:00:00Z',
    };
    expect(
      (await request('/api/v1/visits/' + visit.body.id + '/result', 'vendedor', 'POST', result))
        .status,
    ).toBe(200);
    expect(
      (await request('/api/v1/visits/' + visit.body.id + '/result', 'vendedor', 'POST', result))
        .status,
    ).toBe(409);
    const next = await db
      .prepare('SELECT count(*) n FROM visits WHERE client_id=? AND scheduled_at=?')
      .bind(client.id, result.nextAt)
      .first<any>();
    expect(next.n).toBe(1);
  });
  it('edita paradas pendientes y conserva una ruta con visitas realizadas', async () => {
    const body = {
      name: 'Ruta editable',
      sellerId: users.vendedor.id,
      date: '2030-11-06',
      stops: [{ clientId: client.id, time: '09:00' }],
    };
    const route = await request('/api/v1/routes', 'administracion', 'POST', body);
    expect(route.status).toBe(201);
    const edited = {
      ...body,
      name: 'Ruta corregida',
      stops: [
        { clientId: incomplete.id, time: '10:00' },
        { clientId: client.id, time: '11:00' },
      ],
    };
    expect(
      (await request('/api/v1/routes/' + route.body.id, 'vendedor', 'PATCH', edited)).status,
    ).toBe(403);
    expect(
      (await request('/api/v1/routes/' + route.body.id, 'administracion', 'PATCH', edited)).status,
    ).toBe(200);
    const stops = await db
      .prepare('SELECT id,client_id FROM visits WHERE route_id=? ORDER BY route_position')
      .bind(route.body.id)
      .all<any>();
    expect(stops.results.map((v) => v.client_id)).toEqual([incomplete.id, client.id]);
    expect(
      (
        await request('/api/v1/visits/' + stops.results[0].id + '/result', 'vendedor', 'POST', {
          result: 'sin_pedido',
          notes: 'Realizada',
        })
      ).status,
    ).toBe(200);
    expect(
      (await request('/api/v1/routes/' + route.body.id, 'administracion', 'PATCH', body)).status,
    ).toBe(409);
    const kept = await db
      .prepare('SELECT name FROM routes WHERE id=?')
      .bind(route.body.id)
      .first<any>();
    expect(kept.name).toBe('Ruta corregida');
    expect(
      (
        await db
          .prepare('SELECT count(*) n FROM visits WHERE route_id=?')
          .bind(route.body.id)
          .first<any>()
      ).n,
    ).toBe(2);
  });
  it('dos resultados simultáneos no duplican la próxima visita', async () => {
    const scheduledAt = '2030-11-07T14:00:00Z',
      nextAt = '2030-11-14T14:00:00Z';
    const visit = await request('/api/v1/visits', 'vendedor', 'POST', {
      clientId: client.id,
      scheduledAt,
    });
    expect(visit.status).toBe(201);
    const rs = await Promise.all([
      request('/api/v1/visits/' + visit.body.id + '/result', 'vendedor', 'POST', {
        result: 'sin_pedido',
        notes: 'Seguimiento',
        nextAt,
      }),
      request('/api/v1/visits/' + visit.body.id + '/result', 'vendedor', 'POST', {
        result: 'sin_pedido',
        notes: 'Seguimiento',
        nextAt,
      }),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (
        await db
          .prepare('SELECT count(*) n FROM visits WHERE client_id=? AND scheduled_at=?')
          .bind(client.id, nextAt)
          .first<any>()
      ).n,
    ).toBe(1);
  });
  it('a2 no devuelve saldos ni confirmaciones ficticios', async () => {
    expect((await request('/api/v1/integration/a2')).body.configured).toBe(false);
    const account = await request('/api/v1/clients/' + client.id + '/account', 'vendedor');
    expect(account.status).toBe(503);
    expect(account.body.error.code).toBe('A2_NOT_CONFIGURED');
    expect(
      (await request('/api/v1/clients/' + otherClient.id + '/account', 'vendedor')).status,
    ).toBe(404);
  });
  it('reportes separan monedas y están restringidos', async () => {
    const path = '/api/v1/reports?from=2026-01-01&to=2031-01-01';
    expect((await request(path, 'vendedor')).status).toBe(403);
    const r = await request(path, 'supervision');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.totals)).toBe(true);
    expect(typeof r.body.totalUsd).toBe('string');
  });
  it('desactivar cuenta revoca todas sus sesiones', async () => {
    const u = users.second;
    expect(
      (
        await request('/api/v1/users/' + u.id, 'administracion', 'PATCH', {
          name: 'María',
          email: 'second@briochett.invalid',
          role: 'vendedor',
          active: false,
        })
      ).status,
    ).toBe(200);
    expect((await request('/api/v1/me', 'second')).status).toBe(401);
  });
});

it('busca y pagina 10.000 clientes sin exponer otra asignación', async () => {
  for (let i = 0; i < 10000; i += 100) {
    const statements = Array.from({ length: 100 }, (_, j) => {
      const n = i + j;
      return db
        .prepare(
          'INSERT INTO clients(id,code,name,seller_id,recurrence_start,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
        )
        .bind(
          'mass-' + n,
          'MASS-' + String(n).padStart(5, '0'),
          'Negocio ' + String(n).padStart(5, '0'),
          n % 2 ? users.vendedor.id : users.second.id,
          '2026-01-01',
          new Date().toISOString(),
          new Date().toISOString(),
        );
    });
    await db.batch(statements);
  }
  const started = performance.now();
  const first = await request('/api/v1/clients?q=Negocio', 'vendedor'),
    second = await request('/api/v1/clients?q=Negocio&page=2', 'vendedor');
  expect(first.body.total).toBe(5000);
  expect(first.body.items).toHaveLength(20);
  expect(second.body.items).toHaveLength(20);
  expect(new Set([...first.body.items, ...second.body.items].map((c: any) => c.id)).size).toBe(40);
  expect(first.body.items.every((c: any) => c.sellerId === users.vendedor.id)).toBe(true);
  expect(performance.now() - started).toBeLessThan(3000);
  const exact = await request('/api/v1/clients?q=MASS-09999', 'vendedor');
  expect(exact.body.items[0].id).toBe('mass-9999');
}, 120000);
