import type { PhotoProcessor } from '../../application/photo-ports';
import { fail } from '../../domain/errors';

const formats = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const heicBrands = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
const boxType = (v: DataView, i: number) =>
  String.fromCharCode(v.getUint8(i), v.getUint8(i + 1), v.getUint8(i + 2), v.getUint8(i + 3));

function supportedSignature(bytes: ArrayBuffer) {
  const v = new DataView(bytes);
  if (v.byteLength < 12) return false;
  if (v.getUint16(0) === 0xffd8 && v.getUint8(2) === 0xff) return true;
  if (v.getUint32(0) === 0x89504e47 && v.getUint32(4) === 0x0d0a1a0a) return true;
  if (boxType(v, 0) === 'RIFF' && boxType(v, 8) === 'WEBP') return true;
  const length = v.getUint32(0);
  if (boxType(v, 4) !== 'ftyp' || length < 16 || length > v.byteLength) return false;
  if (heicBrands.has(boxType(v, 8))) return true;
  for (let i = 16; i + 4 <= length; i += 4) if (heicBrands.has(boxType(v, i))) return true;
  return false;
}

export function isStaticPhotoWebp(bytes: ArrayBuffer) {
  const v = new DataView(bytes);
  if (
    v.byteLength < 20 ||
    boxType(v, 0) !== 'RIFF' ||
    boxType(v, 8) !== 'WEBP' ||
    v.getUint32(4, true) + 8 !== v.byteLength
  )
    return false;
  let i = 12;
  let hasFrame = false;
  while (i + 8 <= v.byteLength) {
    const type = boxType(v, i);
    const size = v.getUint32(i + 4, true);
    if (['ANIM', 'ANMF', 'EXIF', 'XMP '].includes(type)) return false;
    if (type === 'VP8 ' || type === 'VP8L') hasFrame = size > 0;
    i += 8 + size + (size % 2);
  }
  return i === v.byteLength && hasFrame;
}

export class WorkerPhotoProcessor implements PhotoProcessor {
  constructor(private readonly images?: ImagesBinding) {}

  async optimize(file: Blob) {
    if (!supportedSignature(await file.slice(0, 4096).arrayBuffer()))
      fail(422, 'PHOTO_FORMAT', 'Usa una imagen JPG, PNG, WebP o HEIC.');
    const images = this.images;
    if (!images) fail(503, 'PHOTO_PROCESSOR', 'El procesamiento de fotos no está disponible.');
    const optimized = await (async () => {
      try {
        const info = await images.info(file.stream());
        if (!formats.has(info.format) || !('width' in info)) return null;
        if (info.width < 1 || info.height < 1 || info.width * info.height > 100_000_000)
          return null;
        const image = await images
          .input(file.stream())
          .transform({ width: 1024, height: 1024, fit: 'scale-down' })
          .output({ format: 'image/webp', quality: 80, anim: false });
        const response = image.response();
        if (!response.ok) throw new Error('PHOTO_TRANSFORM_RESPONSE');
        return await response.arrayBuffer();
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        if (code === 9412 || code === 9406) return null;
        fail(503, 'PHOTO_PROCESSOR', 'No se pudo procesar la foto. Vuelve a intentar.');
      }
    })();
    if (!optimized) fail(422, 'PHOTO_INVALID', 'El archivo no se pudo abrir como imagen.');
    if (!isStaticPhotoWebp(optimized))
      fail(503, 'PHOTO_PROCESSOR', 'No se pudo generar una foto optimizada válida.');
    return optimized;
  }
}
