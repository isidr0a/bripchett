import { z } from 'zod';

export const photoKinds = ['products', 'clients', 'users'] as const;
export type PhotoKind = (typeof photoKinds)[number];
export const maxPhotoBytes = 10 * 1024 * 1024;
export const photoIdSchema = z.uuid();
export const photoChangeSchema = z.object({ photoId: photoIdSchema.nullable() });
export type PhotoChange = z.infer<typeof photoChangeSchema>;
export const photoPickerAccept =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
