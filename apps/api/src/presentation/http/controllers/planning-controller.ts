import { Hono } from 'hono';
import { routeSchema, visitSchema, visitResultSchema } from '@briochett/contracts';
import type { AppEnv } from '../types';
import { adminOnly, allow, body, pagination, salesOnly, viewRoles } from '../helpers';

export const planningController = new Hono<AppEnv>();
planningController.get('/routes', allow(...viewRoles), async (c) =>
  c.json(await c.get('services').planning.routes(pagination(c))),
);
planningController.post('/routes', adminOnly, async (c) =>
  c.json(await c.get('services').planning.saveRoute(await body(c, routeSchema)), 201),
);
planningController.patch('/routes/:id', adminOnly, async (c) =>
  c.json(await c.get('services').planning.saveRoute(await body(c, routeSchema), c.req.param('id'))),
);
planningController.get('/visits', allow(...viewRoles), async (c) =>
  c.json(await c.get('services').planning.visits(pagination(c))),
);
planningController.get('/visits/:id', allow(...viewRoles), async (c) =>
  c.json(await c.get('services').planning.visit(c.req.param('id'))),
);
planningController.post('/visits', salesOnly, async (c) =>
  c.json(await c.get('services').planning.scheduleVisit(await body(c, visitSchema)), 201),
);
planningController.post('/visits/:id/result', salesOnly, async (c) =>
  c.json(
    await c
      .get('services')
      .planning.completeVisit(c.req.param('id'), await body(c, visitResultSchema)),
  ),
);
