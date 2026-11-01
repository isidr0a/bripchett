import type { Context, MiddlewareHandler } from 'hono';
import type { Role } from '@briochett/contracts';
import type { z } from 'zod';
import type { AppEnv } from './types';
import { fail } from '../../domain/errors';

export async function body<S extends z.ZodType>(
  context: Context<AppEnv>,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await context.req.json();
  } catch {
    fail(400, 'INVALID_JSON', 'La solicitud no contiene JSON válido.');
  }
  const result = schema.safeParse(raw);
  if (!result.success)
    fail(422, 'VALIDATION', 'Revisa los datos del formulario.', result.error.flatten());
  return result.data;
}
export const allow =
  (...roles: Role[]): MiddlewareHandler<AppEnv> =>
  async (context, next) => {
    if (!roles.includes(context.get('user').role))
      fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
    await next();
  };
export const viewRoles: Role[] = ['administracion', 'vendedor', 'supervision'];
export const adminOnly = allow('administracion');
export const salesOnly = allow('administracion', 'vendedor');
export function pagination(context: Context<AppEnv>) {
  const page = Number(context.req.query('page') || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
    fail(422, 'PAGE', 'La página no es válida.');
  return { page, pageSize: 20, offset: (page - 1) * 20 };
}
