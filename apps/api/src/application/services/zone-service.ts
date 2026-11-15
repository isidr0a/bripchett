import type { ZoneInput } from '@briochett/contracts';
import type { Pagination, ZoneRepository } from '../ports';
import { fail } from '../../domain/errors';
import { now, uid } from '../../domain/primitives';

export class ZoneService {
  constructor(private readonly repository: ZoneRepository) {}
  list(page: Pagination, active: boolean, query: string) {
    return this.repository.list(page, active, query.toLowerCase().trim().slice(0, 100));
  }
  async requireActive(id: string) {
    const zone = await this.repository.find(id);
    if (!zone?.active) fail(422, 'ZONE_UNAVAILABLE', 'Selecciona una zona activa.');
    return zone;
  }
  async save(input: ZoneInput, existing?: string) {
    const id = existing ?? uid();
    const data = { ...input, name: input.name.replace(/\s+/gu, ' ') };
    if (!(await this.repository.save(id, data, data.name.toLowerCase(), now(), !!existing)))
      fail(404, 'ZONE_NOT_FOUND', 'No se encontró la zona.');
    return { id, ...data };
  }
}
