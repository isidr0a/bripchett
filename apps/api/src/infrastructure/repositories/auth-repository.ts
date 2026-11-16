import type { SessionUser } from '@briochett/contracts';

type SessionRow = Omit<SessionUser, 'active' | 'mustChangePassword'> & {
  active: number;
  banned: number;
  mustChangePassword: number;
};
export class D1AuthRepository {
  constructor(private readonly db: D1Database) {}
  async sessionUser(id: string): Promise<SessionUser | null> {
    const row = await this.db
      .prepare(
        "SELECT id,name,email,username,role,active,banned,mustChangePassword,CASE WHEN role='vendedor' THEN photo_id END photoId FROM user WHERE id=? AND deleted_at IS NULL",
      )
      .bind(id)
      .first<SessionRow>();
    if (!row?.active || row.banned) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      username: row.username,
      role: row.role,
      active: !!row.active,
      mustChangePassword: !!row.mustChangePassword,
      photoId: row.photoId,
    };
  }
  async passwordChanged(id: string) {
    await this.db
      .prepare('UPDATE user SET mustChangePassword=0 WHERE id=? AND deleted_at IS NULL')
      .bind(id)
      .run();
  }
  async initialized() {
    return !!(await this.db.prepare('SELECT id FROM user LIMIT 1').first());
  }
  async lockBootstrap() {
    await this.db.prepare('INSERT INTO bootstrap_lock(id) VALUES(1)').run();
  }
  async releaseFailedBootstrap() {
    await this.db.prepare('DELETE FROM bootstrap_lock WHERE NOT EXISTS(SELECT 1 FROM user)').run();
  }
}
