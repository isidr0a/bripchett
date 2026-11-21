import { allVisitDays, type CatalogImportKind } from '@briochett/contracts';
import type {
  CatalogImportKey,
  CatalogImportRecord,
  CatalogImportRepository,
  ImportZone,
} from '../../application/ports';
import { uid } from '../../domain/primitives';
import { D1Repository } from './d1-repository';

const canonicalRif = (column: string) =>
  `upper(replace(replace(replace(replace(${column},' ',''),'-',''),'.',''),char(9),''))`;
const latestRate = `SELECT id,rate FROM exchange_rates
  WHERE currency=? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1`;
const zone = 'SELECT id,name FROM zones WHERE id=? AND active=1 AND deleted_at IS NULL';

export class D1CatalogImportRepository extends D1Repository implements CatalogImportRepository {
  async find(kind: CatalogImportKind, keys: CatalogImportKey[]) {
    const predicate =
      kind === 'clients'
        ? `c.code COLLATE NOCASE IN (SELECT r->>'code' FROM wanted)
           OR c.import_code IN (SELECT r->>'code' FROM wanted)
           OR ${canonicalRif('c.rif')} IN (SELECT r->>'rif' FROM wanted WHERE r->>'rif'<>'')`
        : `p.sku COLLATE NOCASE IN (SELECT r->>'code' FROM wanted)`;
    const projection =
      kind === 'clients'
        ? "c.id,c.code,c.import_code importCode,c.name,c.rif,c.phone,c.address,'' priceCop,c.updated_at updatedAt,c.deleted_at deletedAt FROM clients c"
        : "p.id,p.sku code,NULL importCode,p.name,'' rif,'' phone,'' address,p.price_cop priceCop,p.updated_at updatedAt,p.deleted_at deletedAt FROM products p";
    const result = await this.db
      .prepare(
        `WITH wanted AS (SELECT value r FROM json_each(?))
        SELECT ${projection} WHERE ${predicate}`,
      )
      .bind(JSON.stringify(keys))
      .all<CatalogImportRecord>();
    return result.results;
  }
  zone(id: string) {
    return this.db.prepare(zone).bind(id).first<ImportZone>();
  }
  async activeZones() {
    const { results } = await this.db
      .prepare(
        'SELECT id,name,name_key nameKey FROM zones WHERE active=1 AND deleted_at IS NULL ORDER BY name_key,id',
      )
      .all<ImportZone & { nameKey: string }>();
    return results;
  }
  latestRate(currency: 'COP' | 'VES') {
    return this.db.prepare(latestRate).bind(currency).first<{ id: string; rate: string }>();
  }

  async apply({
    kind,
    changes,
    zoneId,
    rateIds = [],
    currency,
    at,
    date,
    summary,
  }: Parameters<CatalogImportRepository['apply']>[0]) {
    const batchId = uid();
    const json = JSON.stringify(changes);
    const clients = kind === 'clients';
    const wanted = 'WITH wanted AS (SELECT value r FROM json_each(?))';
    const table = clients ? 'clients' : 'products';
    const match = clients
      ? `c.code COLLATE NOCASE=w.r->>'code' OR c.import_code=w.r->>'code'
         OR (w.r->>'matchRif'<>'' AND ${canonicalRif('c.rif')}=w.r->>'matchRif')`
      : `c.sku COLLATE NOCASE=w.r->>'code'`;

    // The audit row gates all writes. A concurrent catalog change leaves the whole batch untouched.
    const guard = this.db
      .prepare(
        `${wanted}
      INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,details_json,created_at)
      SELECT ?,?,'importar_catalogo',?,?,?,?
      WHERE NOT EXISTS (
        SELECT 1 FROM wanted w LEFT JOIN ${table} c ON (${match})
        WHERE c.id IS NOT w.r->>'previousId' OR c.updated_at IS NOT w.r->>'previousAt'
          OR c.deleted_at IS NOT NULL
      )
      ${
        clients
          ? `AND NOT EXISTS (
        SELECT 1 FROM wanted w LEFT JOIN zones z ON z.id=w.r->>'zoneId'
        WHERE w.r->>'previousId' IS NULL AND
          (z.active IS NOT 1 OR z.deleted_at IS NOT NULL OR z.name IS NOT w.r->>'zoneName')
      )`
          : ''
      }
      ${rateIds.map(() => `AND (${latestRate.replace('SELECT id,rate', 'SELECT id')})=?`).join(' ')}`,
      )
      .bind(
        json,
        batchId,
        this.actorId,
        clients ? 'cliente' : 'producto',
        batchId,
        JSON.stringify({
          ...summary,
          ...(currency ? { currency } : {}),
          ...(zoneId ? { zoneId } : {}),
          ...(clients
            ? {
                zoneIds: [
                  ...new Set(changes.flatMap((item) => (item.zoneId ? [item.zoneId] : []))),
                ],
              }
            : {}),
        }),
        at,
        ...rateIds.flatMap((rate) => [rate.currency, rate.id]),
      );

    const guarded = 'EXISTS (SELECT 1 FROM audit_log WHERE id=?)';
    const update = clients
      ? this.db
          .prepare(
            `${wanted}
          UPDATE clients SET name=w.r->>'name',rif=w.r->>'rif',phone=w.r->>'phone',
            address=w.r->>'address',import_code=w.r->>'code',updated_at=?
          FROM wanted w WHERE clients.id=w.r->>'previousId' AND ${guarded}`,
          )
          .bind(json, at, batchId)
      : this.db
          .prepare(
            `${wanted}
          UPDATE products SET name=w.r->>'name',price_cop=w.r->>'priceCop',updated_at=?
          FROM wanted w WHERE products.id=w.r->>'previousId' AND ${guarded}`,
          )
          .bind(json, at, batchId);
    const insert = clients
      ? this.db
          .prepare(
            `${wanted}
          INSERT INTO clients(id,code,import_code,name,rif,phone,address,zone,zone_id,active,visit_days_json,recurrence_start,created_at,updated_at)
          SELECT r->>'id',r->>'code',r->>'code',r->>'name',r->>'rif',r->>'phone',r->>'address',
            r->>'zoneName',r->>'zoneId',r->>'active',?,?,?,?
          FROM wanted WHERE r->>'previousId' IS NULL AND ${guarded}`,
          )
          .bind(json, JSON.stringify(allVisitDays), date, at, at, batchId)
      : this.db
          .prepare(
            `${wanted}
          INSERT INTO products(id,sku,name,price_usd,price_cop,active,created_at,updated_at)
          SELECT r->>'id',r->>'code',r->>'name','0',r->>'priceCop',1,?,?
          FROM wanted WHERE r->>'previousId' IS NULL AND ${guarded}`,
          )
          .bind(json, at, at, batchId);
    const [result] = await this.db.batch([guard, update, insert]);
    return result.meta.changes === 1;
  }
}
