import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { userSchema } from '@briochett/contracts';
import type { AppEnv } from './types';
import { createAuthentication, createServices } from '../../composition';
import { ApplicationError, fail } from '../../domain/errors';
import { uid, tokenEquals } from '../../domain/primitives';
import { body } from './helpers';
import { catalogController } from './controllers/catalog-controller';
import { orderController } from './controllers/order-controller';
import { planningController } from './controllers/planning-controller';
import { managementController } from './controllers/management-controller';
import { openapi } from './openapi';
import { integrationController } from './controllers/integration-controller';
const app = new Hono<AppEnv>();
app.use(
  '*',
  secureHeaders(),
  bodyLimit({
    maxSize: 256 * 1024,
    onError: (c) =>
      c.json(
        { error: { code: 'BODY_TOO_LARGE', message: 'La solicitud es demasiado grande.' } },
        413,
      ),
  }),
);
app.use('*', async (c, next) => {
  c.set('requestId', uid());
  c.header('X-Request-Id', c.get('requestId'));
  await next();
});
app.use('/api/*', async (c, next) => {
  const middleware = cors({
    origin: c.env.FRONTEND_ORIGIN,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Idempotency-Key'],
    maxAge: 3600,
  });
  return middleware(c, next);
});
app.use('*', async (c, next) => {
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) &&
    c.req.path !== '/internal/bootstrap' &&
    c.req.header('Origin') !== c.env.FRONTEND_ORIGIN
  )
    fail(403, 'ORIGIN', 'El origen de la solicitud no está autorizado.');
  await next();
});
app.get('/health', (c) => c.json({ ok: true, service: 'briochett-api' }));
app.get('/api/v1/openapi.json', (c) => c.json(openapi));
app.use('/api/*', async (c, next) => {
  if (!c.env.BETTER_AUTH_SECRET)
    fail(503, 'AUTH_CONFIGURATION', 'La autenticación aún no está configurada.');
  c.set('authentication', createAuthentication(c.env, c.req.raw.headers));
  await next();
});
app.all('/api/auth/*', async (c) => {
  const path = c.req.path.slice('/api/auth/'.length);
  if (!['sign-in/username', 'get-session', 'sign-out', 'change-password'].includes(path))
    fail(404, 'NOT_FOUND', 'Acción de autenticación no disponible.');
  const { auth, repository } = c.get('authentication');
  const session =
    path === 'change-password' ? await auth.api.getSession({ headers: c.req.raw.headers }) : null;
  const response = await auth.handler(c.req.raw);
  if (path === 'change-password' && response.ok && session)
    await repository.passwordChanged(session.user.id);
  return response;
});
app.post('/internal/bootstrap', async (c) => {
  if (
    !c.env.BOOTSTRAP_TOKEN ||
    !(await tokenEquals(c.req.header('Authorization') || '', 'Bearer ' + c.env.BOOTSTRAP_TOKEN))
  )
    fail(404, 'NOT_FOUND', 'No encontrado.');
  const { bootstrap } = createAuthentication(c.env, c.req.raw.headers);
  return c.json(await bootstrap.initialize(await body(c, userSchema)), 201);
});
app.use('/api/v1/*', async (c, next) => {
  const { auth, repository } = c.get('authentication');
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) fail(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.');
  const user = await repository.sessionUser(session.user.id);
  if (!user) fail(401, 'ACCOUNT_DISABLED', 'La cuenta está desactivada.');
  c.set('user', user);
  c.header('Cache-Control', 'no-store');
  if (user.mustChangePassword && c.req.path !== '/api/v1/me')
    fail(403, 'PASSWORD_CHANGE_REQUIRED', 'Cambia tu contraseña inicial para continuar.');
  c.set('services', createServices(c.env, user, auth, c.req.raw.headers));
  await next();
});
app.get('/api/v1/me', (c) => c.json(c.get('user')));
app.route('/api/v1', catalogController);
app.route('/api/v1', orderController);
app.route('/api/v1', planningController);
app.route('/api/v1', managementController);
app.route('/api/v1', integrationController);
app.notFound((c) =>
  c.json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado.' } }, 404),
);
app.onError((error, c) => {
  if (error instanceof ApplicationError)
    return c.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      error.status,
    );
  if (error instanceof HTTPException) return error.getResponse();
  const message = String(error.message);
  if (
    /UNIQUE constraint|constraint failed|ORDER_CLIENT_SCOPE|ORDER_NOT_VALIDATED|LAST_ADMIN|PRODUCT_CHANGED|VISIT_CLIENT_SCOPE|VISIT_DUPLICATE|ROUTE_STARTED|ROUTE_SERIES_CHANGED/i.test(
      message,
    )
  )
    return c.json(
      {
        error: {
          code: 'CONFLICT',
          message:
            'El registro ya existe, cambió de estado o dejó de estar disponible. Actualiza los datos y vuelve a intentar.',
        },
      },
      409,
    );
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    const status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 400;
    return Response.json(
      {
        error: {
          code: 'AUTH_ERROR',
          message: 'No se pudo completar la operación de la cuenta. Revisa sus datos.',
        },
      },
      { status },
    );
  }
  console.error(
    JSON.stringify({ event: 'request_failed', requestId: c.get('requestId'), name: error.name }),
  );
  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'No se pudo completar la operación. Intenta de nuevo.',
        requestId: c.get('requestId'),
      },
    },
    500,
  );
});
export default app;
