import { z } from 'zod';

export const roles = ['administracion', 'vendedor', 'preparacion', 'supervision'] as const;
export type Role = (typeof roles)[number];
export const roleLabels: Record<Role, string> = {
  administracion: 'Administración',
  vendedor: 'Vendedor',
  preparacion: 'Preparación',
  supervision: 'Supervisión',
};
export const currencies = ['USD', 'COP', 'VES'] as const;
export type Currency = (typeof currencies)[number];
export const currencySchema = z.enum(currencies);
export const orderStatuses = [
  'pendiente',
  'validado',
  'en_preparacion',
  'listo',
  'anulado',
] as const;
export const statusLabels: Record<string, string> = {
  pendiente: 'Pendiente de validación',
  validado: 'Validado',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  anulado: 'Anulado',
  programada: 'Programada',
  con_pedido: 'Con pedido',
  sin_pedido: 'Sin pedido',
  semanal: 'Semanal',
  quincenal: 'Quincenal',
  mensual: 'Mensual',
};
export const geoSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000),
  capturedAt: z.iso.datetime(),
  confirmed: z.literal(true),
});
export type GeoPoint = z.infer<typeof geoSchema>;
export const slotSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine((v) => v.start < v.end, 'El horario de cierre debe ser posterior al de inicio.');
export const clientSchema = z.object({
  name: z.string().trim().min(2).max(150),
  rif: z.string().trim().max(30).default(''),
  contact: z.string().trim().max(100).default(''),
  phone: z.string().trim().max(40).default(''),
  address: z.string().trim().max(300).default(''),
  zone: z.string().trim().max(100).default(''),
  sellerId: z.string().min(1).nullable().default(null),
  active: z.boolean().default(true),
  geo: geoSchema.nullable().default(null),
  slots: z.array(slotSchema).max(21).default([]),
  recurrence: z.enum(['semanal', 'quincenal', 'mensual']).default('semanal'),
  recurrenceStart: z.iso.date(),
});
export const completionSchema = clientSchema
  .pick({ name: true, rif: true, contact: true, phone: true, address: true, geo: true })
  .refine(
    (v) => !!v.rif && !!v.contact && !!v.phone && !!v.address && !!v.geo,
    'Completa identificación, contacto, teléfono, dirección y GPS.',
  );
export type ClientInput = z.infer<typeof clientSchema>;
export type Client = ClientInput & {
  id: string;
  code: string;
  sellerName: string | null;
  updatedAt: string;
  geoUpdatedBy?: string | null;
};
export function clientMissing(
  c: Pick<ClientInput, 'name' | 'rif' | 'contact' | 'phone' | 'address' | 'geo'>,
): string[] {
  return [
    ['nombre', c.name],
    ['RIF', c.rif],
    ['contacto', c.contact],
    ['teléfono', c.phone],
    ['dirección', c.address],
    ['ubicación GPS', c.geo],
  ]
    .filter(([, v]) => !v || (typeof v === 'string' && !v.trim()))
    .map(([k]) => String(k));
}
const decimalString = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,6})?$/, 'Ingresa un número positivo con hasta 6 decimales.')
  .refine((v) => Number(v) > 0, 'El valor debe ser mayor que cero.');
export const productSchema = z.object({
  name: z.string().trim().min(2).max(150),
  sku: z.string().trim().min(1).max(40),
  priceUsd: z
    .string()
    .regex(/^\d{1,7}(\.\d{1,2})?$/)
    .refine((v) => Number(v) > 0),
  active: z.boolean().default(true),
});
export type Product = z.infer<typeof productSchema> & { id: string; updatedAt: string };
export const rateSchema = z.object({ currency: z.enum(['COP', 'VES']), rate: decimalString });
export type Rate = {
  id: string;
  currency: Currency;
  rate: string;
  createdAt: string;
  createdBy: string;
};
export const userSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  role: z.enum(roles),
  password: z.string().min(10).max(128),
});
export const userUpdateSchema = userSchema
  .pick({ name: true, email: true, role: true })
  .extend({ active: z.boolean() });
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
};
export const quoteSchema = z
  .object({
    clientId: z.string().min(1),
    currency: currencySchema,
    items: z
      .array(
        z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(100000) }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (v) => new Set(v.items.map((i) => i.productId)).size === v.items.length,
    'No repitas productos.',
  );
export const orderSchema = quoteSchema.extend({
  quoteVersion: z.string().min(1),
  notes: z.string().trim().max(1000).default(''),
  visitId: z.string().nullable().optional(),
});
export type QuoteInput = z.infer<typeof quoteSchema>;
export type QuoteLine = {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  priceUsd: string;
  unitPrice: string;
  subtotal: string;
};
export type Quote = {
  clientId: string;
  currency: Currency;
  rate: string;
  rateId: string | null;
  items: QuoteLine[];
  total: string;
  totalUsd: string;
  units: number;
  version: string;
};
export type Order = {
  id: string;
  number: number;
  clientId: string;
  clientName: string;
  authorId: string;
  authorName: string;
  currency: Currency;
  rate: string;
  total: string;
  totalUsd: string;
  status: (typeof orderStatuses)[number];
  createdAt: string;
  notes: string;
  items?: QuoteLine[];
  clientSnapshot?: Client;
  syncStatus: string;
};
export const routeSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    sellerId: z.string().min(1),
    date: z.iso.date(),
    stops: z
      .array(
        z.object({
          clientId: z.string().min(1),
          time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (v) => new Set(v.stops.map((s) => s.clientId)).size === v.stops.length,
    'No repitas clientes en la ruta.',
  );
export const visitSchema = z.object({
  clientId: z.string().min(1),
  scheduledAt: z.iso.datetime(),
  routeId: z.string().nullable().optional(),
});
export const visitResultSchema = z
  .object({
    result: z.enum(['con_pedido', 'sin_pedido']),
    notes: z.string().trim().max(1000),
    orderId: z.string().nullable().optional(),
    nextAt: z.iso.datetime().nullable().optional(),
  })
  .refine(
    (v) => v.result !== 'con_pedido' || !!v.orderId,
    'Relaciona un pedido para registrar esta visita con pedido.',
  );
export type Visit = {
  id: string;
  clientId: string;
  clientName: string;
  sellerId: string;
  sellerName: string;
  scheduledAt: string;
  status: 'programada' | 'con_pedido' | 'sin_pedido';
  notes: string;
  orderId: string | null;
  routeId: string | null;
};
export type Route = {
  id: string;
  name: string;
  date: string;
  sellerId: string;
  sellerName: string;
  stops: { clientId: string; clientName: string; time: string; visitId: string }[];
};
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export type ApiError = { error: { code: string; message: string; details?: unknown } };
export type CompletionInput = z.infer<typeof completionSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type RateInput = z.infer<typeof rateSchema>;
export type UserInput = z.infer<typeof userSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type RouteInput = z.infer<typeof routeSchema>;
export type VisitInput = z.infer<typeof visitSchema>;
export type VisitResultInput = z.infer<typeof visitResultSchema>;
export type NamedUser = { id: string; name: string };
export type CommandStatus = 'pendiente' | 'en_preparacion' | 'listo';
export type Command = {
  id: string;
  orderId: string;
  status: CommandStatus;
  createdAt: string;
  number: number;
  clientName: string;
  notes: string;
  items: { name: string; sku: string; quantity: number }[];
};
export type Dashboard = {
  clients: number;
  orders: number;
  pending: number;
  visits: number;
  scheduled: number;
  commands: number;
};
export type ReportInput = { from: string; to: string; sellerId?: string };
export type Report = Omit<ReportInput, 'sellerId'> & {
  sellerId: string | null;
  totals: { currency: Currency; orders: number; total: string }[];
  states: { status: Order['status']; total: number }[];
  visits: { status: Visit['status']; total: number }[];
  totalUsd: string;
  generatedAt: string;
};
export type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actorName: string;
};
export const moduleAccess: Record<Role, string[]> = {
  administracion: [
    'dashboard',
    'pedidos',
    'comandas',
    'rutas',
    'clientes',
    'productos',
    'usuarios',
    'reportes',
    'configuracion',
  ],
  vendedor: ['dashboard', 'pedidos', 'rutas', 'clientes', 'productos'],
  preparacion: ['comandas'],
  supervision: ['dashboard', 'pedidos', 'comandas', 'rutas', 'clientes', 'reportes'],
};
export function money(value: string | number, currency: Currency = 'USD') {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}
