import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { maxPhotoBytes, photoIdSchema, photoKinds, type PhotoKind } from '@briochett/contracts';
import { fail } from '../../../domain/errors';
import type { AppEnv } from '../types';
import { adminOnly, allow, salesOnly, viewRoles } from '../helpers';

const uploadLimit = bodyLimit({
  maxSize: maxPhotoBytes + 64 * 1024,
  onError: (c) =>
    c.json(
      { error: { code: 'PHOTO_SIZE', message: 'La foto debe pesar como máximo 10 MB.' } },
      413,
    ),
});
export const photoUploadPath = /^\/api\/v1\/(?:me|(?:products|clients|users)\/[^/]+)\/photo\/?$/;
export const photoController = new Hono<AppEnv>();

const getAccess = {
  clients: allow(...viewRoles),
  products: salesOnly,
  users: adminOnly,
  me: allow('vendedor'),
};
const changeAccess = {
  clients: salesOnly,
  products: adminOnly,
  users: adminOnly,
  me: getAccess.me,
};

function version(value: unknown) {
  if (value === '' || value === undefined || value === null) return null;
  const parsed = photoIdSchema.safeParse(value);
  if (!parsed.success) fail(422, 'PHOTO_VERSION', 'La versión de la foto no es válida.');
  return parsed.data;
}

for (const resource of [...photoKinds, 'me'] as const) {
  const profile = resource === 'me';
  const kind: PhotoKind = profile ? 'users' : resource;
  const path = profile ? '/me/photo' : '/' + resource + '/:id/photo';
  photoController.get(path, getAccess[resource], async (c) => {
    const id = profile ? c.get('user').id : c.req.param('id')!;
    const image = await c
      .get('services')
      .photos.get({ kind, id }, version(c.req.query('v')) ?? undefined);
    return c.body(image, 200, {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, no-store',
    });
  });
  photoController.post(path, changeAccess[resource], uploadLimit, async (c) => {
    const id = profile ? c.get('user').id : c.req.param('id')!;
    if (!/^multipart\/form-data(?:\s*;|$)/i.test(c.req.header('Content-Type') || ''))
      fail(415, 'PHOTO_CONTENT_TYPE', 'Envía la foto como archivo.');
    const form = await c.req.formData().catch(() => null);
    const file = form?.get('file');
    if (!form || !(file instanceof File) || form.getAll('file').length !== 1)
      fail(422, 'PHOTO_FILE', 'Selecciona una foto.');
    return c.json(
      await c
        .get('services')
        .photos.upload({ kind, id }, version(form.get('expectedPhotoId')), file),
    );
  });
  photoController.delete(path, changeAccess[resource], async (c) => {
    const id = profile ? c.get('user').id : c.req.param('id')!;
    return c.json(
      await c.get('services').photos.remove({ kind, id }, version(c.req.query('expectedPhotoId'))),
    );
  });
}
