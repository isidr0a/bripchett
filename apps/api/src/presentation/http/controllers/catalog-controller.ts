import { Hono } from 'hono';
import {
  clientSchema,
  completionSchema,
  productSchema,
  rateSchema,
  sellerClientSchema,
  zoneIdSchema,
  zoneSchema,
} from '@briochett/contracts';
import { fail } from '../../../domain/errors';
import type { AppEnv } from '../types';
import { adminOnly, allow, body, pagination, salesOnly, viewRoles } from '../helpers';

export const catalogController = new Hono<AppEnv>();
catalogController.get('/clients', allow(...viewRoles), async (c) =>
  c.json(
    await c
      .get('services')
      .catalog.listClients(
        pagination(c),
        c.req.query('q') || '',
        c.req.query('active') === 'true',
        { zoneId: c.req.query('zoneId'), sellerId: c.req.query('sellerId') },
      ),
  ),
);
catalogController.get('/clients/:id', allow(...viewRoles), async (c) =>
  c.json(await c.get('services').catalog.client(c.req.param('id'))),
);
catalogController.post('/clients', salesOnly, async (c) => {
  const service = c.get('services').catalog;
  const customer =
    c.get('user').role === 'vendedor'
      ? await service.createSellerClient(await body(c, sellerClientSchema))
      : await service.createClient(await body(c, clientSchema));
  return c.json(customer, 201);
});
catalogController.get('/clients/:id/zone-impact', adminOnly, async (c) => {
  const zone = zoneIdSchema.safeParse(c.req.query('zoneId'));
  if (!zone.success) fail(422, 'ZONE_UNAVAILABLE', 'Selecciona una zona activa.');
  return c.json(await c.get('services').catalog.previewZoneChange(c.req.param('id'), zone.data));
});
catalogController.get('/zones', allow(...viewRoles), async (c) =>
  c.json(
    await c
      .get('services')
      .zones.list(
        pagination(c),
        c.get('user').role !== 'administracion' || c.req.query('active') === 'true',
        c.req.query('q') || '',
      ),
  ),
);
catalogController.post('/zones', adminOnly, async (c) =>
  c.json(await c.get('services').zones.save(await body(c, zoneSchema)), 201),
);
catalogController.patch('/zones/:id', adminOnly, async (c) =>
  c.json(await c.get('services').zones.save(await body(c, zoneSchema), c.req.param('id'))),
);
catalogController.patch('/clients/:id', adminOnly, async (c) =>
  c.json(
    await c.get('services').catalog.updateClient(c.req.param('id'), await body(c, clientSchema)),
  ),
);
catalogController.patch('/clients/:id/completion', salesOnly, async (c) =>
  c.json(
    await c
      .get('services')
      .catalog.completeClient(c.req.param('id'), await body(c, completionSchema)),
  ),
);
catalogController.get('/products', allow('administracion', 'vendedor'), async (c) =>
  c.json(
    await c.get('services').catalog.listProducts(pagination(c), c.req.query('active') === 'true'),
  ),
);
catalogController.post('/products', adminOnly, async (c) =>
  c.json(await c.get('services').catalog.createProduct(await body(c, productSchema)), 201),
);
catalogController.patch('/products/:id', adminOnly, async (c) =>
  c.json(
    await c.get('services').catalog.updateProduct(c.req.param('id'), await body(c, productSchema)),
  ),
);
catalogController.get('/rates', allow(...viewRoles), async (c) =>
  c.json(await c.get('services').catalog.listRates()),
);
catalogController.post('/rates', adminOnly, async (c) =>
  c.json(await c.get('services').catalog.createRate(await body(c, rateSchema)), 201),
);
