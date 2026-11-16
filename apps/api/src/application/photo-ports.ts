import type { PhotoChange, PhotoKind } from '@briochett/contracts';

export type PhotoTarget = { kind: PhotoKind; id: string };
export interface PhotoRepository {
  find(target: PhotoTarget): Promise<PhotoChange | null>;
  stage(id: string, collectAfter: string): Promise<void>;
  activate(target: PhotoTarget, expected: string | null, next: string | null): Promise<boolean>;
}

export interface PhotoCollection {
  claimExpired(at: string): Promise<string[]>;
  forget(id: string): Promise<void>;
}

export interface PhotoStorage {
  get(id: string): Promise<ReadableStream<Uint8Array> | null>;
  put(id: string, image: ArrayBuffer): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface PhotoProcessor {
  optimize(file: Blob): Promise<ArrayBuffer>;
}
