import type { PhotoStorage } from '../../application/photo-ports';
import { fail } from '../../domain/errors';

const key = (id: string) => 'photos/' + id + '.webp';

export class R2PhotoStorage implements PhotoStorage {
  constructor(private readonly bucket?: R2Bucket) {}

  async get(id: string) {
    try {
      if (!this.bucket) throw new Error('R2');
      return (await this.bucket.get(key(id)))?.body ?? null;
    } catch {
      fail(503, 'PHOTO_STORAGE', 'No se pudo leer la foto. Vuelve a intentar.');
    }
  }

  async put(id: string, image: ArrayBuffer) {
    try {
      if (!this.bucket) throw new Error('R2');
      await this.bucket.put(key(id), image, { httpMetadata: { contentType: 'image/webp' } });
    } catch {
      fail(503, 'PHOTO_STORAGE', 'No se pudo guardar la foto. Vuelve a intentar.');
    }
  }

  async delete(id: string) {
    try {
      if (!this.bucket) throw new Error('R2');
      await this.bucket.delete(key(id));
    } catch {
      fail(503, 'PHOTO_STORAGE', 'No se pudo retirar la foto del almacenamiento.');
    }
  }
}
