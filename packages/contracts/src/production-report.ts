import { z } from 'zod';

export const productionStates = ['open', 'pendiente', 'en_preparacion', 'listo', 'all'] as const;
export const productionOptionTypes = ['zone', 'route', 'client'] as const;
const stateSchema = z.enum(productionStates);
const optionTypeSchema = z.enum(productionOptionTypes);

export const productionFiltersSchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    state: stateSchema.default('open'),
    zone: z
      .string()
      .max(800)
      .regex(/^(pending|(?:zone|legacy):.+)$/u)
      .optional(),
    route: z
      .string()
      .max(140)
      .regex(/^(none|(?:route|series):.+)$/u)
      .optional(),
    clientId: z.string().min(1).max(128).optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    path: ['to'],
    message: 'La fecha final debe ser igual o posterior a la inicial.',
  });
export const productionOptionsQuerySchema = productionFiltersSchema.and(
  z.object({
    type: optionTypeSchema,
    q: z.string().trim().max(100).default(''),
  }),
);

export const productionOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});
const quantity = z.number().int().nonnegative();
export const productionReportSchema = z.object({
  totals: z.object({ units: quantity, products: quantity, commands: quantity }),
  items: z.array(
    z.object({
      productId: z.string(),
      sku: z.string(),
      name: z.string(),
      units: quantity,
      commands: quantity,
    }),
  ),
});
export const productionOptionsPageSchema = z.object({
  items: z.array(productionOptionSchema),
  total: quantity,
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type ProductionState = z.infer<typeof stateSchema>;
export type ProductionFilters = z.infer<typeof productionFiltersSchema>;
export type ProductionOptionsQuery = z.infer<typeof productionOptionsQuerySchema>;
export type ProductionOptionType = z.infer<typeof optionTypeSchema>;
export type ProductionOption = z.infer<typeof productionOptionSchema>;
export type ProductionReport = z.infer<typeof productionReportSchema>;

export const productionStateLabels: Record<ProductionState, string> = {
  open: 'Pendientes y en preparación',
  pendiente: 'Pendientes',
  en_preparacion: 'En preparación',
  listo: 'Listas',
  all: 'Todas las vigentes',
};
