import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { adminOnly, allow } from '../helpers';

export const integrationController = new Hono<AppEnv>();
integrationController.get('/integration/a2', adminOnly, (c) =>
  c.json(c.get('services').integration.status()),
);
integrationController.post('/integration/a2/import-clients', adminOnly, async (c) =>
  c.json({ result: await c.get('services').integration.importClients() }),
);
integrationController.post('/clients/:id/a2', adminOnly, async (c) =>
  c.json({ result: await c.get('services').integration.pushClient(c.req.param('id')) }),
);
integrationController.get(
  '/clients/:id/account',
  allow('administracion', 'vendedor', 'supervision'),
  async (c) =>
    c.json({ result: await c.get('services').integration.accountStatement(c.req.param('id')) }),
);
integrationController.post('/orders/:id/a2', adminOnly, async (c) =>
  c.json({ result: await c.get('services').integration.pushOrder(c.req.param('id')) }),
);
