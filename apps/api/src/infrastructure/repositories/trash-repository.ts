import {
  trashTypes,
  type DeletionScope,
  type TrashEntry,
  type TrashType,
} from '@briochett/contracts';
import type { Pagination, RestoreVisit, TrashRepository } from '../../application/ports';
import { D1Repository, count } from './d1-repository';

const resources = {
  zones: { table: 'zones', label: 't.name', context: 'NULL', entity: 'zona' },
  users: { table: 'user', label: 't.name', context: 't.username', entity: 'usuario' },
  clients: { table: 'clients', label: 't.name', context: 't.code', entity: 'cliente' },
  products: { table: 'products', label: 't.name', context: 't.sku', entity: 'producto' },
  rates: { table: 'exchange_rates', label: 't.currency', context: 't.rate', entity: 'tasa' },
  routes: { table: 'routes', label: 't.name', context: 't.date', entity: 'ruta' },
  visits: {
    table: 'visits',
    label: '(SELECT name FROM clients WHERE id=t.client_id)',
    context: 't.scheduled_at',
    entity: 'visita',
  },
  orders: {
    table: 'orders',
    label: "'Pedido #' || t.number",
    context: '(SELECT name FROM clients WHERE id=t.client_id)',
    entity: 'pedido',
  },
} as const;

export class D1TrashRepository extends D1Repository implements TrashRepository {
  async list({ page, pageSize, offset }: Pagination, filter?: TrashType) {
    const types = filter ? [filter] : trashTypes;
    const source = (type: TrashType) => {
      const { table, label, context } = resources[type];
      const where =
        't.deleted_at IS NOT NULL' + (type === 'visits' ? ' AND t.deleted_with_route=0' : '');
      return {
        rows: `SELECT t.id,'${type}' type,${label} label,${context} context,t.deleted_at deletedAt,t.deleted_by deletedBy FROM ${table} t WHERE ${where}`,
        count: this.db.prepare(`SELECT count(*) total FROM ${table} t WHERE ${where}`),
      };
    };
    const queries = types.map(source);
    // Anida los grupos para no superar el límite de términos por SELECT compuesto de D1.
    const combine = (rows: string[]): string =>
      rows.length <= 4
        ? rows.join(' UNION ALL ')
        : 'SELECT * FROM (' +
          combine(rows.slice(0, 4)) +
          ') UNION ALL SELECT * FROM (' +
          combine(rows.slice(4)) +
          ')';
    const [list, ...totals] = await this.db.batch([
      this.db
        .prepare(
          `SELECT d.id,d.type,d.label,d.context,d.deletedAt,u.name deletedByName FROM (${combine(queries.map((q) => q.rows))}) d JOIN user u ON u.id=d.deletedBy ORDER BY d.deletedAt DESC,d.type,d.id LIMIT ? OFFSET ?`,
        )
        .bind(pageSize, offset),
      ...queries.map((q) => q.count),
    ]);
    return {
      items: list.results as TrashEntry[],
      total: totals.reduce((sum, result) => sum + count(result), 0),
      page,
      pageSize,
    };
  }

  async remove(type: TrashType, id: string, scope: DeletionScope, at: string) {
    const { table } = resources[type];
    const existing = await this.db
      .prepare(`SELECT deleted_at FROM ${table} WHERE id=?`)
      .bind(id)
      .first<{ deleted_at: string | null }>();
    if (!existing) return null;
    if (existing.deleted_at) return 0;
    const where =
      type === 'routes' && scope === 'upcoming'
        ? `(id=? OR (series_id=(SELECT series_id FROM routes WHERE id=?) AND date>=(SELECT date FROM routes WHERE id=?)))
         AND NOT EXISTS(SELECT 1 FROM visits WHERE route_id=routes.id AND status<>'programada')`
        : 'id=?';
    const args = type === 'routes' && scope === 'upcoming' ? [id, id, id] : [id];
    const { results } = await this.db
      .prepare(
        `UPDATE ${table} SET deleted_at=?,deleted_by=? WHERE deleted_at IS NULL AND ${where} RETURNING id`,
      )
      .bind(at, this.actorId, ...args)
      .all<{ id: string }>();
    return results.length;
  }

  async restoreVisits(type: 'routes' | 'visits', id: string) {
    const where =
      type === 'routes' ? 'route_id=? AND deleted_with_route=1' : 'id=? AND deleted_with_route=0';
    return (
      await this.db
        .prepare(
          `SELECT id,client_id clientId,seller_id sellerId,scheduled_at scheduledAt FROM visits WHERE deleted_at IS NOT NULL AND ${where}`,
        )
        .bind(id)
        .all<RestoreVisit>()
    ).results;
  }

  async restore(type: TrashType, id: string, clientVersions: Record<string, string>) {
    const { table, entity } = resources[type];
    const visitCondition =
      type === 'routes' ? 'v.route_id=routes.id AND v.deleted_with_route=1' : 'v.id=visits.id';
    const guard =
      type === 'routes' || type === 'visits'
        ? ` AND NOT EXISTS(SELECT 1 FROM visits v JOIN clients c ON c.id=v.client_id WHERE ${visitCondition} AND NOT EXISTS(SELECT 1 FROM json_each(?) snap WHERE snap.key=c.id AND snap.value=c.updated_at))`
        : '';
    const args = guard ? [JSON.stringify(clientVersions)] : [];
    const position =
      type === 'visits'
        ? ',route_position=CASE WHEN route_id IS NULL THEN NULL ELSE (SELECT coalesce(max(v.route_position)+1,0) FROM visits v WHERE v.route_id=visits.route_id AND v.deleted_at IS NULL) END'
        : '';
    const [update] = await this.db.batch([
      this.db
        .prepare(
          `UPDATE ${table} SET deleted_at=NULL,deleted_by=NULL${position} WHERE id=? AND deleted_at IS NOT NULL${type === 'visits' ? ' AND deleted_with_route=0' : ''}${guard}`,
        )
        .bind(id, ...args),
      this.db
        .prepare(
          "INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,created_at) SELECT lower(hex(randomblob(16))),?,'restaurar',?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE changes()>0",
        )
        .bind(this.actorId, entity, id),
    ]);
    return !!update.meta.changes;
  }
}
