import { Hono } from 'hono';
import { z } from 'zod';
import { userSchema, userUpdateSchema } from '@briochett/contracts';
import type { AppEnv } from '../types';
import { adminOnly, allow, body, pagination, viewRoles } from '../helpers';
import { fail } from '../../../domain/errors';

const passwordSchema = z.object({ password: z.string().min(10).max(128) });
const reportSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  sellerId: z.string().optional(),
});
export const managementController = new Hono<AppEnv>();
managementController.get('/users', adminOnly, async (c) =>
  c.json(await c.get('services').management.users(pagination(c))),
);
managementController.get('/sellers', allow('administracion', 'supervision'), async (c) =>
  c.json(await c.get('services').management.sellers()),
);
managementController.post('/users', adminOnly, async (c) =>
  c.json(await c.get('services').management.createUser(await body(c, userSchema)), 201),
);
managementController.patch('/users/:id', adminOnly, async (c) =>
  c.json(
    await c
      .get('services')
      .management.updateUser(c.req.param('id'), await body(c, userUpdateSchema)),
  ),
);
managementController.post('/users/:id/password', adminOnly, async (c) => {
  const input = await body(c, passwordSchema);
  return c.json(
    await c.get('services').management.resetPassword(c.req.param('id'), input.password),
  );
});
managementController.get('/dashboard', allow(...viewRoles), async (c) =>
  c.json(await c.get('services').management.dashboard()),
);
managementController.get('/reports', allow('administracion', 'supervision'), async (c) => {
  const result = reportSchema.safeParse(c.req.query());
  if (!result.success) fail(422, 'REPORT_DATES', 'Selecciona fechas válidas para el reporte.');
  return c.json(await c.get('services').management.report(result.data));
});
managementController.get('/audit', adminOnly, async (c) =>
  c.json(await c.get('services').management.audit(pagination(c))),
);
