import type { PhotoChange, PhotoKind, SessionUser } from '@briochett/contracts';
import type { PhotoCollection, PhotoRepository, PhotoTarget } from '../../application/photo-ports';
import { D1Repository } from './d1-repository';

const tables = { products: 'products', clients: 'clients', users: 'user' } as const;
const entities = { products: 'producto', clients: 'cliente', users: 'usuario' } as const;

export class D1PhotoRepository extends D1Repository implements PhotoRepository {
  constructor(
    db: D1Database,
    private readonly actor: SessionUser,
  ) {
    super(db, actor.id);
  }

  private scope(kind: PhotoKind, write: boolean) {
    const { role, id } = this.actor;
    const args = [id, role];
    let sql = `t.deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM user actor WHERE actor.id=? AND actor.role=? AND actor.active=1
        AND actor.banned=0 AND actor.deleted_at IS NULL AND actor.mustChangePassword=0
    )`;
    if (kind === 'users') {
      sql += " AND t.role='vendedor'";
      if (role !== 'administracion') {
        sql += ' AND t.id=? AND t.active=1 AND t.banned=0';
        args.push(id);
      }
    } else if (role === 'vendedor') {
      sql += ' AND t.active=1';
      if (kind === 'clients') {
        sql += ' AND t.seller_id=?';
        args.push(id);
      }
    }
    if (write && role === 'supervision') sql += ' AND 0';
    return { sql, args };
  }

  find({ kind, id }: PhotoTarget) {
    const { sql, args } = this.scope(kind, false);
    return this.db
      .prepare(`SELECT t.photo_id AS photoId FROM ${tables[kind]} t WHERE t.id=? AND ${sql}`)
      .bind(id, ...args)
      .first<PhotoChange>();
  }

  async stage(id: string, collectAfter: string) {
    await this.db
      .prepare('INSERT INTO photo_files(id,collect_after) VALUES(?,?)')
      .bind(id, collectAfter)
      .run();
  }

  async activate({ kind, id }: PhotoTarget, expected: string | null, next: string | null) {
    const { sql, args } = this.scope(kind, true);
    const [changed] = await this.db.batch([
      this.db
        .prepare(
          `UPDATE ${tables[kind]} AS t SET photo_id=? WHERE t.id=? AND ${sql}
          AND t.photo_id IS ? AND (? IS NULL OR EXISTS (SELECT 1 FROM photo_files WHERE id=? AND claimed=0))`,
        )
        .bind(next, id, ...args, expected, next, next),
      this.auditIfChanged(next ? 'guardar_foto' : 'quitar_foto', entities[kind], id, {
        previousPhotoId: expected,
        photoId: next,
      }),
    ]);
    return Boolean(changed.meta.changes);
  }
}

export class D1PhotoCollection implements PhotoCollection {
  constructor(private readonly db: D1Database) {}

  async claimExpired(at: string) {
    const selected = await this.db
      .prepare(
        `UPDATE photo_files SET claimed=1 WHERE id IN (
        SELECT f.id FROM photo_files f WHERE f.collect_after<=?
          AND NOT EXISTS(SELECT 1 FROM products p WHERE p.photo_id=f.id)
          AND NOT EXISTS(SELECT 1 FROM clients c WHERE c.photo_id=f.id)
          AND NOT EXISTS(SELECT 1 FROM user u WHERE u.photo_id=f.id)
        ORDER BY f.collect_after,f.id LIMIT 200
      ) RETURNING id`,
      )
      .bind(at)
      .all<{ id: string }>();
    return selected.results.map(({ id }) => id);
  }

  async forget(id: string) {
    await this.db.prepare('DELETE FROM photo_files WHERE id=? AND claimed=1').bind(id).run();
  }
}
