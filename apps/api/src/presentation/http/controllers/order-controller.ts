import { Hono } from 'hono';
import { z } from 'zod';
import { orderSchema, quoteSchema } from '@briochett/contracts';
import type { AppEnv } from '../types';
import { adminOnly, allow, body, pagination, salesOnly, viewRoles } from '../helpers';
import { fail } from '../../../domain/errors';

export const orderController = new Hono<AppEnv>();
orderController.get('/orders', allow(...viewRoles), async (c) =>
  c.json(await c.get('services').orders.list(pagination(c))),
);
orderController.get('/orders/:id', allow(...viewRoles), async (c) =>
  c.json(await c.get('services').orders.get(c.req.param('id'))),
);
orderController.post('/orders/quote', salesOnly, async (c) =>
  c.json(await c.get('services').orders.quote(await body(c, quoteSchema))),
);
orderController.post('/orders', salesOnly, async (c) => {
  const input = await body(c, orderSchema),
    key = c.req.header('Idempotency-Key');
  if (!key || !z.uuid().safeParse(key).success)
    fail(422, 'IDEMPOTENCY_KEY', 'La solicitud debe tener una clave de registro válida.');
  const { order, created } = await c.get('services').orders.register(input, key);
  return c.json(order, created ? 201 : 200);
});
orderController.post('/orders/:id/validate', adminOnly, async (c) =>
  c.json(await c.get('services').orders.validate(c.req.param('id'))),
);
orderController.post('/orders/:id/cancel', adminOnly, async (c) =>
  c.json(await c.get('services').orders.cancel(c.req.param('id'))),
);
orderController.get('/commands', allow('administracion', 'preparacion', 'supervision'), async (c) =>
  c.json(await c.get('services').orders.commands(pagination(c))),
);
orderController.post('/commands/:id/advance', allow('administracion', 'preparacion'), async (c) =>
  c.json(await c.get('services').orders.advanceCommand(c.req.param('id'))),
);
