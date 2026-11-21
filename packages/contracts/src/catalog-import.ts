import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);
const row = z.object({
  line: z.number().int().min(1).max(10000),
  code: text(40)
    .min(1)
    .transform((value) => value.toUpperCase()),
  name: text(150).min(2),
});

export function importRif(rif: string) {
  const normalized = rif.toUpperCase().replace(/[\s.-]/g, '');
  return /^[A-Z]?\d{5,16}$/.test(normalized) ? normalized : '';
}

export const importClientRow = row.extend({
  name: text(150)
    .refine((value) => value.length !== 1)
    .default(''),
  rif: text(30).transform(importRif),
  phone: text(40),
  address: text(300),
  active: z.boolean(),
});
export const importPriceRow = row.extend({
  price: z
    .string()
    .regex(/^\d{1,10}(\.\d{1,6})?$/)
    .refine((value) => Number(value) > 0),
});

const revision = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .optional();
const zoneAssignments = z.array(z.tuple([row.shape.code, text(128).min(1)])).max(1200);
export type ImportZoneAssignments = z.infer<typeof zoneAssignments>;
export const catalogImportSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('clients'),
      zoneId: text(128).min(1).optional(),
      classifyZones: z.boolean().optional(),
      zoneAssignments: zoneAssignments.optional(),
      rows: z.array(importClientRow).min(1).max(1200),
      revision,
    })
    .refine(
      (input) =>
        !(input.zoneId && input.classifyZones) &&
        (input.zoneAssignments === undefined || (input.classifyZones && input.revision)),
      'Elige un solo modo de asignación de zonas y confirma el resultado de la vista previa.',
    ),
  z.object({
    kind: z.literal('prices'),
    currency: z.enum(['USD', 'COP', 'VES']),
    rows: z.array(importPriceRow).min(1).max(1200),
    revision,
  }),
]);
export type CatalogImport = z.infer<typeof catalogImportSchema>;
export type CatalogImportKind = CatalogImport['kind'];
export type ImportClientRow = z.infer<typeof importClientRow>;
export type ImportPriceRow = z.infer<typeof importPriceRow>;

export type ImportDecision = {
  line: number;
  code: string;
  name: string;
  action: 'crear' | 'actualizar' | 'sin_cambios' | 'omitir';
  note: string;
};
export type CatalogImportSummary = {
  creates: number;
  updates: number;
  skipped: number;
  unchanged: number;
};
export type CatalogImportPreview = {
  revision: string;
  summary: CatalogImportSummary;
  decisions: ImportDecision[];
  rate?: string;
  zoneAssignments?: ImportZoneAssignments;
  zoneWarning?: string;
};
