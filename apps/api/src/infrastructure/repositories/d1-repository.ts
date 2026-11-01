import { now, uid } from '../../domain/primitives';

export class D1Repository {
  constructor(
    protected readonly db: D1Database,
    protected readonly actorId: string,
  ) {}

  protected audit(action: string, entity: string, id: string, details: unknown = {}) {
    return this.db
      .prepare(
        'INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .bind(uid(), this.actorId, action, entity, id, JSON.stringify(details), now());
  }
}

export function count(result: D1Result<unknown>) {
  return (result.results[0] as { total: number } | undefined)?.total || 0;
}
