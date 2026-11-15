import { z } from 'zod';

export const trashTypes = [
  'users',
  'clients',
  'products',
  'rates',
  'routes',
  'visits',
  'orders',
] as const;
export const trashTypeSchema = z.enum(trashTypes);
export const deletionScopeSchema = z.enum(['date', 'upcoming']);
export type TrashType = z.infer<typeof trashTypeSchema>;
export type DeletionScope = z.infer<typeof deletionScopeSchema>;
export type TrashEntry = {
  id: string;
  type: TrashType;
  label: string;
  context: string | null;
  deletedAt: string;
  deletedByName: string;
};
export type DeletionResult = { affected: number };
