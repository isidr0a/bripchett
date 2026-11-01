import { Hono } from 'hono';
import { clientSchema, completionSchema, productSchema, rateSchema } from '@briochett/contracts';
import type { AppEnv } from '../types';
import { adminOnly, allow, body, pagination, salesOnly, viewRoles } from '../helpers';

export const catalogController = new Hono<AppEnv>();
catalogController.get('/clients', allow(...viewRoles), async (c) =>
  c.json(
    await c
      .get('services')
      .catalog.listClients(pagination(c), c.req.query('q') || '', c.req.query('active') === 'true'),
  ),
);
catalogController.get('/clients/:id', allow(...viewRoles), async (c) =>
  c.json(await c.get('services').catalog.client(c.req.param('id'))),
);
catalogController.post('/clients', adminOnly, async (c) =>
  c.json(await c.get('services').catalog.createClient(await body(c, clientSchema)), 201),
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
