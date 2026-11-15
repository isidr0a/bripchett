import { Hono } from 'hono';
import { trashTypes, trashTypeSchema, deletionScopeSchema } from '@briochett/contracts';
import type { AppEnv } from '../types';
import { adminOnly, pagination } from '../helpers';
import { fail } from '../../../domain/errors';

export const trashController = new Hono<AppEnv>();
for (const type of trashTypes)
  trashController.delete(`/${type}/:id`, adminOnly, async (c) => {
    const scope = deletionScopeSchema.safeParse(c.req.query('scope') ?? 'date');
    if (!scope.success || (type !== 'routes' && scope.data !== 'date'))
      fail(422, 'TRASH_SCOPE', 'Selecciona un alcance de eliminación válido.');
    return c.json(await c.get('services').trash.remove(type, c.req.param('id'), scope.data));
  });

trashController.get('/trash', adminOnly, async (c) => {
  const input = c.req.query('type');
  const type = trashTypeSchema.safeParse(input);
  if (input !== undefined && !type.success) fail(422, 'TRASH_TYPE', 'Selecciona un tipo válido.');
  return c.json(await c.get('services').trash.list(pagination(c), type.data));
});

trashController.post('/trash/:type/:id/restore', adminOnly, async (c) => {
  const type = trashTypeSchema.safeParse(c.req.param('type'));
  if (!type.success) fail(404, 'NOT_FOUND', 'Tipo de registro no encontrado.');
  return c.json(await c.get('services').trash.restore(type.data, c.req.param('id')));
});
