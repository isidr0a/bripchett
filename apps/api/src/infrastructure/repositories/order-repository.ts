import type { Client, Command, Order, QuoteLine } from '@briochett/contracts';
import type {
  CommandRecord,
  OrderRegistration,
  IdempotentOrder,
  OrderRepository,
  Pagination,
} from '../../application/ports';
import { major, minor } from '../../domain/pricing';
import { uid } from '../../domain/primitives';
import { D1Repository, count } from './d1-repository';

type OrderRow = {
  id: string;
  number: number;
  client_id: string;
  clientName: string;
  author_id: string;
  authorName: string;
  currency: Order['currency'];
  rate: string;
  rate_base: 'USD' | 'COP';
  total_minor: number;
  total_usd_minor: number;
  usd_available: number;
  status: Order['status'];
  created_at: string;
  notes: string;
  sync_status: string;
  client_snapshot: string;
};
type ItemRow = Omit<QuoteLine, 'unitPrice' | 'subtotal'> & {
  unit_minor: number;
  subtotal_minor: number;
};
const orderSelect =
  "SELECT o.*,coalesce(nullif(c.name,''),c.code) clientName,u.name authorName FROM orders o JOIN clients c ON c.id=o.client_id JOIN user u ON u.id=o.author_id";
function mapOrder(r: OrderRow): Order {
  return {
    id: r.id,
    number: r.number,
    clientId: r.client_id,
    clientName: r.clientName,
    authorId: r.author_id,
    authorName: r.authorName,
    currency: r.currency,
    rate: r.rate,
    rateBase: r.rate_base,
    total: major(r.total_minor),
    totalUsd: r.usd_available ? major(r.total_usd_minor) : null,
    status: r.status,
    createdAt: r.created_at,
    notes: r.notes,
    syncStatus: r.sync_status,
  };
}

export class D1OrderRepository extends D1Repository implements OrderRepository {
  async list({ page, pageSize, offset }: Pagination, authorId?: string) {
    const where = ' WHERE o.deleted_at IS NULL' + (authorId ? ' AND o.author_id=?' : ''),
      args = authorId ? [authorId] : [];
    const [list, total] = await this.db.batch([
      this.db
        .prepare(orderSelect + where + ' ORDER BY o.number DESC LIMIT ? OFFSET ?')
        .bind(...args, pageSize, offset),
      this.db.prepare('SELECT count(*) total FROM orders o' + where).bind(...args),
    ]);
    return {
      items: (list.results as OrderRow[]).map(mapOrder),
      total: count(total),
      page,
      pageSize,
    };
  }
  async find(id: string) {
    const row = await this.db
      .prepare(orderSelect + ' WHERE o.id=? AND o.deleted_at IS NULL')
      .bind(id)
      .first<OrderRow>();
    if (!row) return null;
    const items = await this.db
      .prepare(
        'SELECT product_id productId,name,sku,quantity,CASE WHEN o.usd_available=1 THEN i.price_usd END priceUsd,i.price_cop priceCop,i.unit_minor,i.subtotal_minor FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.order_id=? ORDER BY i.rowid',
      )
      .bind(id)
      .all<ItemRow>();
    return {
      ...mapOrder(row),
      clientSnapshot: JSON.parse(row.client_snapshot) as Client,
      items: items.results.map((i) => ({
        productId: i.productId,
        name: i.name,
        sku: i.sku,
        quantity: i.quantity,
        priceUsd: i.priceUsd,
        priceCop: i.priceCop,
        unitPrice: major(i.unit_minor),
        subtotal: major(i.subtotal_minor),
      })),
    };
  }
  findAttempt(authorId: string, key: string) {
    return this.db
      .prepare(
        'SELECT id,request_hash requestHash,deleted_at deletedAt FROM orders WHERE author_id=? AND idempotency_key=?',
      )
      .bind(authorId, key)
      .first<IdempotentOrder>();
  }
  async register({
    id,
    input: d,
    quote: q,
    client,
    authorId,
    key,
    requestHash,
    at,
  }: OrderRegistration) {
    const { photoId: _photoId, ...clientSnapshot } = client;
    const statements = [
      this.db
        .prepare(
          'INSERT INTO orders(id,client_id,author_id,currency,rate,rate_base,rate_id,cop_rate_id,usd_available,total_minor,total_usd_minor,units,notes,client_snapshot,idempotency_key,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          d.clientId,
          authorId,
          q.currency,
          q.rate,
          q.rateBase,
          q.rateId,
          q.copRateId,
          Number(q.totalUsd !== null),
          minor(q.total),
          minor(q.totalUsd ?? '0'),
          q.units,
          d.notes,
          JSON.stringify(clientSnapshot),
          key,
          requestHash,
          at,
          at,
        ),
      ...q.items.map((i) =>
        this.db
          .prepare(
            'INSERT INTO order_items(id,order_id,product_id,name,sku,quantity,price_usd,price_cop,unit_minor,subtotal_minor) VALUES(?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            uid(),
            id,
            i.productId,
            i.name,
            i.sku,
            i.quantity,
            i.priceUsd ?? '0',
            i.priceCop,
            minor(i.unitPrice),
            minor(i.subtotal),
          ),
      ),
      this.audit('registrar', 'pedido', id, { currency: q.currency, total: q.total }),
    ];
    if (d.visitId)
      statements.push(
        this.db
          .prepare("INSERT INTO visit_completions(visit_id,result) VALUES(?,'con_pedido')")
          .bind(d.visitId),
        this.db
          .prepare(
            "UPDATE visits SET status='con_pedido',order_id=?,completed_at=? WHERE id=? AND deleted_at IS NULL AND status='programada'",
          )
          .bind(id, at, d.visitId),
        this.audit('con_pedido', 'visita', d.visitId),
      );
    await this.db.batch(statements);
  }
  async validate(id: string, commandId: string, at: string) {
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE orders SET status='validado',updated_at=? WHERE id=? AND deleted_at IS NULL AND status='pendiente'",
        )
        .bind(at, id),
      this.db
        .prepare(
          "INSERT INTO commands(id,order_id,status,created_at,updated_at) VALUES(?,?,'pendiente',?,?)",
        )
        .bind(commandId, id, at, at),
      this.audit('validar', 'pedido', id),
    ]);
  }
  async cancel(id: string, at: string) {
    const [result] = await this.db.batch([
      this.db
        .prepare(
          "UPDATE orders SET status='anulado',updated_at=? WHERE id=? AND deleted_at IS NULL AND status IN('pendiente','validado')",
        )
        .bind(at, id),
      this.auditIfChanged('anular', 'pedido', id),
    ]);
    return !!result.meta.changes;
  }
  async listCommands({ page, pageSize, offset }: Pagination) {
    const rows = await this.db
      .prepare(
        "SELECT k.id,k.order_id orderId,k.status,k.created_at createdAt,o.number,coalesce(nullif(c.name,''),c.code) clientName,o.notes FROM commands k JOIN orders o ON o.id=k.order_id JOIN clients c ON c.id=o.client_id WHERE o.status<>'anulado' AND o.deleted_at IS NULL ORDER BY k.created_at DESC LIMIT ? OFFSET ?",
      )
      .bind(pageSize, offset)
      .all<Omit<Command, 'items'>>();
    const items = await Promise.all(
      rows.results.map(async (row) => {
        const lines = await this.db
          .prepare('SELECT name,sku,quantity FROM order_items WHERE order_id=? ORDER BY rowid')
          .bind(row.orderId)
          .all<Command['items'][number]>();
        return { ...row, items: lines.results };
      }),
    );
    const total = await this.db
      .prepare(
        "SELECT count(*) total FROM commands k JOIN orders o ON o.id=k.order_id WHERE o.status<>'anulado' AND o.deleted_at IS NULL",
      )
      .first<{ total: number }>();
    return { items, total: total?.total || 0, page, pageSize };
  }
  findCommand(id: string) {
    return this.db
      .prepare(
        'SELECT k.id,k.order_id orderId,k.status,o.status orderStatus FROM commands k JOIN orders o ON o.id=k.order_id WHERE k.id=? AND o.deleted_at IS NULL',
      )
      .bind(id)
      .first<CommandRecord>();
  }
  async advanceCommand(command: CommandRecord, next: Command['status'], at: string) {
    const previous = command.status === 'pendiente' ? 'validado' : 'en_preparacion';
    const [result] = await this.db.batch([
      this.db
        .prepare(
          'UPDATE commands SET status=?,updated_at=? WHERE id=? AND status=? AND EXISTS(SELECT 1 FROM orders WHERE id=commands.order_id AND deleted_at IS NULL AND status=?)',
        )
        .bind(next, at, command.id, command.status, previous),
      this.db
        .prepare(
          'UPDATE orders SET status=?,updated_at=? WHERE id=? AND deleted_at IS NULL AND status=? AND EXISTS(SELECT 1 FROM commands WHERE id=? AND status=?)',
        )
        .bind(next, at, command.orderId, previous, command.id, next),
      this.audit(next, 'comanda', command.id),
    ]);
    return !!result.meta.changes;
  }
}
