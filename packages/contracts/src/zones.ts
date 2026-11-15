import { z } from 'zod';

export const zoneIdSchema = z.string().min(1).max(128);
export const zoneSchema = z.object({
  name: z.string().trim().min(1).max(100),
  active: z.boolean().default(true),
});
export const visitDaysSchema = z
  .array(z.number().int().min(0).max(6))
  .max(7)
  .refine((days) => new Set(days).size === days.length, 'Selecciona cada día una sola vez.');
export const allVisitDays = [1, 2, 3, 4, 5, 6, 0] as const;
export type ZoneInput = z.infer<typeof zoneSchema>;
export type Zone = ZoneInput & { id: string };
export type ZoneImpact = {
  revision: string;
  stops: {
    visitId: string;
    routeId: string;
    routeName: string;
    scheduledAt: string;
    archivesRoute: number;
  }[];
};
