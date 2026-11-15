import type { Zone, ZoneInput } from '@briochett/contracts';
import type { Pagination, ZoneRepository } from '../../application/ports';
import { D1Repository, count } from './d1-repository';

type ZoneRow = Omit<Zone, 'active'> & { active: number };
const map = (row: ZoneRow): Zone => ({ ...row, active: !!row.active });

export class D1ZoneRepository extends D1Repository implements ZoneRepository {
  async list({ page, pageSize, offset }: Pagination, active: boolean, search: string) {
    const where =
      ' WHERE deleted_at IS NULL' +
      (active ? ' AND active=1' : '') +
      (search ? ' AND instr(name_key,?)>0' : '');
    const args = search ? [search] : [];
    const [list, total] = await this.db.batch([
      this.db
        .prepare(
          'SELECT id,name,active FROM zones' + where + ' ORDER BY name_key,id LIMIT ? OFFSET ?',
        )
        .bind(...args, pageSize, offset),
      this.db.prepare('SELECT count(*) total FROM zones' + where).bind(...args),
    ]);
    return { items: (list.results as ZoneRow[]).map(map), total: count(total), page, pageSize };
  }
  async find(id: string) {
    const row = await this.db
      .prepare('SELECT id,name,active FROM zones WHERE id=? AND deleted_at IS NULL')
      .bind(id)
      .first<ZoneRow>();
    return row ? map(row) : null;
  }
  async save(id: string, { name, active }: ZoneInput, key: string, at: string, editing: boolean) {
    const statement = editing
      ? this.db
          .prepare(
            'UPDATE zones SET name=?,name_key=?,active=?,updated_at=? WHERE id=? AND deleted_at IS NULL RETURNING id',
          )
          .bind(name, key, +active, at, id)
      : this.db
          .prepare(
            'INSERT INTO zones(id,name,name_key,active,created_at,updated_at) VALUES(?,?,?,?,?,?) RETURNING id',
          )
          .bind(id, name, key, +active, at, at);
    const [result] = await this.db.batch([
      statement,
      this.auditIfChanged(editing ? 'actualizar' : 'crear', 'zona', id),
    ]);
    return result.results.length > 0;
  }
}
