import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import app from '../apps/api/src/index';
import { cleanupPhotos } from '../apps/api/src/composition';
import { createAuth } from '../apps/api/src/infrastructure/auth/better-auth';
import { calculateLine } from '../apps/api/src/domain/pricing';
import { visitFits } from '../apps/api/src/domain/scheduling';
import type { Bindings } from '../apps/api/src/config/bindings';
import { randomUUID } from 'node:crypto';

let mf: Miniflare, env: Bindings, db: D1Database;
const cookies: Record<string, string> = {},
  users: Record<string, any> = {};
let zoneId: string;
let client: any, otherClient: any, incomplete: any, product: any;
async function request(
  path: string,
  role = 'administracion',
  method = 'GET',
  data?: unknown,
  extra: Record<string, string> = {},
) {
  const multipart = data instanceof FormData;
  const r = await app.request(
    'http://localhost:8787' + path,
    {
      method,
      headers: {
        Origin: env.FRONTEND_ORIGIN,
        ...(cookies[role] ? { Cookie: cookies[role] } : {}),
        ...(data && !multipart ? { 'Content-Type': 'application/json' } : {}),
        ...extra,
      },
      ...(data ? { body: multipart ? data : JSON.stringify(data) } : {}),
    },
    env,
  );
  const body =
    r.headers.get('Content-Type') === 'image/webp'
      ? Buffer.from(await r.arrayBuffer())
      : await r.json().catch(() => null);
  return { status: r.status, body, response: r };
}
async function createUser(
  role: string,
  name: string,
  accountRole = role === 'second' ? 'vendedor' : role,
) {
  const result = await createAuth(env).api.createUser({
    body: {
      name,
      email: role + '@briochett.invalid',
      password: 'Initial-dev-2026!',
      role: accountRole,
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
  zoneId,
  sellerId,
  active: true,
  geo: {
    latitude: 7.77,
    longitude: -72.22,
    accuracy: 12,
    capturedAt: new Date().toISOString(),
    confirmed: true,
  },
  visitDays: [0, 1, 2, 3, 4, 5, 6],
  recurrence: 'semanal',
  recurrenceStart: '2026-01-01',
});
async function oldZoneFixtures() {
  const at = '2026-05-01T13:00:00.000Z';
  await db
    .prepare(
      "INSERT INTO user(id,name,email,role,createdAt,updatedAt) VALUES('legacy-seller','Vendedor histórico','legacy@briochett.invalid','vendedor',0,0)",
    )
    .run();
  for (const [id, zone, slots] of [
    [
      'legacy-a',
      '  ÁREA   Norte  ',
      [
        { day: 1, start: '07:00', end: '08:00' },
        { day: 1, start: '12:00', end: '14:00' },
        { day: 3, start: '08:00', end: '17:00' },
      ],
    ],
    ['legacy-b', 'área norte', []],
    ['legacy-c', 'Sur histórico', [{ day: 1, start: '08:00', end: '16:00' }]],
    ['legacy-none', '', []],
  ] as const) {
    await db
      .prepare(
        "INSERT INTO clients(id,code,name,zone,seller_id,slots_json,recurrence,recurrence_start,created_at,updated_at) VALUES(?,?,?,?,'legacy-seller',?,'quincenal','2026-04-27',?,?)",
      )
      .bind(id, id, id, zone, JSON.stringify(slots), at, at)
      .run();
  }
  for (const id of ['legacy-same', 'legacy-mixed', 'legacy-unknown'])
    await db
      .prepare(
        "INSERT INTO routes(id,name,seller_id,date,created_by,created_at) VALUES(?,?,'legacy-seller','2026-05-01','legacy-seller',?)",
      )
      .bind(id, id, at)
      .run();
  for (const [id, route, client, time, status] of [
    ['legacy-v1', 'legacy-same', 'legacy-a', '2026-05-01T13:00:00.000Z', 'sin_pedido'],
    ['legacy-v2', 'legacy-same', 'legacy-b', '2026-05-01T14:00:00.000Z', 'programada'],
    ['legacy-v3', 'legacy-mixed', 'legacy-a', '2026-05-01T15:00:00.000Z', 'programada'],
    ['legacy-v4', 'legacy-mixed', 'legacy-c', '2026-05-01T16:00:00.000Z', 'programada'],
    ['legacy-v5', 'legacy-unknown', 'legacy-none', '2026-05-01T17:00:00.000Z', 'programada'],
  ])
    await db
      .prepare(
        "INSERT INTO visits(id,route_id,client_id,seller_id,scheduled_at,status,created_at) VALUES(?,?,?,'legacy-seller',?,?,?)",
      )
      .bind(id, route, client, time, status, at)
      .run();
}
async function legacyProductionFixtures() {
  const at = '2026-05-02T13:00:00.000Z';
  await db
    .prepare(
      "UPDATE clients SET rif='J-'||id,contact='Compras',phone='00000000',address='Ejemplo',geo_json='{}' WHERE seller_id='legacy-seller'",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO products(id,sku,name,price_usd,created_at,updated_at) VALUES('legacy-pan','LEGACY-PAN','Pan histórico','1.00',?,?)",
    )
    .bind(at, at)
    .run();
  for (const [id, customer, zone] of [
    ['legacy-report-a', 'legacy-a', '  ÁREA   Norte  '],
    ['legacy-report-b', 'legacy-b', 'área norte'],
    ['legacy-report-c', 'legacy-c', 'Zona anterior'],
    ['legacy-report-d', 'legacy-none', '   '],
  ]) {
    await db.batch([
      db
        .prepare(
          "INSERT INTO orders(id,client_id,author_id,currency,rate,total_minor,total_usd_minor,units,status,client_snapshot,idempotency_key,request_hash,created_at,updated_at) VALUES(?,?,'legacy-seller','USD','1',100,100,1,'validado',?,?,?,?,?)",
        )
        .bind(id, customer, JSON.stringify({ zone }), id, id, at, at),
      db
        .prepare(
          "INSERT INTO order_items(id,order_id,product_id,name,sku,quantity,price_usd,unit_minor,subtotal_minor) VALUES(?,?,'legacy-pan','Pan histórico','LEGACY-PAN',1,'1.00',100,100)",
        )
        .bind(id, id),
      db
        .prepare('INSERT INTO commands(id,order_id,created_at,updated_at) VALUES(?,?,?,?)')
        .bind(id, id, at, at),
    ]);
  }
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: '2026-10-30',
      d1Databases: ['DB'],
      r2Buckets: ['PHOTOS'],
    }),
  );
  db = (await mf.getD1Database('DB')) as unknown as D1Database;
  env = {
    DB: db,
    PHOTOS: (await mf.getR2Bucket('PHOTOS')) as unknown as R2Bucket,
    API_ORIGIN: 'http://localhost:8787',
    FRONTEND_ORIGIN: 'http://localhost:5173',
    BETTER_AUTH_SECRET: 'test-only-secret-not-for-production-2026-000000',
    BOOTSTRAP_TOKEN: 'test-only-bootstrap',
    ENVIRONMENT: 'test',
  };
  for (const file of [
    '0001_initial.sql',
    '0002_concurrency_guards.sql',
    '0003_recurring_routes.sql',
    '0004_route_series_guard.sql',
    '0005_soft_delete.sql',
    '0006_commercial_zones.sql',
    '0007_production_report.sql',
    '0008_record_photos.sql',
    '0009_catalog_import.sql',
    '0010_import_zone_classification.sql',
  ]) {
    if (file === '0006_commercial_zones.sql') await oldZoneFixtures();
    if (file === '0007_production_report.sql') await legacyProductionFixtures();
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
  zoneId = (await request('/api/v1/zones', 'administracion', 'POST', { name: 'Centro' })).body.id;
  expect(zoneId).toBeTruthy();
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
describe('Rutas recurrentes', () => {
  async function routeInput(name: string, sellerId = users.vendedor.id) {
    const customer = await request(
      '/api/v1/clients',
      'administracion',
      'POST',
      baseClient(name, sellerId),
    );
    expect(customer.status).toBe(201);
    return {
      name,
      sellerId,
      zoneId,
      date: '2027-01-04',
      stops: [{ clientId: customer.body.id, time: '09:00' }],
    };
  }
  it.each([
    {
      frequency: 'semanal',
      until: '2027-01-18',
      dates: ['2027-01-04', '2027-01-11', '2027-01-18'],
    },
    {
      frequency: 'quincenal',
      until: '2027-02-01',
      dates: ['2027-01-04', '2027-01-18', '2027-02-01'],
    },
    {
      frequency: 'mensual',
      until: '2027-03-31',
      dates: ['2027-01-04', '2027-02-01', '2027-03-01'],
    },
  ])(
    'crea recorridos $frequency con visitas independientes y paradas ordenadas',
    async ({ frequency, until, dates }) => {
      const input = await routeInput('Serie ' + frequency);
      const other = await routeInput('Segunda parada ' + frequency);
      input.stops.push({ clientId: other.stops[0].clientId, time: '10:00' });
      const created = await request('/api/v1/routes', 'administracion', 'POST', {
        ...input,
        recurrence: { frequency, until },
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      expect(created.body.dates).toEqual(dates);
      expect(created.body.occurrences).toBe(3);
      const list = await request('/api/v1/routes', 'vendedor');
      const series = list.body.items.filter(
        (route: any) => route.seriesId === created.body.seriesId,
      );
      expect(series).toHaveLength(3);
      for (const route of series) {
        expect(route.recurrence).toEqual({ frequency, until, startDate: input.date });
        expect(route.stops.map((stop: any) => [stop.clientId, stop.time, stop.status])).toEqual(
          input.stops.map((stop) => [stop.clientId, stop.time, 'programada']),
        );
      }
      expect(
        new Set(series.flatMap((route: any) => route.stops.map((stop: any) => stop.visitId))).size,
      ).toBe(6);
    },
  );
  it('convierte una ruta existente y permite editar una fecha sin cambiar las demás', async () => {
    const input = await routeInput('Convertir ruta');
    const one = await request('/api/v1/routes', 'administracion', 'POST', input);
    expect(one.status).toBe(201);
    const recurring = await request('/api/v1/routes/' + one.body.id, 'administracion', 'PATCH', {
      ...input,
      recurrence: { frequency: 'semanal', until: '2027-01-18' },
    });
    expect(recurring.status).toBe(200);
    await expect(
      db.prepare('UPDATE routes SET series_id=NULL WHERE id=?').bind(one.body.id).run(),
    ).rejects.toThrow(/ROUTE_SERIES_CHANGED/);
    const series = (await request('/api/v1/routes', 'vendedor')).body.items.filter(
      (route: any) => route.seriesId === one.body.id,
    );
    const middle = series.find((route: any) => route.date === '2027-01-11');
    const edited = await request('/api/v1/routes/' + middle.id, 'administracion', 'PATCH', {
      ...input,
      name: 'Excepción de una fecha',
      date: middle.date,
      stops: [{ ...input.stops[0], time: '11:00' }],
    });
    expect(edited.status).toBe(200);
    const updated = (await request('/api/v1/routes', 'vendedor')).body.items.filter(
      (route: any) => route.seriesId === one.body.id,
    );
    expect(updated).toHaveLength(3);
    expect(updated.find((route: any) => route.date === middle.date).stops[0].time).toBe('11:00');
    expect(
      updated
        .filter((route: any) => route.date !== middle.date)
        .every((route: any) => route.stops[0].time === '09:00'),
    ).toBe(true);
    const stop = updated.find((route: any) => route.date === middle.date).stops[0];
    expect(
      (
        await request('/api/v1/visits/' + stop.visitId + '/result', 'vendedor', 'POST', {
          result: 'sin_pedido',
          notes: 'Visita registrada',
          nextAt: null,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request('/api/v1/routes/' + middle.id, 'administracion', 'PATCH', {
          ...input,
          date: middle.date,
        })
      ).status,
    ).toBe(409);
  });
  it('rechaza toda la serie si un cliente no está disponible en una fecha posterior', async () => {
    const input = await routeInput('Cliente quincenal');
    const id = input.stops[0].clientId;
    const customer = (await request('/api/v1/clients/' + id)).body;
    expect(
      (
        await request('/api/v1/clients/' + id, 'administracion', 'PATCH', {
          ...customer,
          recurrence: 'quincenal',
          recurrenceStart: input.date,
        })
      ).status,
    ).toBe(200);
    const rejected = await request('/api/v1/routes', 'administracion', 'POST', {
      ...input,
      recurrence: { frequency: 'semanal', until: '2027-01-18' },
    });
    expect(rejected.status).toBe(422);
    expect(rejected.body.error.message).toContain('2027-01-11');
    expect(
      (
        await db
          .prepare('SELECT count(*) total FROM visits WHERE client_id=?')
          .bind(id)
          .first<{ total: number }>()
      )?.total,
    ).toBe(0);
    expect(
      (
        await db
          .prepare('SELECT count(*) total FROM routes WHERE name=?')
          .bind(input.name)
          .first<{ total: number }>()
      )?.total,
    ).toBe(0);
  });
  it('revierte todas las fechas si una visita ya existe y evita duplicados en reintentos concurrentes', async () => {
    const input = await routeInput('Colisión de serie');
    const body = { ...input, recurrence: { frequency: 'semanal', until: '2027-01-18' } };
    expect(
      (
        await request('/api/v1/visits', 'vendedor', 'POST', {
          clientId: input.stops[0].clientId,
          scheduledAt: '2027-01-11T13:00:00Z',
        })
      ).status,
    ).toBe(201);
    expect((await request('/api/v1/routes', 'administracion', 'POST', body)).status).toBe(409);
    expect(
      (
        await db
          .prepare('SELECT count(*) total FROM routes WHERE name=?')
          .bind(input.name)
          .first<{ total: number }>()
      )?.total,
    ).toBe(0);
    const unique = await routeInput('Reintento de serie');
    const retryBody = { ...unique, recurrence: body.recurrence };
    const results = await Promise.all([
      request('/api/v1/routes', 'administracion', 'POST', retryBody),
      request('/api/v1/routes', 'administracion', 'POST', retryBody),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(
      (
        await db
          .prepare('SELECT count(*) total FROM routes WHERE name=?')
          .bind(unique.name)
          .first<{ total: number }>()
      )?.total,
    ).toBe(3);
    expect(
      (
        await db
          .prepare('SELECT count(*) total FROM visits WHERE client_id=?')
          .bind(unique.stops[0].clientId)
          .first<{ total: number }>()
      )?.total,
    ).toBe(3);
  });
  it('detecta visitas existentes aunque la fecha esté guardada sin milisegundos', async () => {
    const input = await routeInput('Fecha histórica');
    await db
      .prepare(
        'INSERT INTO visits(id,client_id,seller_id,scheduled_at,created_at) VALUES(?,?,?,?,?)',
      )
      .bind(
        randomUUID(),
        input.stops[0].clientId,
        input.sellerId,
        '2027-01-04T13:00:00Z',
        new Date().toISOString(),
      )
      .run();
    const duplicate = await request('/api/v1/visits', 'vendedor', 'POST', {
      clientId: input.stops[0].clientId,
      scheduledAt: '2027-01-04T13:00:00.000Z',
    });
    expect(duplicate.status).toBe(409);
    expect(
      (
        await db
          .prepare('SELECT count(*) total FROM visits WHERE client_id=?')
          .bind(input.stops[0].clientId)
          .first<{ total: number }>()
      )?.total,
    ).toBe(1);
  });
  it('reserva la creación y conversión para administración y restringe las rutas por vendedor', async () => {
    const input = await routeInput('Serie de otro vendedor', users.second.id);
    const body = { ...input, recurrence: { frequency: 'quincenal', until: '2027-01-18' } };
    const saved = await request('/api/v1/routes', 'administracion', 'POST', body);
    expect(saved.status).toBe(201);
    for (const role of ['vendedor', 'preparacion', 'supervision']) {
      expect((await request('/api/v1/routes', role, 'POST', body)).status).toBe(403);
      expect((await request('/api/v1/routes/' + saved.body.id, role, 'PATCH', input)).status).toBe(
        403,
      );
    }
    const seller = await request('/api/v1/routes', 'vendedor');
    expect(seller.body.items.some((route: any) => route.seriesId === saved.body.seriesId)).toBe(
      false,
    );
    expect((await request('/api/v1/routes', 'supervision')).status).toBe(200);
  });
});

describe('Rutas, visitas, reportes e integración', () => {
  it('guarda cualquier horario y permite visitas al final del día seleccionado', async () => {
    const created = await request('/api/v1/clients', 'administracion', 'POST', {
      ...baseClient('Disponibilidad de día completo', users.vendedor.id),
      visitDays: [1],
    });
    expect(created.status).toBe(201);
    const saved = await request('/api/v1/clients/' + created.body.id, 'vendedor');
    expect(saved.body.visitDays).toEqual([1]);
    expect(saved.body.slots).toBeUndefined();
    const schedule = (at: string) =>
      request('/api/v1/visits', 'vendedor', 'POST', {
        clientId: created.body.id,
        scheduledAt: at,
      });
    expect((await schedule('2026-11-03T03:59:00Z')).status).toBe(201);
    expect((await schedule('2026-11-03T04:00:00Z')).status).toBe(422);
  });
  it('respeta los días y la recurrencia en Caracas', () => {
    expect(visitFits(client, '2026-11-02T13:00:00Z')).toBe(true);
    expect(visitFits({ ...client, visitDays: [1] }, '2026-11-02T02:00:00Z')).toBe(false);
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
      zoneId,
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
      .prepare(
        'SELECT count(*) n FROM visits WHERE client_id=? AND julianday(scheduled_at)=julianday(?)',
      )
      .bind(client.id, result.nextAt)
      .first<any>();
    expect(next.n).toBe(1);
  });
  it('edita paradas pendientes y conserva una ruta con visitas realizadas', async () => {
    const body = {
      name: 'Ruta editable',
      sellerId: users.vendedor.id,
      zoneId,
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
      .prepare(
        'SELECT id,client_id FROM visits WHERE route_id=? AND deleted_at IS NULL ORDER BY route_position',
      )
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
          .prepare('SELECT count(*) n FROM visits WHERE route_id=? AND deleted_at IS NULL')
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
          .prepare(
            'SELECT count(*) n FROM visits WHERE client_id=? AND julianday(scheduled_at)=julianday(?)',
          )
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
          'INSERT INTO clients(id,code,name,seller_id,zone_id,recurrence_start,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .bind(
          'mass-' + n,
          'MASS-' + String(n).padStart(5, '0'),
          'Negocio ' + String(n).padStart(5, '0'),
          n % 2 ? users.vendedor.id : users.second.id,
          zoneId,
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

describe('Papelera y borrado lógico', () => {
  const drop = (type: string, id: string, query = '', role = 'administracion') =>
    request(`/api/v1/${type}/${id}${query}`, role, 'DELETE');
  const restore = (type: string, id: string, role = 'administracion') =>
    request(`/api/v1/trash/${type}/${id}/restore`, role, 'POST');
  const trash = (query = '', role = 'administracion') => request('/api/v1/trash' + query, role);
  const post = (path: string, data: unknown) =>
    request('/api/v1/' + path, 'administracion', 'POST', data);
  const makeClient = async (name: string) => {
    const input = baseClient(name, users.vendedor.id);
    const result = await post('clients', input);
    expect(result.status).toBe(201);
    return { id: result.body.id as string, input };
  };
  const schedule = async (clientId: string, scheduledAt = '2028-11-06T13:00:00Z') => {
    const result = await post('visits', { clientId, scheduledAt });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return result.body.id as string;
  };
  const complete = (id: string) =>
    post(`visits/${id}/result`, { result: 'sin_pedido', notes: 'Realizada' });

  it('restringe papelera, eliminación y restauración a Administración y permite DELETE en el origen configurado', async () => {
    for (const role of ['vendedor', 'supervision', 'preparacion']) {
      expect((await trash('', role)).status).toBe(403);
      expect((await drop('products', product.id, '', role)).status).toBe(403);
      expect((await restore('products', product.id, role)).status).toBe(403);
    }
    expect((await trash('', 'none')).status).toBe(401);
    const cors = await request('/api/v1/products/' + product.id, 'none', 'OPTIONS', undefined, {
      'Access-Control-Request-Method': 'DELETE',
    });
    expect(cors.status).toBe(204);
    expect(cors.response.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
    expect((await trash('?type=invalid')).status).toBe(422);
  });

  it('oculta el cliente del buscador y del acceso directo, reserva el RIF y audita una sola vez', async () => {
    const { id, input } = await makeClient('Papelera Cliente Uno');
    const visit = await schedule(id);
    expect((await drop('clients', id)).body.error.code).toBe('TRASH_CLIENT_DEPENDENCIES');
    expect((await drop('users', users.vendedor.id)).body.error.code).toBe(
      'TRASH_USER_DEPENDENCIES',
    );
    expect((await drop('visits', visit)).status).toBe(200);
    const results = await Promise.all([drop('clients', id), drop('clients', id)]);
    expect(results.map((r) => r.body.affected).sort()).toEqual([0, 1]);
    expect((await request('/api/v1/clients/' + id)).status).toBe(404);
    expect((await request('/api/v1/clients?q=Papelera%20Cliente%20Uno')).body.total).toBe(0);
    expect(
      (await request('/api/v1/clients?q=Papelera%20Cliente%20Uno', 'vendedor')).body.total,
    ).toBe(0);
    expect((await post('clients', input)).status).toBe(409);
    expect((await restore('visits', visit)).status).toBe(409);
    const removed = await trash('?type=clients');
    expect(removed.body.items.find((row: any) => row.id === id)).toMatchObject({
      type: 'clients',
      label: input.name,
      deletedByName: 'Administrador',
    });
    expect((await trash()).body.items.some((row: any) => row.id === id)).toBe(true);
    expect((await restore('clients', id)).status).toBe(200);
    expect((await restore('visits', visit)).status).toBe(200);
    expect((await request('/api/v1/clients/' + id)).body.id).toBe(id);
    const history = await db
      .prepare('SELECT action FROM audit_log WHERE entity_id=? ORDER BY created_at')
      .bind(id)
      .all<{ action: string }>();
    expect(history.results.map((row) => row.action)).toEqual(['crear', 'eliminar', 'restaurar']);
  });

  it('revoca las sesiones, bloquea el acceso eliminado y conserva el último administrador', async () => {
    expect((await drop('users', users.administracion.id)).body.error.code).toBe('TRASH_SELF');
    await expect(
      db
        .prepare("UPDATE user SET deleted_at='2028-01-01T00:00:00Z',deleted_by=id WHERE id=?")
        .bind(users.administracion.id)
        .run(),
    ).rejects.toThrow(/LAST_ADMIN/);
    const id = users.supervision.id;
    expect((await drop('users', id)).status).toBe(200);
    expect((await request('/api/v1/me', 'supervision')).status).toBe(401);
    await db.prepare('DELETE FROM rateLimit').run();
    const creds = { username: 'supervision', password: 'Initial-dev-2026!' };
    expect((await request('/api/auth/sign-in/username', 'none', 'POST', creds)).status).toBe(403);
    expect(
      (
        await request(`/api/v1/users/${id}/password`, 'administracion', 'POST', {
          password: 'Long-test-password!',
        })
      ).status,
    ).toBe(404);
    expect((await restore('users', id)).status).toBe(200);
    expect((await request('/api/v1/me', 'supervision')).status).toBe(401);
    const fresh = await request('/api/auth/sign-in/username', 'none', 'POST', creds);
    expect(fresh.status).toBe(200);
    cookies.supervision = fresh.response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
  });

  it('mantiene partidas y tasas históricas, y al quitar la tasa vigente usa la anterior', async () => {
    const item = (
      await post('products', {
        name: 'Pan de prueba papelera',
        sku: 'PAPELERA',
        priceUsd: '2.00',
        active: true,
      })
    ).body;
    const first = (await post('rates', { currency: 'VES', rate: '100' })).body;
    const latest = (await post('rates', { currency: 'VES', rate: '125' })).body;
    const payload = {
      clientId: client.id,
      currency: 'VES',
      items: [{ productId: item.id, quantity: 1 }],
      notes: '',
    };
    const quote = (await post('orders/quote', payload)).body;
    expect(quote.rate).toBe('125');
    const created = await request(
      '/api/v1/orders',
      'administracion',
      'POST',
      { ...payload, quoteVersion: quote.version },
      { 'Idempotency-Key': randomUUID() },
    );
    expect(created.status).toBe(201);
    expect((await drop('rates', latest.id)).status).toBe(200);
    expect((await post('orders/quote', payload)).body.rate).toBe('100');
    expect((await drop('rates', first.id)).status).toBe(200);
    const remaining = (await request('/api/v1/rates')).body.items.filter(
      (r: any) => r.currency === 'VES',
    );
    for (const rate of remaining) expect((await drop('rates', rate.id)).status).toBe(200);
    expect((await post('orders/quote', payload)).body.error.code).toBe('RATE_MISSING');
    expect((await restore('rates', latest.id)).status).toBe(200);
    expect((await drop('products', item.id)).status).toBe(200);
    expect((await post('orders/quote', payload)).body.error.code).toBe('PRODUCT_UNAVAILABLE');
    const history = (await request('/api/v1/orders/' + created.body.id)).body;
    expect(history.rate).toBe('125');
    expect(history.total).toBe('250.00');
    expect(history.items[0].name).toBe(item.name);
    expect((await restore('products', item.id)).status).toBe(200);
    expect((await post('orders/quote', payload)).body.total).toBe('250.00');
  });

  it('envía a papelera solo pedidos anulados y mantiene la visita, la comanda y la clave del pedido', async () => {
    const { id } = await makeClient('Pedido asociado a visita');
    const visitId = await schedule(id);
    const payload = {
      clientId: id,
      currency: 'USD',
      items: [{ productId: product.id, quantity: 1 }],
      visitId,
      notes: '',
    };
    const quote = (await post('orders/quote', payload)).body;
    const headers = { 'Idempotency-Key': randomUUID() };
    const body = { ...payload, quoteVersion: quote.version };
    const created = await request('/api/v1/orders', 'administracion', 'POST', body, headers);
    expect(created.status).toBe(201);
    const orderId = created.body.id;
    expect((await drop('orders', orderId)).body.error.code).toBe('TRASH_ORDER_STATE');
    expect((await post(`orders/${orderId}/validate`, {})).status).toBe(200);
    expect((await post(`orders/${orderId}/cancel`, {})).status).toBe(200);
    expect((await drop('orders', orderId)).status).toBe(200);
    expect((await request('/api/v1/orders/' + orderId)).status).toBe(404);
    expect(
      (await request('/api/v1/orders', 'administracion', 'POST', body, headers)).body.error.code,
    ).toBe('ORDER_DELETED');
    expect((await request('/api/v1/visits/' + visitId)).body).toMatchObject({
      status: 'con_pedido',
      orderId,
      orderDeleted: true,
    });
    expect(
      await db.prepare('SELECT id FROM commands WHERE order_id=?').bind(orderId).first(),
    ).toBeTruthy();
    expect((await restore('orders', orderId)).status).toBe(200);
    expect((await request('/api/v1/orders/' + orderId)).body.status).toBe('anulado');
    expect((await request('/api/v1/visits/' + visitId)).body.orderDeleted).toBe(false);
  });

  async function makeSeries(name: string, stops: number) {
    const date = '2028-11-06';
    const clients = await Promise.all(
      Array.from({ length: stops }, (_, i) => makeClient(name + ' ' + i)),
    );
    const input = {
      name,
      date,
      sellerId: users.vendedor.id,
      zoneId,
      recurrence: { frequency: 'semanal', until: '2028-11-20' },
      stops: clients.map(({ id }, i) => ({ clientId: id, time: i ? '10:00' : '09:00' })),
    };
    const created = await post('routes', input);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id as string;
    const series = async () =>
      (await request('/api/v1/routes')).body.items
        .filter((r: any) => r.seriesId === id)
        .sort((a: any, b: any) => a.date.localeCompare(b.date));
    return { id, input, clients, series };
  }

  it('elimina una fecha o las siguientes pendientes y conserva recorridos realizados y paradas ya eliminadas', async () => {
    const { series } = await makeSeries('Serie para papelera', 2);
    const [first, middle, last] = await series();
    expect((await drop('visits', first.stops[1].visitId)).status).toBe(200);
    expect((await drop('visits', first.stops[0].visitId)).body.error.code).toBe('TRASH_LAST_STOP');
    expect((await complete(middle.stops[0].visitId)).status).toBe(200);
    expect((await drop('routes', middle.id)).body.error.code).toBe('ROUTE_STARTED');
    expect((await drop('routes', last.id)).body.affected).toBe(1);
    expect((await restore('routes', last.id)).status).toBe(200);
    expect((await drop('routes', first.id, '?scope=upcoming')).body.affected).toBe(2);
    expect((await series()).map((r: any) => r.id)).toEqual([middle.id]);
    expect((await trash('?type=visits')).body.items.map((v: any) => v.id)).not.toContain(
      first.stops[0].visitId,
    );
    expect((await restore('visits', first.stops[0].visitId)).status).toBe(409);
    expect((await restore('routes', first.id)).status).toBe(200);
    expect((await series())[0].stops.map((s: any) => s.visitId)).toEqual([first.stops[0].visitId]);
    expect((await restore('visits', first.stops[1].visitId)).status).toBe(200);
    expect((await series())[0].stops.map((s: any) => s.visitId)).toEqual(
      first.stops.map((s: any) => s.visitId),
    );
  });

  it('restaura un recorrido entero o ninguno si hay colisión o cambió la disponibilidad', async () => {
    const { id, clients, series } = await makeSeries('Conflicto de recuperación', 2);
    const [before] = await series();
    expect((await drop('routes', id)).status).toBe(200);
    const duplicate = await schedule(clients[1].id, '2028-11-06T14:00:00Z');
    const failed = await restore('routes', id);
    expect(failed.body.error.code).toBe('VISIT_DUPLICATE');
    expect((await request('/api/v1/visits/' + before.stops[0].visitId)).status).toBe(404);
    expect((await drop('visits', duplicate)).status).toBe(200);
    const { id: clientId, input } = clients[0];
    const update = (data: unknown) =>
      request('/api/v1/clients/' + clientId, 'administracion', 'PATCH', data);
    expect((await update({ ...input, visitDays: [] })).status).toBe(200);
    expect((await restore('routes', id)).body.error.code).toBe('TRASH_RESTORE_DEPENDENCY');
    expect((await update(input)).status).toBe(200);
    expect((await restore('routes', id)).status).toBe(200);
    expect((await series())[0].stops.map((s: any) => s.visitId)).toEqual(
      before.stops.map((s: any) => s.visitId),
    );
  });

  it('conserva la identidad de paradas sin cambios y archiva las que se reemplazan', async () => {
    const { id, input, series } = await makeSeries('Editar paradas para papelera', 2);
    const [original] = await series();
    const stops = [{ ...input.stops[1], time: '11:00' }, input.stops[0]];
    const edited = await request('/api/v1/routes/' + id, 'administracion', 'PATCH', {
      ...input,
      recurrence: null,
      stops,
    });
    expect(edited.status).toBe(200);
    const [current] = await series();
    expect(current.stops[1].visitId).toBe(original.stops[0].visitId);
    expect(current.stops[0].visitId).not.toBe(original.stops[1].visitId);
    expect(
      (await trash('?type=visits')).body.items.some((v: any) => v.id === original.stops[1].visitId),
    ).toBe(true);
    expect((await restore('visits', original.stops[1].visitId)).body.error.code).toBe(
      'TRASH_ROUTE_CLIENT',
    );
  });

  it('serializa el cierre y la eliminación de una visita sin modificar ambas versiones', async () => {
    const { id } = await makeClient('Concurrencia papelera');
    const visit = await schedule(id);
    const results = await Promise.all([drop('visits', visit), complete(visit)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const saved = await db
      .prepare('SELECT status,deleted_at FROM visits WHERE id=?')
      .bind(visit)
      .first<{ status: string; deleted_at: string | null }>();
    expect(saved?.deleted_at ? saved.status === 'programada' : saved?.status === 'sin_pedido').toBe(
      true,
    );
  });
});

describe('Zonas comerciales', () => {
  const call = (path: string, method = 'GET', payload?: unknown, role = 'administracion') =>
    request('/api/v1/' + path, role, method, payload);
  const newZone = async (name: string, active = true) => {
    const res = await call('zones', 'POST', { name, active });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.id as string;
  };
  const customer = async (name: string, zone = zoneId) => {
    const input = { ...baseClient(name, users.vendedor.id), zoneId: zone };
    const res = await call('clients', 'POST', input);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return { id: res.body.id as string, input };
  };
  async function route(name: string, date: string, ids: string[], zone = zoneId) {
    const input = {
      name,
      date,
      zoneId: zone,
      sellerId: users.vendedor.id,
      stops: ids.map((clientId, i) => ({ clientId, time: '0' + (i + 7) + ':00' })),
    };
    const res = await call('routes', 'POST', input);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const stops = (
      await db
        .prepare(
          'SELECT id,client_id clientId FROM visits WHERE route_id=? ORDER BY route_position',
        )
        .bind(res.body.id)
        .all<{ id: string; clientId: string }>()
    ).results;
    return { id: res.body.id as string, input, stops };
  }
  it('migra zonas en mayúsculas y con espacios, días únicos y rutas históricas', async () => {
    const a = (await call('clients/legacy-a')).body;
    const b = (await call('clients/legacy-b')).body;
    expect(a.zoneId).toBeTruthy();
    expect(b.zoneId).toBe(a.zoneId);
    expect(a.zone).toMatch(/^área norte$/i);
    expect(a.visitDays).toEqual([1, 3]);
    expect(a.recurrence).toBe('quincenal');
    expect(b.visitDays).toEqual([]);
    expect((await call('clients/legacy-none')).body.zoneId).toBeNull();
    const migrated = (
      await db
        .prepare("SELECT id,zone_id zoneId FROM routes WHERE id LIKE 'legacy-%' ORDER BY id")
        .all()
    ).results;
    expect(migrated).toEqual([
      { id: 'legacy-mixed', zoneId: null },
      { id: 'legacy-same', zoneId: a.zoneId },
      { id: 'legacy-unknown', zoneId: null },
    ]);
    expect((await call('visits/legacy-v1')).body).toMatchObject({
      status: 'sin_pedido',
      scheduledAt: '2026-05-01T13:00:00.000Z',
      routeId: 'legacy-same',
    });
  });
  it('restringe gestión a Administración, conserva nombres únicos y restaura desde Papelera', async () => {
    const id = await newZone('  Zona   de prueba  ');
    const unused = await newZone('Oculta para vendedores', false);
    expect((await call('zones', 'POST', { name: 'ZONA DE PRUEBA' })).body.error.code).toBe(
      'ZONE_NAME_EXISTS',
    );
    for (const role of ['vendedor', 'supervision', 'preparacion']) {
      expect((await call('zones', 'POST', { name: 'No permitido' }, role)).status).toBe(403);
      expect((await call('zones/' + id, 'PATCH', { name: 'No permitido' }, role)).status).toBe(403);
      expect((await call('zones/' + id, 'DELETE', undefined, role)).status).toBe(403);
    }
    expect((await call('zones?q=oculta', 'GET', undefined, 'vendedor')).body.items).toEqual([]);
    expect((await call('zones?q=oculta')).body.items.map((z: any) => z.id)).toEqual([unused]);
    expect((await call('zones/' + id, 'DELETE')).body.affected).toBe(1);
    expect((await call('trash?type=zones')).body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id, label: 'Zona de prueba' })]),
    );
    expect((await call('trash/zones/' + id + '/restore', 'POST')).status).toBe(200);
    const renamed = await call('zones/' + id, 'PATCH', { name: 'Restaurada', active: true });
    expect(renamed.body.name).toBe('Restaurada');
    expect(
      (await call('zones/' + zoneId, 'PATCH', { name: 'Centro', active: false })).body.error.code,
    ).toBe('ZONE_DEPENDENCIES');
    expect((await call('zones/' + zoneId, 'DELETE')).body.error.code).toBe('ZONE_DEPENDENCIES');
  });
  it('permite alta completa al vendedor y no permite alterar asignación ni agenda', async () => {
    const otherZone = await newZone('Alta Vendedor');
    const { name, rif, contact, phone, address, geo } = baseClient(
      'Alta exclusiva vendedor',
      users.vendedor.id,
    );
    const input = { name, rif, contact, phone, address, geo, zoneId: otherZone };
    for (const invalid of [
      { ...input, geo: null },
      { ...input, geo: { ...geo, confirmed: false } },
      { ...input, rif: '' },
      { ...input, zoneId: '' },
      { ...input, sellerId: users.second.id },
      { ...input, active: false },
      { ...input, visitDays: [] },
    ])
      expect((await call('clients', 'POST', invalid, 'vendedor')).status).toBe(422);
    for (const role of ['supervision', 'preparacion'])
      expect((await call('clients', 'POST', input, role)).status).toBe(403);
    const res = await call('clients', 'POST', input, 'vendedor');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({
      zoneId: otherZone,
      sellerId: users.vendedor.id,
      active: true,
      recurrence: 'semanal',
      visitDays: [1, 2, 3, 4, 5, 6, 0],
      geoUpdatedBy: users.vendedor.id,
    });
    expect(
      (await call('clients/' + res.body.id, 'PATCH', { ...res.body, zoneId }, 'vendedor')).status,
    ).toBe(403);
    expect(
      (
        await call(
          'clients/' + res.body.id + '/zone-impact?zoneId=' + zoneId,
          'GET',
          undefined,
          'vendedor',
        )
      ).status,
    ).toBe(403);
    const filtered = (
      await call(
        'clients?zoneId=' + otherZone + '&sellerId=' + users.second.id,
        'GET',
        undefined,
        'vendedor',
      )
    ).body;
    expect(filtered.items.map((c: any) => c.id)).toEqual([res.body.id]);
  });
  it('filtra clientes por zona y vendedor, protege las series y actualiza la búsqueda al renombrar', async () => {
    const south = await newZone('Sector Pradera');
    const a = await customer('En Pradera', south);
    const b = await customer('Fuera de Pradera');
    const r = await route('Ruta pradera', '2029-02-01', [a.id], south);
    expect(
      (await call('routes', 'POST', { ...r.input, stops: [{ clientId: b.id, time: '08:00' }] }))
        .body.error.code,
    ).toBe('ROUTE_ZONE');
    const allowed = (await call('clients?zoneId=' + south + '&sellerId=' + users.vendedor.id)).body;
    expect(allowed.items.map((c: any) => c.id)).toEqual([a.id]);
    const inactive = await customer('Cliente inactivo filtrado', south);
    expect(
      (await call('clients/' + inactive.id, 'PATCH', { ...inactive.input, active: false })).status,
    ).toBe(200);
    const query = 'clients?zoneId=' + south + '&sellerId=' + users.vendedor.id + '&q=inactivo';
    expect((await call(query)).body.items.map((c: any) => c.id)).toEqual([inactive.id]);
    expect((await call(query + '&active=true')).body.items).toEqual([]);
    expect((await call(query, 'GET', undefined, 'vendedor')).body.items).toEqual([]);
    expect(
      (await call('zones/' + south, 'PATCH', { name: 'Llanura Naciente', active: true })).status,
    ).toBe(200);
    expect((await call('clients?q=Llanura%20Naciente')).body.items.map((c: any) => c.id)).toEqual(
      expect.arrayContaining([a.id, inactive.id]),
    );
    const recurring = await call('routes', 'POST', {
      ...r.input,
      date: '2029-02-08',
      recurrence: { frequency: 'semanal', until: '2029-02-15' },
    });
    expect(recurring.status).toBe(201);
    const members = (await call('routes')).body.items.filter(
      (item: any) => item.seriesId === recurring.body.id,
    );
    expect(members.map((item: any) => item.zoneId)).toEqual([south, south]);
    expect(
      (
        await call('routes/' + recurring.body.id, 'PATCH', {
          ...r.input,
          zoneId,
          stops: [{ clientId: b.id, time: '08:00' }],
          date: '2029-02-08',
        })
      ).body.error.code,
    ).toBe('ROUTE_SERIES_ZONE');
  });
  it('exige la revisión vigente, conserva visitas independientes y realizadas y retira recorridos vacíos', async () => {
    const target = await newZone('Destino de traslado');
    const moving = await customer('Cliente que cambia de zona');
    const stays = await customer('Cliente que permanece');
    const alone = await route('Recorrido que queda vacío', '2029-04-02', [moving.id]);
    const shared = await route('Recorrido con historia', '2029-04-03', [moving.id, stays.id]);
    expect(
      (
        await call('visits/' + shared.stops[1].id + '/result', 'POST', {
          result: 'sin_pedido',
          notes: 'Realizada',
        })
      ).status,
    ).toBe(200);
    const independent = await call('visits', 'POST', {
      clientId: moving.id,
      scheduledAt: '2029-04-04T22:57:00Z',
    });
    expect(independent.status).toBe(201);
    const update = (revision?: string) =>
      call('clients/' + moving.id, 'PATCH', {
        ...moving.input,
        zoneId: target,
        zoneImpactRevision: revision,
      });
    const preview = () => call('clients/' + moving.id + '/zone-impact?zoneId=' + target);
    expect((await update()).body.error.code).toBe('ZONE_IMPACT_CHANGED');
    const first = (await preview()).body;
    expect(first.stops).toHaveLength(2);
    expect(first.stops.find((stop: any) => stop.routeId === alone.id).archivesRoute).toBe(1);
    expect((await call('clients/' + moving.id)).body.zoneId).toBe(zoneId);
    const concurrent = await route('Nueva parada antes de confirmar', '2029-04-05', [
      moving.id,
      stays.id,
    ]);
    expect((await update(first.revision)).body.error.code).toBe('ZONE_IMPACT_CHANGED');
    const latest = (await preview()).body;
    expect(latest.stops).toHaveLength(3);
    const moved = await update(latest.revision);
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body.zoneId).toBe(target);
    expect((await call('visits/' + independent.body.id)).status).toBe(200);
    expect((await call('visits/' + shared.stops[1].id)).body.status).toBe('sin_pedido');
    expect((await call('visits/' + shared.stops[0].id)).status).toBe(404);
    expect((await call('visits/' + concurrent.stops[0].id)).status).toBe(404);
    const deleted = (await call('trash?type=routes')).body.items;
    expect(deleted.some((entry: any) => entry.id === alone.id)).toBe(true);
    expect(deleted.some((entry: any) => entry.id === shared.id)).toBe(false);
    expect((await call('trash/routes/' + alone.id + '/restore', 'POST')).body.error.code).toBe(
      'ROUTE_ZONE',
    );
    expect(
      (await call('trash/visits/' + shared.stops[0].id + '/restore', 'POST')).body.error.code,
    ).toBe('ROUTE_ZONE');
    expect((await call('clients/' + moving.id, 'PATCH', moving.input)).status).toBe(200);
    expect((await call('trash/routes/' + alone.id + '/restore', 'POST')).status).toBe(200);
    expect((await call('visits/' + alone.stops[0].id)).status).toBe(200);
  });
});

describe('Totales de producción', () => {
  const path = '/api/v1/reports/production';
  const day = { from: '2027-02-09', to: '2027-02-09' };
  let north: string, south: string, seriesId: string, oldZone: string;
  let customer: { id: string; code: string }, second: { id: string };
  let conversion: { id: string }, direct: { id: string };
  let routes: { id: string; stops: { visitId: string }[] }[];
  const get = (params: Record<string, string> = day, role = 'administracion') =>
    request(path + '?' + new URLSearchParams(params), role);
  const options = (type: string, filters: Record<string, string> = day, role = 'preparacion') =>
    request(path + '/options?' + new URLSearchParams({ type, ...filters }), role);

  async function order(
    clientId: string,
    quantity: number,
    issued: string,
    extras: {
      visitId?: string;
      multi?: boolean;
      cancellation?: 'anulado' | 'eliminado';
      noCommand?: boolean;
    } = {},
  ) {
    const body = {
      clientId,
      items: [
        { productId: product.id, quantity },
        ...(extras.multi ? [{ productId: conversion.id, quantity: 4 }] : []),
      ],
      currency: 'USD',
      visitId: extras.visitId,
      notes: '',
    };
    const quote = await request('/api/v1/orders/quote', 'vendedor', 'POST', body);
    expect(quote.status, JSON.stringify(quote.body)).toBe(200);
    const created = await request(
      '/api/v1/orders',
      'vendedor',
      'POST',
      { ...body, quoteVersion: quote.body.version },
      { 'Idempotency-Key': randomUUID() },
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id: string = created.body.id;
    if (extras.noCommand) return { id };
    expect(
      (await request('/api/v1/orders/' + id + '/validate', 'administracion', 'POST')).status,
    ).toBe(200);
    await db.prepare('UPDATE commands SET created_at=? WHERE order_id=?').bind(issued, id).run();
    if (extras.cancellation) {
      expect(
        (await request('/api/v1/orders/' + id + '/cancel', 'administracion', 'POST')).status,
      ).toBe(200);
      if (extras.cancellation === 'eliminado')
        expect((await request('/api/v1/orders/' + id, 'administracion', 'DELETE')).status).toBe(
          200,
        );
    }
    return { id };
  }

  beforeAll(async () => {
    north = (
      await request('/api/v1/zones', 'administracion', 'POST', { name: 'Norte de fabricación' })
    ).body.id;
    south = (
      await request('/api/v1/zones', 'administracion', 'POST', { name: 'Sur de fabricación' })
    ).body.id;
    customer = (
      await request('/api/v1/clients', 'administracion', 'POST', {
        ...baseClient('Tienda Producción', users.vendedor.id),
        zoneId: north,
      })
    ).body;
    second = (
      await request('/api/v1/clients', 'administracion', 'POST', {
        ...baseClient('Taller Producción', users.vendedor.id),
        zoneId: south,
      })
    ).body;
    conversion = (
      await request('/api/v1/products', 'administracion', 'POST', {
        sku: 'PROD-02',
        name: 'Pan de producción',
        priceUsd: '0.50',
      })
    ).body;
    const series = await request('/api/v1/routes', 'administracion', 'POST', {
      name: 'Ruta fábrica',
      zoneId: north,
      sellerId: users.vendedor.id,
      date: '2027-02-07',
      stops: [{ clientId: customer.id, time: '13:00' }],
      recurrence: { frequency: 'semanal', until: '2027-02-14' },
    });
    expect(series.status).toBe(201);
    seriesId = series.body.seriesId;
    const occurrences = await db
      .prepare(
        'SELECT r.id,v.id visitId FROM routes r JOIN visits v ON v.route_id=r.id WHERE r.series_id=? ORDER BY r.date',
      )
      .bind(seriesId)
      .all<{ id: string; visitId: string }>();
    routes = occurrences.results.map(({ id, visitId }) => ({ id, stops: [{ visitId }] }));
    expect(routes).toHaveLength(2);
    await order(customer.id, 2, '2027-02-09T04:00:00.000Z', {
      visitId: routes[0].stops[0].visitId,
      multi: true,
    });
    const other = await order(customer.id, 3, '2027-02-10T03:59:59.999Z', {
      visitId: routes[1].stops[0].visitId,
    });
    const command = await db
      .prepare('SELECT id FROM commands WHERE order_id=?')
      .bind(other.id)
      .first<{ id: string }>();
    expect(
      (await request('/api/v1/commands/' + command?.id + '/advance', 'preparacion', 'POST')).status,
    ).toBe(200);

    const visit = await request('/api/v1/visits', 'vendedor', 'POST', {
      clientId: second.id,
      scheduledAt: '2027-02-10T10:00:00.000Z',
    });
    expect(visit.status).toBe(201);
    direct = await order(second.id, 7, '2027-02-09T14:00:00.000Z', { visitId: visit.body.id });
    await order(second.id, 8, '2027-02-09T03:59:59.999Z');
    await order(second.id, 9, '2027-02-10T04:00:00.000Z');
    await order(second.id, 30, '2027-02-09T16:00:00.000Z', { cancellation: 'anulado' });
    await order(second.id, 50, '2027-02-09T17:00:00.000Z', { cancellation: 'eliminado' });
    await order(second.id, 99, '2027-02-09T18:00:00.000Z', { noCommand: true });

    expect(
      (
        await request('/api/v1/clients/' + customer.id, 'administracion', 'PATCH', {
          ...baseClient('Tienda Producción', users.vendedor.id),
          zoneId: south,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request('/api/v1/zones/' + north, 'administracion', 'PATCH', {
          name: 'Norte renombrado',
          active: false,
        })
      ).status,
    ).toBe(200);
    expect(
      (await request('/api/v1/products/' + conversion.id, 'administracion', 'DELETE')).status,
    ).toBe(200);
    expect(
      (await request('/api/v1/clients/' + customer.id, 'administracion', 'DELETE')).status,
    ).toBe(200);
    const legacy = await db
      .prepare("SELECT zone_id id FROM clients WHERE id='legacy-a'")
      .first<{ id: string }>();
    oldZone = legacy!.id;
    expect(
      (
        await request('/api/v1/zones/' + oldZone, 'administracion', 'PATCH', {
          name: 'Zona renombrada de legado',
        })
      ).status,
    ).toBe(200);
  });

  it('totaliza partidas, cuenta comandas distintas y respeta el día de emisión en Caracas', async () => {
    const report = await get({}, 'preparacion');
    expect(report.status).toBe(200);
    expect(report.body.totals.units).toBeGreaterThan(16);
    const selected = await get();
    expect(selected).toMatchObject({
      status: 200,
      body: {
        totals: { units: 16, products: 2, commands: 3 },
        items: [
          { productId: product.id, units: 12, commands: 3 },
          { productId: conversion.id, units: 4, commands: 1 },
        ],
      },
    });
    expect((await get({ to: '2027-02-08' })).body.totals.units).toBeGreaterThanOrEqual(8);
    expect((await get({ from: '2027-02-10', clientId: second.id })).body.totals.units).toBe(9);
    expect((await get({ from: '2027-02-10', to: '2027-02-09' })).status).toBe(422);
    expect((await get({ from: '2027-02-30' })).status).toBe(422);
  });

  it('combina zona histórica, fecha de recorrido, serie, cliente y pedidos sin recorrido', async () => {
    const filters = { ...day, zone: 'zone:' + north, clientId: customer.id };
    expect((await get({ ...filters, route: 'route:' + routes[0].id })).body.totals.units).toBe(6);
    expect((await get({ ...filters, route: 'series:' + seriesId })).body.totals.units).toBe(9);
    expect(
      (await get({ ...day, zone: 'zone:' + south, route: 'none', clientId: second.id })).body.totals
        .units,
    ).toBe(7);
    expect((await get({ ...filters, zone: 'zone:' + south })).body).toEqual({
      totals: { units: 0, products: 0, commands: 0 },
      items: [],
    });
    expect((await options('zone')).body.items).toContainEqual({
      value: 'zone:' + north,
      label: 'Norte de fabricación',
    });
    const matching = await options('route', {
      ...day,
      q: 'fábrica',
      clientId: customer.id,
      zone: 'zone:' + north,
    });
    expect(matching.body.items.map((option: { value: string }) => option.value)).toEqual([
      'route:' + routes[0].id,
      'route:' + routes[1].id,
      'series:' + seriesId,
    ]);
    expect((await options('client', { ...day, q: customer.code })).body.items).toEqual([
      { value: customer.id, label: 'Tienda Producción · ' + customer.code },
    ]);
    expect((await options('client', { ...day, q: 'TIENDA PRODUCCION' })).body.items).toHaveLength(
      1,
    );
  });

  it('mantiene las zonas históricas y distingue la zona pendiente', async () => {
    const date = { from: '2026-05-02', to: '2026-05-02' };
    const legacy = await get({ ...date, zone: 'zone:' + oldZone });
    expect(legacy.body.totals.units).toBe(2);
    expect((await get({ ...date, zone: 'legacy:zona anterior' })).body.totals.units).toBe(1);
    expect((await get({ ...date, zone: 'pending' })).body.totals.units).toBe(1);
    expect(
      (await options('zone', date)).body.items
        .map((option: { value: string }) => option.value)
        .sort(),
    ).toEqual(['legacy:zona anterior', 'pending', 'zone:' + oldZone]);
  });

  it('actualiza filtros de estado y aplica los permisos de Comandas', async () => {
    for (const role of ['administracion', 'preparacion', 'supervision']) {
      expect((await get(day, role)).status).toBe(200);
      expect((await options('client', day, role)).status).toBe(200);
    }
    expect((await get(day, 'vendedor')).status).toBe(403);
    expect((await options('zone', day, 'vendedor')).status).toBe(403);
    expect((await get(day, 'invitado')).status).toBe(401);
    const filters = { ...day, clientId: second.id };
    const id = await db
      .prepare('SELECT id FROM commands WHERE order_id=?')
      .bind(direct.id)
      .first<{ id: string }>();
    for (const state of ['en_preparacion', 'listo']) {
      expect(
        (await request('/api/v1/commands/' + id?.id + '/advance', 'preparacion', 'POST')).status,
      ).toBe(200);
      expect((await get({ ...filters, state })).body.totals.units).toBe(7);
    }
    expect((await get(filters)).body.totals.units).toBe(0);
    expect((await get({ ...filters, state: 'all' })).body.totals.units).toBe(7);
  });

  it('pagina las opciones de cliente y trata los signos de búsqueda como literales', async () => {
    const at = '2027-03-25T15:00:00.000Z';
    for (let i = 0; i < 21; i++) {
      const id = 'prod-page-' + String(i).padStart(2, '0');
      await db.batch([
        db
          .prepare(
            "INSERT INTO clients(id,code,name,zone_id,seller_id,recurrence_start,created_at,updated_at) VALUES(?,?,?, ?,?,'2026-01-01',?,?)",
          )
          .bind(id, id, 'Comercio % ' + id, south, users.vendedor.id, at, at),
        db
          .prepare(
            "INSERT INTO orders(id,client_id,author_id,currency,rate,total_minor,total_usd_minor,units,status,client_snapshot,idempotency_key,request_hash,created_at,updated_at) VALUES(?, ?,?,'USD','1',100,100,1,'validado',?,?,?,?,?)",
          )
          .bind(
            id,
            id,
            users.administracion.id,
            JSON.stringify({ zoneId: south, zone: 'Sur de fabricación' }),
            id,
            id,
            at,
            at,
          ),
        db
          .prepare('INSERT INTO commands(id,order_id,created_at,updated_at) VALUES(?,?,?,?)')
          .bind(id, id, at, at),
        db
          .prepare(
            "INSERT INTO order_items(id,order_id,product_id,name,sku,quantity,price_usd,unit_minor,subtotal_minor) VALUES(?,?,'legacy-pan','Pan histórico','LEGACY-PAN',1,'1.00',100,100)",
          )
          .bind(id, id),
      ]);
    }
    const params = { from: '2027-03-25', to: '2027-03-25', q: 'Comercio %' };
    const first = await options('client', params);
    const secondPage = await options('client', { ...params, page: '2' });
    expect(first.body.total).toBe(21);
    expect(first.body.items).toHaveLength(20);
    expect(secondPage.body.items).toHaveLength(1);
    expect(first.body.items).not.toContainEqual(secondPage.body.items[0]);
    expect((await options('client', { ...params, q: '_' })).body.total).toBe(0);
    expect((await options('client', { ...params, page: '0' })).status).toBe(422);
    expect((await options('invalid', params)).status).toBe(422);
  });
});

describe('Fotos privadas', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'base64',
  );
  const webp = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEALmk0mk0iIiIiIgBo', 'base64');
  const productPath = () => '/api/v1/products/' + product.id + '/photo';
  const clientPath = (id: string) => '/api/v1/clients/' + id + '/photo';
  const profile = '/api/v1/me/photo';

  function imageBinding(output = webp, wait?: () => Promise<void>) {
    return {
      async info() {
        return { format: 'image/png', width: 1, height: 1, fileSize: png.length };
      },
      input() {
        return {
          transform(options: unknown) {
            expect(options).toMatchObject({ width: 1024, height: 1024, fit: 'scale-down' });
            return {
              async output(options: unknown) {
                expect(options).toMatchObject({ format: 'image/webp', anim: false });
                await wait?.();
                return {
                  response: () =>
                    new Response(new Uint8Array(output), {
                      headers: { 'Content-Type': 'image/webp' },
                    }),
                };
              },
            };
          },
        };
      },
    } as unknown as ImagesBinding;
  }

  function upload(
    path: string,
    role = 'administracion',
    expected?: string,
    source: Uint8Array = png,
  ) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(source)], { type: 'image/png' }), 'prueba.png');
    if (expected) form.append('expectedPhotoId', expected);
    return request(path, role, 'POST', form);
  }

  beforeAll(async () => {
    await createUser('photo-other', 'Vendedor de prueba de fotos', 'vendedor');
    env.IMAGES = imageBinding();
  });

  it('agrega y reemplaza la foto de producto con exclusión de conflictos y auditoría', async () => {
    const path = productPath();
    const first = await upload(path);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const { photoId } = first.body;
    const visible = await request(path + '?v=' + photoId, 'vendedor');
    expect(visible.status).toBe(200);
    expect(visible.body).toEqual(webp);
    expect(visible.response.headers.get('Cache-Control')).toContain('no-store');
    expect(await request(path, 'invitado')).toMatchObject({ status: 401 });
    expect(await request(path, 'supervision')).toMatchObject({ status: 403 });
    expect(await upload(path, 'vendedor', photoId)).toMatchObject({ status: 403 });
    const second = await Promise.all([
      upload(path, 'administracion', photoId),
      upload(path, 'administracion', photoId),
    ]);
    expect(second.map((r) => r.status).sort()).toEqual([200, 409]);
    const latest = second.find((r) => r.status === 200)!.body.photoId;
    expect(second.find((r) => r.status === 409)?.body.error.details.photoId).toBe(latest);
    expect(await request(path + '?v=' + photoId)).toMatchObject({ status: 404 });
    expect(
      (await request('/api/v1/products')).body.items.find(
        (p: { id: string }) => p.id === product.id,
      ).photoId,
    ).toBe(latest);
    const audit = await db
      .prepare("SELECT count(*) total FROM audit_log WHERE entity_id=? AND action='guardar_foto'")
      .bind(product.id)
      .first<{ total: number }>();
    expect(audit?.total).toBe(2);
  });

  it('protege la foto de cliente si cambia de vendedor mientras se guarda', async () => {
    const customer = await request(
      '/api/v1/clients',
      'administracion',
      'POST',
      baseClient('Negocio con foto', users.vendedor.id),
    );
    const path = clientPath(customer.body.id);
    const first = await upload(path, 'vendedor');
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect((await request(path, 'supervision')).status).toBe(200);
    expect((await request(path, 'photo-other')).status).toBe(404);
    expect((await upload(path, 'photo-other', first.body.photoId)).status).toBe(404);
    expect((await upload(path, 'supervision', first.body.photoId)).status).toBe(403);
    let waitForTransform!: () => void;
    const transforming = new Promise<void>((resolve) => {
      waitForTransform = resolve;
    });
    let resume!: () => void;
    const paused = new Promise<void>((resolve) => {
      resume = resolve;
    });
    env.IMAGES = imageBinding(webp, () => {
      waitForTransform();
      return paused;
    });
    try {
      const attempted = upload(path, 'vendedor', first.body.photoId);
      await transforming;
      expect(
        (
          await request(
            '/api/v1/clients/' + customer.body.id,
            'administracion',
            'PATCH',
            baseClient('Negocio con foto', users['photo-other'].id),
          )
        ).status,
      ).toBe(200);
      resume();
      expect((await attempted).status).toBe(404);
      expect((await request(path, 'vendedor')).status).toBe(404);
      expect((await request(path + '?v=' + first.body.photoId, 'photo-other')).status).toBe(200);
    } finally {
      resume();
      env.IMAGES = imageBinding();
    }
  });

  it('permite al vendedor gestionar su propio perfil y restringe los demás perfiles', async () => {
    const first = await upload(profile, 'vendedor');
    expect(first.status).toBe(200);
    expect((await request('/api/v1/me', 'vendedor')).body.photoId).toBe(first.body.photoId);
    const userPath = '/api/v1/users/' + users.vendedor.id + '/photo';
    expect((await request(userPath)).status).toBe(200);
    expect((await request(userPath, 'photo-other')).status).toBe(403);
    expect((await request(userPath, 'supervision')).status).toBe(403);
    expect((await upload(profile, 'preparacion')).status).toBe(403);
    expect((await request('/api/v1/users/' + users.supervision.id + '/photo')).status).toBe(404);
    const remove = await request(
      profile + '?expectedPhotoId=' + first.body.photoId,
      'vendedor',
      'DELETE',
    );
    expect(remove.body).toEqual({ photoId: null });
    expect((await request(profile, 'vendedor')).status).toBe(404);
  });

  it('mantiene la foto al restaurar la ficha y limpia versiones retiradas y cargas abandonadas', async () => {
    const created = await request('/api/v1/products', 'administracion', 'POST', {
      name: 'Producto con foto',
      sku: 'FOTO-RESTAURAR',
      priceUsd: '1.23',
    });
    const parent = '/api/v1/products/' + created.body.id;
    const path = parent + '/photo';
    const uploaded = await upload(path);
    expect(uploaded.status).toBe(200);
    const retired = uploaded.body.photoId;
    const replacement = await upload(path, 'administracion', retired);
    expect(replacement.status).toBe(200);
    const kept = replacement.body.photoId;
    expect((await request(parent, 'administracion', 'DELETE')).status).toBe(200);
    expect((await request(path)).status).toBe(404);
    await db.prepare("UPDATE photo_files SET collect_after='2000-01-01T00:00:00Z'").run();
    await cleanupPhotos(env);
    expect(await env.PHOTOS!.get('photos/' + retired + '.webp')).toBeNull();
    expect(await env.PHOTOS!.get('photos/' + kept + '.webp')).not.toBeNull();
    expect(
      (
        await request(
          '/api/v1/trash/products/' + created.body.id + '/restore',
          'administracion',
          'POST',
        )
      ).status,
    ).toBe(200);
    expect((await request(path + '?v=' + kept)).status).toBe(200);
  });

  it('restringe el tamaño y rechaza contenido inválido o metadatos en la salida', async () => {
    const path = '/api/v1/users/' + users['photo-other'].id + '/photo';
    expect(
      (
        await upload(
          path,
          'administracion',
          undefined,
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        )
      ).status,
    ).toBe(422);
    expect(
      (await upload(path, 'administracion', undefined, new Uint8Array(10 * 1024 * 1024 + 1)))
        .status,
    ).toBe(413);
    expect((await request(path, 'administracion', 'POST', { file: 'datos' })).status).toBe(415);
    expect(
      (await request('/api/v1/products', 'administracion', 'POST', { name: 'x'.repeat(270_000) }))
        .status,
    ).toBe(413);
    const exif = Buffer.concat([webp, Buffer.from('455849460400000047505300', 'hex')]);
    exif.writeUInt32LE(exif.length - 8, 4);
    env.IMAGES = imageBinding(exif);
    try {
      expect((await upload(path)).body.error.code).toBe('PHOTO_PROCESSOR');
      expect((await request(path)).status).toBe(404);
    } finally {
      env.IMAGES = imageBinding();
    }
  });

  it('conserva la foto vigente si falla R2 y oculta las fotos al expirar la sesión', async () => {
    const path = '/api/v1/users/' + users['photo-other'].id + '/photo';
    const first = await upload(path);
    expect(first.status).toBe(200);
    const stored = env.PHOTOS;
    try {
      env.PHOTOS = undefined;
      expect((await upload(path, 'administracion', first.body.photoId)).body.error.code).toBe(
        'PHOTO_STORAGE',
      );
    } finally {
      env.PHOTOS = stored;
    }
    expect((await request(path + '?v=' + first.body.photoId)).status).toBe(200);
    await db
      .prepare('UPDATE session SET expiresAt=0 WHERE userId=?')
      .bind(users['photo-other'].id)
      .run();
    expect((await request(profile, 'photo-other')).status).toBe(401);
  });
});

describe('Importación de catálogos', () => {
  const path = '/api/v1/catalog-import';

  it('revisa y aplica precios en el rol administrativo sin escribir durante la vista previa', async () => {
    await request('/api/v1/rates', 'administracion', 'POST', { currency: 'COP', rate: '4000' });
    const input = {
      kind: 'prices',
      currency: 'COP',
      rows: [{ line: 12, code: 'IMP-PAN', name: 'Pan de importación', price: '7000' }],
    };
    expect((await request(path, 'vendedor', 'POST', input)).status).toBe(403);
    const preview = await request(path, 'administracion', 'POST', input);
    expect(preview.body.summary).toEqual({ creates: 1, updates: 0, skipped: 0, unchanged: 0 });
    expect(preview.body.decisions[0].note).toBe('USD 1.75');
    expect(await db.prepare("SELECT id FROM products WHERE sku='IMP-PAN'").first()).toBeNull();
    const result = await request(path, 'administracion', 'POST', {
      ...input,
      revision: preview.body.revision,
    });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const product = await db
      .prepare("SELECT id,price_usd FROM products WHERE sku='IMP-PAN'")
      .first();
    expect(product?.price_usd).toBe('1.75');
    const updatedInput = { ...input, rows: [{ ...input.rows[0], price: '7200' }] };
    const updated = await request(path, 'administracion', 'POST', updatedInput);
    expect(updated.body.summary.updates).toBe(1);
    expect(
      (
        await request(path, 'administracion', 'POST', {
          ...updatedInput,
          revision: updated.body.revision,
        })
      ).status,
    ).toBe(200);
    expect(
      await db.prepare("SELECT id,price_usd FROM products WHERE sku='IMP-PAN'").first(),
    ).toEqual({ id: product?.id, price_usd: '1.80' });
  });

  it('vincula por RIF, conserva la ficha operativa y crea clientes solo con zona confirmada', async () => {
    const zone = (
      await request('/api/v1/zones', 'administracion', 'POST', {
        name: 'Zona importación de prueba',
      })
    ).body;
    const existing = (
      await request('/api/v1/clients', 'administracion', 'POST', {
        name: 'Cliente antes de importar',
        rif: 'J-781234567',
        zoneId: zone.id,
        sellerId: users.vendedor.id,
        phone: '04240000000',
        active: true,
        recurrenceStart: '2026-11-02',
      })
    ).body;
    const rows = [
      {
        line: 11,
        code: 'XL-A',
        name: 'Cliente actualizado',
        rif: 'J781234567',
        phone: '',
        address: 'Dirección de prueba',
        active: false,
      },
      {
        line: 15,
        code: 'XL-B',
        name: 'Cliente nuevo',
        rif: 'J781234568',
        phone: '04240000001',
        address: '',
        active: true,
      },
      {
        line: 17,
        code: 'XL-D',
        name: 'Duplicado primero',
        rif: '',
        phone: '',
        address: '',
        active: true,
      },
      {
        line: 18,
        code: 'XL-D',
        name: 'Duplicado segundo',
        rif: '',
        phone: '',
        address: '',
        active: true,
      },
    ];
    const withoutZone = await request(path, 'administracion', 'POST', { kind: 'clients', rows });
    expect(withoutZone.body.summary).toMatchObject({ creates: 0, updates: 1, skipped: 3 });
    const input = { kind: 'clients', zoneId: zone.id, rows };
    const preview = await request(path, 'administracion', 'POST', input);
    expect(preview.body.summary).toMatchObject({ creates: 1, updates: 1, skipped: 2 });
    const applied = await request(path, 'administracion', 'POST', {
      ...input,
      revision: preview.body.revision,
    });
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect((await request('/api/v1/clients/' + existing.id)).body).toMatchObject({
      code: existing.code,
      name: 'Cliente actualizado',
      zoneId: zone.id,
      sellerId: users.vendedor.id,
      phone: '04240000000',
      active: true,
    });
    expect(
      await db.prepare("SELECT zone_id,seller_id FROM clients WHERE code='XL-B'").first(),
    ).toEqual({ zone_id: zone.id, seller_id: null });
    expect(await db.prepare("SELECT count(*) n FROM clients WHERE code='XL-D'").first()).toEqual({
      n: 0,
    });
    const again = await request(path, 'administracion', 'POST', input);
    expect(again.body.summary).toMatchObject({ creates: 0, updates: 0, unchanged: 2 });
  });

  it('importa clientes sin descripción conservando el nombre de las fichas existentes', async () => {
    const zone = (
      await request('/api/v1/zones', 'administracion', 'POST', { name: 'Zona descripción vacía' })
    ).body;
    const existing = (
      await request('/api/v1/clients', 'administracion', 'POST', {
        name: 'Cliente con nombre registrado',
        zoneId: zone.id,
        recurrenceStart: '2026-11-02',
      })
    ).body;
    const fields = { rif: '', phone: '', address: 'Dirección de prueba', active: true };
    const input = {
      kind: 'clients',
      zoneId: zone.id,
      rows: [
        { ...fields, line: 4, code: existing.code, name: '  ' },
        { ...fields, line: 5, code: 'XL-SIN-DESC', name: '' },
        { ...fields, line: 6, code: 'XL-OMITE-DESC' },
      ],
    };
    const preview = await request(path, 'administracion', 'POST', input);
    expect(preview.status).toBe(200);
    expect(preview.body.summary).toMatchObject({ creates: 2, updates: 1 });
    const applied = await request(path, 'administracion', 'POST', {
      ...input,
      revision: preview.body.revision,
    });
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect((await request('/api/v1/clients/' + existing.id)).body).toMatchObject({
      name: 'Cliente con nombre registrado',
      address: fields.address,
    });
    expect(
      (
        await db
          .prepare("SELECT name FROM clients WHERE code IN ('XL-SIN-DESC','XL-OMITE-DESC')")
          .all()
      ).results,
    ).toEqual([{ name: '' }, { name: '' }]);
  });

  it('asigna altas por dirección, registra la zona revisada y rechaza asignaciones manipuladas', async () => {
    const zoneName = 'Zona Jev de prueba';
    const zone = (await request('/api/v1/zones', 'administracion', 'POST', { name: zoneName }))
      .body;
    const fallback = await db
      .prepare("SELECT id FROM zones WHERE name_key='sin clasificar'")
      .first<{ id: string }>();
    await request('/api/v1/zones', 'administracion', 'POST', {
      name: 'Zona Jev inactiva',
      active: false,
    });
    const fields = { name: '', rif: '', phone: '04240000000', active: true };
    const input = {
      kind: 'clients',
      classifyZones: true,
      rows: [
        {
          ...fields,
          line: 1,
          code: 'JEV-MATCH',
          address: 'Dirección ficticia en Zona Jev de prueba',
        },
        { ...fields, line: 2, code: 'JEV-UNCERTAIN', address: 'Dirección ambigua' },
        { ...fields, line: 3, code: 'JEV-BLANK', address: '' },
      ],
    };
    const provider = vi.fn((init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-jev-key');
      expect(init?.redirect).toBe('manual');
      const payload = JSON.parse(String(init?.body));
      const available: [string, string][] = Object.entries(payload.state.zonas);
      expect(available.map(([, name]) => name)).not.toContain('Zona Jev inactiva');
      expect(available.map(([, name]) => name)).not.toContain('Sin clasificar');
      expect(Object.values(payload.state.direcciones)).toEqual(
        input.rows.slice(0, 2).map((r) => r.address),
      );
      expect(init?.body).not.toContain(fields.phone);
      const choice = available.find(([, name]) => name.startsWith(zoneName))![0];
      const answer = (confidence: number) => ({
        type: 'choice',
        choice,
        confidence,
        probabilities: { [choice]: confidence, sin_clasificar: 1 - confidence },
      });
      return Response.json({
        answers: { direccion_1: answer(0.98), direccion_2: answer(0.55) },
      });
    });
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (resource, init) =>
        resource === 'https://api.typesafe.ai/v1/systemone'
          ? provider(init)
          : originalFetch(resource, init),
      );
    env.TYPESAFE_API_KEY = 'test-jev-key';
    try {
      expect((await request(path, 'vendedor', 'POST', input)).status).toBe(403);
      const preview = await request(path, 'administracion', 'POST', input);
      expect(preview.status, JSON.stringify(preview.body)).toBe(200);
      expect(preview.body.zoneAssignments).toEqual([
        ['JEV-MATCH', zone.id],
        ['JEV-UNCERTAIN', fallback?.id],
        ['JEV-BLANK', fallback?.id],
      ]);
      expect(preview.body.decisions.map((d: { note: string }) => d.note)).toEqual([
        'Zona: ' + zoneName,
        'Zona: Sin clasificar',
        'Zona: Sin clasificar',
      ]);
      const review = {
        ...input,
        revision: preview.body.revision,
        zoneAssignments: preview.body.zoneAssignments,
      };
      const tampered = await request(path, 'administracion', 'POST', {
        ...review,
        zoneAssignments: input.rows.map((r) => [r.code, fallback?.id]),
      });
      expect(tampered.status).toBe(409);
      expect(
        (
          await request('/api/v1/zones/' + zone.id, 'administracion', 'PATCH', {
            name: zoneName + ' renombrada',
          })
        ).status,
      ).toBe(200);
      expect((await request(path, 'administracion', 'POST', review)).status).toBe(409);
      expect(provider).toHaveBeenCalledTimes(1);
      const refreshed = await request(path, 'administracion', 'POST', input);
      const applied = await request(path, 'administracion', 'POST', {
        ...input,
        revision: refreshed.body.revision,
        zoneAssignments: refreshed.body.zoneAssignments,
      });
      expect(applied.status, JSON.stringify(applied.body)).toBe(200);
      expect(provider).toHaveBeenCalledTimes(2);
      const records = await db
        .prepare("SELECT code,zone_id FROM clients WHERE code LIKE 'JEV-%' ORDER BY code")
        .all();
      expect(records.results).toEqual([
        { code: 'JEV-BLANK', zone_id: fallback?.id },
        { code: 'JEV-MATCH', zone_id: zone.id },
        { code: 'JEV-UNCERTAIN', zone_id: fallback?.id },
      ]);
    } finally {
      delete env.TYPESAFE_API_KEY;
      fetchSpy.mockRestore();
    }
  });

  it('ofrece la zona predeterminada cuando falta la clave de Jev', async () => {
    const zone = await db
      .prepare(
        "SELECT id FROM zones WHERE name_key='sin clasificar' AND active=1 AND deleted_at IS NULL",
      )
      .first<{ id: string }>();
    expect(zone?.id).toBeTruthy();
    const input = {
      kind: 'clients',
      classifyZones: true,
      rows: [{ line: 1, code: 'JEV-NO-KEY', rif: '', phone: '', address: 'Centro', active: true }],
    };
    const preview = await request(path, 'administracion', 'POST', input);
    expect(preview.body.zoneWarning).toContain('Falta configurar Jev');
    expect(preview.body.zoneAssignments).toEqual([['JEV-NO-KEY', zone?.id]]);
    expect(
      (
        await request('/api/v1/zones/' + zone?.id, 'administracion', 'PATCH', {
          name: 'Otro nombre',
        })
      ).status,
    ).toBe(409);
    expect((await request('/api/v1/zones/' + zone?.id, 'administracion', 'DELETE')).status).toBe(
      409,
    );
  });

  it('rechaza una vista previa obsoleta sin crear los demás registros', async () => {
    const input = {
      kind: 'prices',
      currency: 'USD',
      rows: [
        { line: 1, code: 'XL-STALE', name: 'Registro original', price: '1.99' },
        { line: 2, code: 'XL-ATOMIC', name: 'Registro que no debe crearse', price: '2.99' },
      ],
    };
    const preview = await request(path, 'administracion', 'POST', input);
    await request('/api/v1/products', 'administracion', 'POST', {
      sku: 'XL-STALE',
      name: 'Alta manual',
      priceUsd: '3.00',
    });
    const applied = await request(path, 'administracion', 'POST', {
      ...input,
      revision: preview.body.revision,
    });
    expect(applied.status).toBe(409);
    expect(await db.prepare("SELECT id FROM products WHERE sku='XL-ATOMIC'").first()).toBeNull();
  });
});
