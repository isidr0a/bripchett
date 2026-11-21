import type {
  ProductionOption,
  ProductionOptionType,
  ProductionReport,
} from '@briochett/contracts';
import type {
  Pagination,
  ProductionReportRange,
  ProductionReportRepository,
} from '../../application/ports';
import { D1Repository, count } from './d1-repository';

const zoneId = "nullif(json_extract(o.client_snapshot,'$.zoneId'),'')";
const zoneName = "nullif(trim(json_extract(o.client_snapshot,'$.zone')),'')";
const searchable = Array.from('áéíóúüñÁÉÍÓÚÜÑ').reduce(
  (sql, letter, index) => `replace(${sql},'${letter}','${'aeiouunaeiouun'[index]}')`,
  'searchable',
);

function commandScope(filters: ProductionReportRange, except?: ProductionOptionType) {
  const clauses = ["o.status<>'anulado'", 'o.deleted_at IS NULL'];
  const args: string[] = [];
  if (filters.state === 'open') clauses.push("k.status IN ('pendiente','en_preparacion')");
  else if (filters.state !== 'all') {
    clauses.push('k.status=?');
    args.push(filters.state);
  }
  if (filters.start) {
    clauses.push('k.created_at>=?');
    args.push(filters.start);
  }
  if (filters.end) {
    clauses.push('k.created_at<?');
    args.push(filters.end);
  }
  const dimensions: string[] = [];
  if (filters.zone && except !== 'zone') {
    dimensions.push('zoneKey=?');
    args.push(filters.zone);
  }
  if (filters.route && except !== 'route') {
    dimensions.push(filters.route.startsWith('series:') ? 'seriesKey=?' : 'routeKey=?');
    args.push(filters.route);
  }
  if (filters.clientId && except !== 'client') {
    dimensions.push('clientId=?');
    args.push(filters.clientId);
  }
  return {
    args,
    sql: `WITH eligible AS (
      SELECT k.id AS commandId, k.created_at AS issued, o.id AS orderId, o.client_id AS clientId,
             coalesce('zone:' || ${zoneId},o.legacy_production_zone,'pending') AS zoneKey,
             coalesce(${zoneName},'Zona pendiente') AS zoneName,
             coalesce('route:' || r.id,'none') AS routeKey, 'series:' || r.series_id AS seriesKey,
             r.name AS routeName, r.date AS routeDate,
             coalesce(nullif(json_extract(o.client_snapshot,'$.name'),''),c.name) AS clientName,
             coalesce(nullif(json_extract(o.client_snapshot,'$.code'),''),c.code) AS clientCode
      FROM commands k JOIN orders o ON o.id=k.order_id
      JOIN clients c ON c.id=o.client_id
      LEFT JOIN visits v ON v.order_id=o.id
      LEFT JOIN routes r ON r.id=v.route_id
      WHERE ${clauses.join(' AND ')}
    ), filtered AS (
      SELECT * FROM eligible${dimensions.length ? ' WHERE ' + dimensions.join(' AND ') : ''}
    )`,
  };
}

const optionRows: Record<ProductionOptionType, string> = {
  zone: 'SELECT zoneKey AS value, zoneName AS label, zoneName AS searchable, issued, commandId FROM filtered',
  route: `SELECT routeKey AS value,
            coalesce(routeName || ' · ' || routeDate,'Sin recorrido') AS label,
            coalesce(routeName || ' ' || routeDate,'Sin recorrido') AS searchable, issued, commandId
          FROM filtered
          UNION ALL
          SELECT seriesKey, routeName || ' · Serie completa', routeName || ' Serie completa', issued, commandId
          FROM filtered WHERE seriesKey IS NOT NULL`,
  client: `SELECT clientId AS value, coalesce(nullif(clientName,'') || ' · ','') || clientCode AS label,
             clientName || ' ' || clientCode AS searchable, issued, commandId FROM filtered`,
};

export class D1ProductionReportRepository
  extends D1Repository
  implements ProductionReportRepository
{
  async totals(filters: ProductionReportRange): Promise<ProductionReport> {
    const { sql, args } = commandScope(filters);
    const [totals, products] = await this.db.batch([
      this.db
        .prepare(
          sql +
            ` SELECT (SELECT count(*) FROM filtered) AS commands,
                 count(DISTINCT i.product_id) AS products, coalesce(sum(i.quantity),0) AS units
              FROM filtered f JOIN order_items i ON i.order_id=f.orderId`,
        )
        .bind(...args),
      this.db
        .prepare(
          sql +
            ` SELECT i.product_id AS productId, p.sku, p.name, sum(i.quantity) AS units,
                      count(DISTINCT f.commandId) AS commands
              FROM filtered f JOIN order_items i ON i.order_id=f.orderId
              JOIN products p ON p.id=i.product_id
              GROUP BY i.product_id,p.sku,p.name
              ORDER BY p.name COLLATE NOCASE,p.sku,i.product_id`,
        )
        .bind(...args),
    ]);
    return {
      totals: totals.results[0] as ProductionReport['totals'],
      items: products.results as ProductionReport['items'],
    };
  }

  async options(
    filters: ProductionReportRange & { type: ProductionOptionType; q: string },
    { page, pageSize, offset }: Pagination,
  ) {
    const { sql, args } = commandScope(filters, filters.type);
    const search = filters.q
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[\\%_]/g, '\\$&');
    const statement =
      sql +
      `, candidates AS (${optionRows[filters.type]}),
         matching AS (
           SELECT value,label,row_number() OVER (
             PARTITION BY value ORDER BY issued DESC,commandId DESC
           ) AS rank
           FROM candidates WHERE ${searchable} LIKE ? ESCAPE '\\'
         )`;
    const [rows, total] = await this.db.batch([
      this.db
        .prepare(
          statement +
            ' SELECT value,label FROM matching WHERE rank=1 ORDER BY label COLLATE NOCASE,value LIMIT ? OFFSET ?',
        )
        .bind(...args, '%' + search + '%', pageSize, offset),
      this.db
        .prepare(statement + ' SELECT count(*) AS total FROM matching WHERE rank=1')
        .bind(...args, '%' + search + '%'),
    ]);
    return { items: rows.results as ProductionOption[], total: count(total), page, pageSize };
  }
}
