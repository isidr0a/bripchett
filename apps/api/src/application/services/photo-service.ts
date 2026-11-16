import { maxPhotoBytes, type PhotoChange } from '@briochett/contracts';
import { ApplicationError, fail } from '../../domain/errors';
import { now, uid } from '../../domain/primitives';
import type {
  PhotoCollection,
  PhotoProcessor,
  PhotoRepository,
  PhotoStorage,
  PhotoTarget,
} from '../photo-ports';

export class PhotoService {
  constructor(
    private readonly repository: PhotoRepository,
    private readonly storage: PhotoStorage,
    private readonly processor: PhotoProcessor,
  ) {}

  private async current(target: PhotoTarget) {
    const current = await this.repository.find(target);
    if (!current) fail(404, 'PHOTO_TARGET', 'La ficha no está disponible en tu alcance.');
    return current;
  }

  private checkVersion(current: PhotoChange, expected: string | null) {
    if (current.photoId !== expected)
      fail(
        409,
        'PHOTO_CHANGED',
        'La foto cambió. Revisa la imagen vigente antes de reintentar.',
        current,
      );
  }

  async get(target: PhotoTarget, version?: string) {
    const { photoId } = await this.current(target);
    if (!photoId || (version && version !== photoId))
      fail(404, 'PHOTO_NOT_FOUND', 'La ficha no tiene esa foto.');
    const image = await this.storage.get(photoId);
    if (!image) fail(503, 'PHOTO_STORAGE', 'La foto no está disponible en este momento.');
    return image;
  }

  async upload(target: PhotoTarget, expected: string | null, file: Blob): Promise<PhotoChange> {
    this.checkVersion(await this.current(target), expected);
    if (!file.size) fail(422, 'PHOTO_INVALID', 'Selecciona una imagen válida.');
    if (file.size > maxPhotoBytes) fail(413, 'PHOTO_SIZE', 'La foto debe pesar como máximo 10 MB.');
    const image = await this.processor.optimize(file);
    const photoId = uid();
    await this.repository.stage(photoId, new Date(Date.now() + 86_400_000).toISOString());
    await this.storage.put(photoId, image);
    if (!(await this.repository.activate(target, expected, photoId))) {
      this.checkVersion(await this.current(target), expected);
      fail(409, 'PHOTO_CHANGED', 'La carga caducó. Vuelve a intentar.');
    }
    return { photoId };
  }

  async remove(target: PhotoTarget, expected: string | null): Promise<PhotoChange> {
    const current = await this.current(target);
    if (!current.photoId) return current;
    this.checkVersion(current, expected);
    if (!(await this.repository.activate(target, expected, null))) {
      const latest = await this.current(target);
      this.checkVersion(latest, expected);
      fail(409, 'PHOTO_CHANGED', 'La foto cambió. Revisa la ficha antes de reintentar.', latest);
    }
    return { photoId: null };
  }
}

export async function collectPhotos(repository: PhotoCollection, storage: PhotoStorage) {
  for (const id of await repository.claimExpired(now())) {
    try {
      await storage.delete(id);
      await repository.forget(id);
    } catch (error) {
      console.error('photo_cleanup_failed', {
        id,
        code: error instanceof ApplicationError ? error.code : 'UNKNOWN',
      });
    }
  }
}
