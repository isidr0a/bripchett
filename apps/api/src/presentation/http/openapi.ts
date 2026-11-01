import { z } from 'zod';
import {
  clientSchema,
  completionSchema,
  productSchema,
  rateSchema,
  userSchema,
  userUpdateSchema,
  quoteSchema,
  orderSchema,
  routeSchema,
  visitSchema,
  visitResultSchema,
} from '@briochett/contracts';
type Parameter = {
  name: string;
  in: string;
  required?: boolean;
  schema: { type: string; format?: string };
};
type Operation = {
  summary: string;
  security: { sessionCookie: never[] }[];
  parameters?: Parameter[];
  requestBody?: unknown;
  responses: Record<string, { description: string }>;
};
const paths: Record<string, Record<string, Operation>> = {};
function operation(path: string, method: string, summary: string, schema?: z.ZodType) {
  const parameters = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
  paths[path] ??= {};
  paths[path][method] = {
    summary,
    security: [{ sessionCookie: [] }],
    ...(parameters.length ? { parameters } : {}),
    ...(schema
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: z.toJSONSchema(schema) } },
          },
        }
      : {}),
    responses: {
      200: { description: 'Operación correcta' },
      201: { description: 'Registro creado' },
      401: { description: 'Sesión requerida' },
      403: { description: 'Sin permiso' },
      404: { description: 'No encontrado' },
      409: { description: 'Conflicto de estado o reintento' },
      422: { description: 'Validación fallida' },
    },
  };
}
for (const [path, label, schema] of [
  ['clients', 'Clientes', clientSchema],
  ['products', 'Productos', productSchema],
  ['users', 'Usuarios', userSchema],
  ['rates', 'Tasas', rateSchema],
  ['routes', 'Rutas', routeSchema],
  ['visits', 'Visitas', visitSchema],
  ['orders', 'Pedidos', orderSchema],
] as const) {
  operation('/api/v1/' + path, 'get', 'Listar ' + label);
  operation('/api/v1/' + path, 'post', 'Crear ' + label, schema);
}
operation('/api/v1/clients/{id}', 'get', 'Consultar cliente');
operation('/api/v1/clients/{id}', 'patch', 'Actualizar cliente', clientSchema);
operation(
  '/api/v1/clients/{id}/completion',
  'patch',
  'Completar cliente asignado y ubicación',
  completionSchema,
);
operation('/api/v1/products/{id}', 'patch', 'Actualizar producto', productSchema);
operation('/api/v1/users/{id}', 'patch', 'Actualizar cuenta', userUpdateSchema);
operation(
  '/api/v1/users/{id}/password',
  'post',
  'Restablecer contraseña',
  z.object({ password: z.string().min(10) }),
);
operation('/api/v1/orders/quote', 'post', 'Calcular resumen y versión de precios', quoteSchema);
operation('/api/v1/orders/{id}', 'get', 'Consultar pedido y partidas');
operation('/api/v1/orders/{id}/validate', 'post', 'Validar pedido y crear comanda');
operation('/api/v1/orders/{id}/cancel', 'post', 'Anular antes de preparación');
operation('/api/v1/commands', 'get', 'Listar comandas');
operation('/api/v1/commands/{id}/advance', 'post', 'Avanzar preparación');
operation(
  '/api/v1/visits/{id}/result',
  'post',
  'Registrar visita y programar seguimiento',
  visitResultSchema,
);
for (const name of ['dashboard', 'reports', 'sellers', 'audit', 'integration/a2'])
  operation('/api/v1/' + name, 'get', 'Consultar ' + name);
paths['/api/v1/clients'].get.parameters = ['q', 'page', 'active'].map((name) => ({
  name,
  in: 'query',
  schema: { type: 'string' },
}));
paths['/api/v1/reports'].get.parameters = ['from', 'to', 'sellerId'].map((name) => ({
  name,
  in: 'query',
  required: name !== 'sellerId',
  schema: { type: 'string' },
}));
paths['/api/v1/orders'].post.parameters = [
  {
    name: 'Idempotency-Key',
    in: 'header',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  },
];
operation(
  '/api/v1/routes/{id}',
  'patch',
  'Reorganizar una ruta sin visitas registradas',
  routeSchema,
);
operation('/api/v1/visits/{id}', 'get', 'Consultar visita');
operation('/api/v1/me', 'get', 'Consultar cuenta y permisos');
operation(
  '/api/v1/clients/{id}/account',
  'get',
  'Consultar estado de cuenta; responde 503 mientras a2 no esté configurado',
);
operation(
  '/api/v1/integration/a2/import-clients',
  'post',
  'Importar clientes; integración pendiente',
);
operation('/api/v1/clients/{id}/a2', 'post', 'Enviar alta de cliente; integración pendiente');
operation('/api/v1/orders/{id}/a2', 'post', 'Enviar pedido; integración pendiente');
export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'Briochett API',
    version: '1.0.0',
    description:
      'Gestión comercial. Importes decimales como cadenas; listas paginadas de 20 elementos. Los permisos se aplican en el servidor. Autenticación Better Auth en /api/auth/sign-in/username, /get-session, /sign-out y /change-password. El registro público está deshabilitado.',
  },
  servers: [{ url: 'https://api.briochettvzla.com' }],
  components: {
    securitySchemes: {
      sessionCookie: { type: 'apiKey', in: 'cookie', name: '__Secure-better-auth.session_token' },
    },
    schemas: {
      Currency: { type: 'string', enum: ['USD', 'COP', 'VES'] },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} },
          },
        },
      },
    },
  },
  paths,
};
