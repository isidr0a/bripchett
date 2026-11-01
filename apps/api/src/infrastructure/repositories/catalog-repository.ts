import type {
  Client,
  ClientInput,
  CompletionInput,
  Currency,
  Product,
  ProductInput,
  Rate,
  RateInput,
} from '@briochett/contracts';
import type { CatalogRepository, ClientSearch, ProductSearch } from '../../application/ports';
import { D1Repository, count } from './d1-repository';

type ClientRow = {
  id: string;
  code: string;
  name: string;
  rif: string;
  contact: string;
  phone: string;
  address: string;
  zone: string;
  seller_id: string | null;
  sellerName: string | null;
  active: number;
  geo_json: string | null;
  geo_updated_by: string | null;
  slots_json: string;
  recurrence: Client['recurrence'];
  recurrence_start: string;
  updated_at: string;
};
type ProductRow = Omit<Product, 'active'> & { active: number };
const clientSelect =
  'SELECT c.*,u.name sellerName FROM clients c LEFT JOIN user u ON u.id=c.seller_id';
const productSelect =
  'SELECT id,sku,name,price_usd priceUsd,active,updated_at updatedAt FROM products';

function mapClient(row: ClientRow): Client {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    rif: row.rif,
    contact: row.contact,
    phone: row.phone,
    address: row.address,
    zone: row.zone,
    sellerId: row.seller_id,
    sellerName: row.sellerName || null,
    active: !!row.active,
    geo: row.geo_json ? (JSON.parse(row.geo_json) as Client['geo']) : null,
    geoUpdatedBy: row.geo_updated_by,
    slots: JSON.parse(row.slots_json) as Client['slots'],
    recurrence: row.recurrence,
    recurrenceStart: row.recurrence_start,
    updatedAt: row.updated_at,
  };
}

export class D1CatalogRepository extends D1Repository implements CatalogRepository {
  async findClient(id: string) {
    const row = await this.db
      .prepare(clientSelect + ' WHERE c.id=?')
      .bind(id)
      .first<ClientRow>();
    return row ? mapClient(row) : null;
  }
  async sellerExists(id: string) {
    return !!(await this.db
      .prepare("SELECT id FROM user WHERE id=? AND role='vendedor' AND active=1 AND banned=0")
      .bind(id)
      .first());
  }
  async listClients(query: ClientSearch) {
    const { page, pageSize, offset, sellerId, active, search } = query;
    const where: string[] = [],
      args: (string | number)[] = [];
    if (sellerId) {
      where.push('c.seller_id=? AND c.active=1');
      args.push(sellerId);
    } else if (active) where.push('c.active=1');
    if (search) {
      where.push('c.rowid IN (SELECT rowid FROM clients_fts WHERE clients_fts MATCH ?)');
      args.push(search);
    }
    const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const [list, total] = await this.db.batch([
      this.db
        .prepare(clientSelect + clause + ' ORDER BY c.name,c.id LIMIT ? OFFSET ?')
        .bind(...args, pageSize, offset),
      this.db.prepare('SELECT count(*) total FROM clients c' + clause).bind(...args),
    ]);
    return {
      items: (list.results as ClientRow[]).map(mapClient),
      total: count(total),
      page,
      pageSize,
    };
  }
  async createClient(id: string, code: string, d: ClientInput, at: string) {
    await this.db.batch([
      this.db
        .prepare(
          'INSERT INTO clients(id,code,name,rif,contact,phone,address,zone,seller_id,active,geo_json,geo_updated_by,slots_json,recurrence,recurrence_start,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          code,
          d.name,
          d.rif,
          d.contact,
          d.phone,
          d.address,
          d.zone,
          d.sellerId,
          +d.active,
          d.geo ? JSON.stringify(d.geo) : null,
          d.geo ? this.actorId : null,
          JSON.stringify(d.slots),
          d.recurrence,
          d.recurrenceStart,
          at,
          at,
        ),
      this.audit('crear', 'cliente', id),
    ]);
  }
  async updateClient(id: string, d: ClientInput, geoUpdatedBy: string | null, at: string) {
    await this.db.batch([
      this.db
        .prepare(
          'UPDATE clients SET name=?,rif=?,contact=?,phone=?,address=?,zone=?,seller_id=?,active=?,geo_json=?,geo_updated_by=?,slots_json=?,recurrence=?,recurrence_start=?,updated_at=? WHERE id=?',
        )
        .bind(
          d.name,
          d.rif,
          d.contact,
          d.phone,
          d.address,
          d.zone,
          d.sellerId,
          +d.active,
          d.geo ? JSON.stringify(d.geo) : null,
          geoUpdatedBy,
          JSON.stringify(d.slots),
          d.recurrence,
          d.recurrenceStart,
          at,
          id,
        ),
      this.audit('actualizar', 'cliente', id),
    ]);
  }
  async completeClient(id: string, d: CompletionInput, sellerId: string | undefined, at: string) {
    const [result] = await this.db.batch([
      this.db
        .prepare(
          'UPDATE clients SET name=?,rif=?,contact=?,phone=?,address=?,geo_json=?,geo_updated_by=?,updated_at=? WHERE id=? AND active=1 ' +
            (sellerId ? 'AND seller_id=?' : ''),
        )
        .bind(
          d.name,
          d.rif,
          d.contact,
          d.phone,
          d.address,
          JSON.stringify(d.geo),
          this.actorId,
          at,
          id,
          ...(sellerId ? [sellerId] : []),
        ),
      this.audit('completar_datos', 'cliente', id),
    ]);
    return !!result.meta.changes;
  }
  async listProducts({ page, pageSize, offset, active }: ProductSearch) {
    const where = active ? ' WHERE active=1' : '';
    const [list, total] = await this.db.batch([
      this.db
        .prepare(productSelect + where + ' ORDER BY name LIMIT ? OFFSET ?')
        .bind(pageSize, offset),
      this.db.prepare('SELECT count(*) total FROM products' + where),
    ]);
    return {
      items: (list.results as ProductRow[]).map((r) => ({ ...r, active: !!r.active })),
      total: count(total),
      page,
      pageSize,
    };
  }
  async findProducts(ids: string[]) {
    const result = await this.db
      .prepare(productSelect + ' WHERE id IN (' + ids.map(() => '?').join(',') + ')')
      .bind(...ids)
      .all<ProductRow>();
    return result.results.map((r) => ({ ...r, active: !!r.active }));
  }
  async createProduct(id: string, d: ProductInput, at: string) {
    await this.db.batch([
      this.db
        .prepare(
          'INSERT INTO products(id,sku,name,price_usd,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
        )
        .bind(id, d.sku, d.name, d.priceUsd, +d.active, at, at),
      this.audit('crear', 'producto', id),
    ]);
  }
  async updateProduct(id: string, d: ProductInput, at: string) {
    const [result] = await this.db.batch([
      this.db
        .prepare('UPDATE products SET sku=?,name=?,price_usd=?,active=?,updated_at=? WHERE id=?')
        .bind(d.sku, d.name, d.priceUsd, +d.active, at, id),
      this.audit('actualizar', 'producto', id),
    ]);
    return !!result.meta.changes;
  }
  async listRates() {
    const result = await this.db
      .prepare(
        'SELECT r.id,r.currency,r.rate,r.created_at createdAt,u.name createdBy FROM exchange_rates r JOIN user u ON u.id=r.created_by ORDER BY r.created_at DESC,r.id DESC LIMIT 100',
      )
      .all<Rate>();
    return result.results;
  }
  latestRate(currency: Currency) {
    return this.db
      .prepare(
        'SELECT id,rate FROM exchange_rates WHERE currency=? ORDER BY created_at DESC,id DESC LIMIT 1',
      )
      .bind(currency)
      .first<{ id: string; rate: string }>();
  }
  async createRate(id: string, d: RateInput, at: string) {
    await this.db.batch([
      this.db
        .prepare(
          'INSERT INTO exchange_rates(id,currency,rate,created_at,created_by) VALUES(?,?,?,?,?)',
        )
        .bind(id, d.currency, d.rate, at, this.actorId),
      this.audit('registrar_tasa', 'tasa', id, d),
    ]);
  }
}
