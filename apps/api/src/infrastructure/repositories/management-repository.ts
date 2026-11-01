import type {
  AuditEntry,
  Currency,
  Dashboard,
  NamedUser,
  Order,
  SessionUser,
  UserUpdateInput,
  Visit,
} from '@briochett/contracts';
import type { ManagementRepository, Pagination, ReportRange } from '../../application/ports';
import { major } from '../../domain/pricing';
import { now } from '../../domain/primitives';
import { D1Repository, count } from './d1-repository';

type UserRow = Omit<SessionUser, 'active' | 'mustChangePassword'> & {
  active: number;
  mustChangePassword: number;
};
type Counts = { total: number; pending?: number; scheduled?: number };
const userSelect = 'SELECT id,name,email,username,role,active,mustChangePassword FROM user';
const mapUser = (row: UserRow): SessionUser => ({
  ...row,
  active: !!row.active,
  mustChangePassword: !!row.mustChangePassword,
});

export class D1ManagementRepository extends D1Repository implements ManagementRepository {
  async listUsers({ page, pageSize, offset }: Pagination) {
    const [list, total] = await this.db.batch([
      this.db.prepare(userSelect + ' ORDER BY name LIMIT ? OFFSET ?').bind(pageSize, offset),
      this.db.prepare('SELECT count(*) total FROM user'),
    ]);
    return { items: (list.results as UserRow[]).map(mapUser), total: count(total), page, pageSize };
  }
  async listSellers() {
    const result = await this.db
      .prepare(
        "SELECT id,name FROM user WHERE role='vendedor' AND active=1 AND banned=0 ORDER BY name",
      )
      .all<NamedUser>();
    return result.results;
  }
  async findUser(id: string) {
    const row = await this.db
      .prepare(userSelect + ' WHERE id=?')
      .bind(id)
      .first<UserRow>();
    return row ? mapUser(row) : null;
  }
  async recordUserCreation(id: string) {
    await this.audit('crear', 'usuario', id).run();
  }
  async updateUser(id: string, d: UserUpdateInput, previousRole: string) {
    await this.db.batch([
      this.db
        .prepare('UPDATE user SET name=?,email=?,role=?,active=?,banned=?,updatedAt=? WHERE id=?')
        .bind(d.name, d.email.toLowerCase(), d.role, +d.active, +!d.active, Date.now(), id),
      this.db
        .prepare(
          'DELETE FROM session WHERE userId=? AND (?=0 OR ?<>(SELECT role FROM user WHERE id=?))',
        )
        .bind(id, +d.active, previousRole, id),
      this.audit('actualizar', 'usuario', id, { role: d.role, active: d.active }),
    ]);
  }
  async requirePasswordChange(id: string) {
    await this.db.batch([
      this.db.prepare('UPDATE user SET mustChangePassword=1 WHERE id=?').bind(id),
      this.db.prepare('DELETE FROM session WHERE userId=?').bind(id),
      this.audit('restablecer_contrasena', 'usuario', id),
    ]);
  }
  async dashboard(sellerId?: string): Promise<Dashboard> {
    const own = !!sellerId,
      args = sellerId ? [sellerId] : [];
    const [clients, orders, visits, commands] = await this.db.batch<Counts>([
      this.db
        .prepare(
          'SELECT count(*) total FROM clients WHERE active=1' + (own ? ' AND seller_id=?' : ''),
        )
        .bind(...args),
      this.db
        .prepare(
          "SELECT count(*) total,sum(CASE WHEN status='pendiente' THEN 1 ELSE 0 END) pending FROM orders" +
            (own ? ' WHERE author_id=?' : ''),
        )
        .bind(...args),
      this.db
        .prepare(
          "SELECT count(*) total,sum(CASE WHEN status='programada' THEN 1 ELSE 0 END) scheduled FROM visits" +
            (own ? ' WHERE seller_id=?' : ''),
        )
        .bind(...args),
      this.db
        .prepare(
          "SELECT count(*) total FROM commands k JOIN orders o ON o.id=k.order_id WHERE k.status<>'listo' AND o.status<>'anulado'" +
            (own ? ' AND o.author_id=?' : ''),
        )
        .bind(...args),
    ]);
    return {
      clients: count(clients),
      orders: count(orders),
      pending: orders.results[0]?.pending || 0,
      visits: count(visits),
      scheduled: visits.results[0]?.scheduled || 0,
      commands: count(commands),
    };
  }
  async report({ from, to, start, end, sellerId }: ReportRange) {
    const orderWhere = 'created_at>=? AND created_at<?' + (sellerId ? ' AND author_id=?' : '');
    const visitWhere = 'scheduled_at>=? AND scheduled_at<?' + (sellerId ? ' AND seller_id=?' : '');
    const args = [start, end, ...(sellerId ? [sellerId] : [])];
    const [totals, states, visits, usd] = await this.db.batch([
      this.db
        .prepare(
          "SELECT currency,count(*) orders,sum(total_minor) total FROM orders WHERE status<>'anulado' AND " +
            orderWhere +
            ' GROUP BY currency',
        )
        .bind(...args),
      this.db
        .prepare(
          'SELECT status,count(*) total FROM orders WHERE ' + orderWhere + ' GROUP BY status',
        )
        .bind(...args),
      this.db
        .prepare(
          'SELECT status,count(*) total FROM visits WHERE ' + visitWhere + ' GROUP BY status',
        )
        .bind(...args),
      this.db
        .prepare(
          "SELECT coalesce(sum(total_usd_minor),0) total FROM orders WHERE status<>'anulado' AND " +
            orderWhere,
        )
        .bind(...args),
    ]);
    return {
      from,
      to,
      sellerId: sellerId || null,
      totals: (totals.results as { currency: Currency; orders: number; total: number }[]).map(
        (row) => ({ ...row, total: major(row.total) }),
      ),
      states: states.results as { status: Order['status']; total: number }[],
      visits: visits.results as { status: Visit['status']; total: number }[],
      totalUsd: major(count(usd)),
      generatedAt: now(),
    };
  }
  async listAudit({ pageSize, offset }: Pagination) {
    const result = await this.db
      .prepare(
        'SELECT a.id,a.action,a.entity_type entityType,a.entity_id entityId,a.created_at createdAt,u.name actorName FROM audit_log a JOIN user u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT ? OFFSET ?',
      )
      .bind(pageSize, offset)
      .all<AuditEntry>();
    return result.results;
  }
}
