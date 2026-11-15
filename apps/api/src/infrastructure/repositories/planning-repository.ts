import type { Route, Visit } from '@briochett/contracts';
import type {
  Pagination,
  PlanningRepository,
  RouteRegistration,
  VisitCompletion,
  VisitRegistration,
} from '../../application/ports';
import { D1Repository, count } from './d1-repository';

type RouteRow = Omit<Route, 'stops' | 'recurrence'> & { recurrenceJson: string | null };
const routeSelect =
  "SELECT r.id,r.name,r.date,r.seller_id sellerId,u.name sellerName,r.series_id seriesId,r.recurrence_json recurrenceJson,r.zone_id zoneId,coalesce(z.name,'') zone FROM routes r JOIN user u ON u.id=r.seller_id LEFT JOIN zones z ON z.id=r.zone_id";

const visitSelect =
  'SELECT v.id,v.client_id clientId,c.name clientName,v.seller_id sellerId,u.name sellerName,v.scheduled_at scheduledAt,v.status,v.notes,v.order_id orderId,EXISTS(SELECT 1 FROM orders o WHERE o.id=v.order_id AND o.deleted_at IS NOT NULL) orderDeleted,v.route_id routeId FROM visits v JOIN clients c ON c.id=v.client_id JOIN user u ON u.id=v.seller_id';
const localTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Caracas',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export class D1PlanningRepository extends D1Repository implements PlanningRepository {
  async listRoutes({ page, pageSize, offset }: Pagination, sellerId?: string) {
    const where = ' WHERE r.deleted_at IS NULL' + (sellerId ? ' AND r.seller_id=?' : ''),
      args = sellerId ? [sellerId] : [];
    const rows = await this.db
      .prepare(routeSelect + where + ' ORDER BY r.date DESC,r.created_at DESC LIMIT ? OFFSET ?')
      .bind(...args, pageSize, offset)
      .all<RouteRow>();
    const items = await Promise.all(rows.results.map((row) => this.routeWithStops(row)));
    const total = await this.db
      .prepare('SELECT count(*) total FROM routes r' + where)
      .bind(...args)
      .first<{ total: number }>();
    return { items, total: total?.total || 0, page, pageSize };
  }
  private async routeWithStops({ recurrenceJson, ...route }: RouteRow): Promise<Route> {
    const visits = await this.db
      .prepare(
        visitSelect + ' WHERE v.route_id=? AND v.deleted_at IS NULL ORDER BY v.route_position,v.id',
      )
      .bind(route.id)
      .all<Visit>();
    return {
      ...route,
      recurrence: recurrenceJson ? JSON.parse(recurrenceJson) : null,
      stops: visits.results.map((v) => ({
        clientId: v.clientId,
        clientName: v.clientName,
        time: localTime.format(new Date(v.scheduledAt)),
        visitId: v.id,
        status: v.status,
      })),
    };
  }
  async findRoute(id: string) {
    const row = await this.db
      .prepare(routeSelect + ' WHERE r.id=? AND r.deleted_at IS NULL')
      .bind(id)
      .first<RouteRow>();
    return row ? this.routeWithStops(row) : null;
  }
  async saveRoutes(routes: RouteRegistration[], editingId?: string) {
    const first = routes[0];
    const statements: D1PreparedStatement[] = [];
    if (editingId) {
      statements.push(
        this.db
          .prepare(
            'UPDATE routes SET name=?,seller_id=?,date=?,series_id=?,recurrence_json=?,zone_id=? WHERE id=?',
          )
          .bind(
            first.input.name,
            first.input.sellerId,
            first.input.date,
            first.seriesId,
            first.recurrence ? JSON.stringify(first.recurrence) : null,
            first.input.zoneId,
            editingId,
          ),
      );
    }
    const newRoutes = routes
      .filter((route) => route.id !== editingId)
      .map((route) => ({
        id: route.id,
        name: route.input.name,
        sellerId: route.input.sellerId,
        date: route.input.date,
        zoneId: route.input.zoneId,
        seriesId: route.seriesId,
        recurrence: route.recurrence ? JSON.stringify(route.recurrence) : null,
      }));
    // Los lotes JSON mantienen acotado el número de consultas aunque haya varias fechas y paradas.
    if (newRoutes.length)
      statements.push(
        this.db
          .prepare(
            "INSERT INTO routes(id,name,seller_id,date,series_id,recurrence_json,zone_id,created_by,created_at) SELECT json_extract(value,'$.id'),json_extract(value,'$.name'),json_extract(value,'$.sellerId'),json_extract(value,'$.date'),json_extract(value,'$.seriesId'),json_extract(value,'$.recurrence'),json_extract(value,'$.zoneId'),?,? FROM json_each(?)",
          )
          .bind(this.actorId, first.at, JSON.stringify(newRoutes)),
      );
    const stops = routes.flatMap((route) =>
      route.stops.map((stop) => ({ ...stop, routeId: route.id })),
    );
    statements.push(
      this.db
        .prepare(
          "INSERT INTO visits(id,client_id,seller_id,scheduled_at,route_id,route_position,created_at) SELECT json_extract(value,'$.id'),json_extract(value,'$.clientId'),json_extract(value,'$.sellerId'),json_extract(value,'$.scheduledAt'),json_extract(value,'$.routeId'),json_extract(value,'$.position'),? FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM visits v WHERE v.route_id=json_extract(j.value,'$.routeId') AND v.client_id=json_extract(j.value,'$.clientId') AND v.seller_id=json_extract(j.value,'$.sellerId') AND julianday(v.scheduled_at)=julianday(json_extract(j.value,'$.scheduledAt')) AND v.deleted_at IS NULL)",
        )
        .bind(first.at, JSON.stringify(stops)),
    );
    if (editingId) {
      const updated = JSON.stringify(first.stops);
      const sameStop =
        "json_extract(s.value,'$.clientId')=visits.client_id AND json_extract(s.value,'$.sellerId')=visits.seller_id AND julianday(json_extract(s.value,'$.scheduledAt'))=julianday(visits.scheduled_at)";
      statements.push(
        this.db
          .prepare(
            `UPDATE visits SET route_position=(SELECT json_extract(s.value,'$.position') FROM json_each(?) s WHERE ${sameStop}) WHERE route_id=? AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM json_each(?) s WHERE ${sameStop})`,
          )
          .bind(updated, editingId, updated),
        this.db
          .prepare(
            `UPDATE visits SET deleted_at=?,deleted_by=? WHERE route_id=? AND deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM json_each(?) s WHERE ${sameStop})`,
          )
          .bind(first.at, this.actorId, editingId, updated),
      );
    }
    statements.push(
      this.audit(editingId ? 'actualizar' : 'crear', 'ruta', first.id, {
        recurrence: first.recurrence,
        occurrences: routes.length,
      }),
    );
    await this.db.batch(statements);
  }
  async listVisits({ page, pageSize, offset }: Pagination, sellerId?: string) {
    const where = ' WHERE v.deleted_at IS NULL' + (sellerId ? ' AND v.seller_id=?' : ''),
      args = sellerId ? [sellerId] : [];
    const [list, total] = await this.db.batch([
      this.db
        .prepare(visitSelect + where + ' ORDER BY v.scheduled_at DESC LIMIT ? OFFSET ?')
        .bind(...args, pageSize, offset),
      this.db.prepare('SELECT count(*) total FROM visits v' + where).bind(...args),
    ]);
    return {
      items: (list.results as Visit[]).map((v) => ({ ...v, orderDeleted: !!v.orderDeleted })),
      total: count(total),
      page,
      pageSize,
    };
  }
  async findVisit(id: string) {
    const visit = await this.db
      .prepare(visitSelect + ' WHERE v.id=? AND v.deleted_at IS NULL')
      .bind(id)
      .first<Visit>();
    return visit ? { ...visit, orderDeleted: !!visit.orderDeleted } : null;
  }
  async createVisit(visit: VisitRegistration) {
    await this.db.batch([this.visitInsert(visit), this.audit('programar', 'visita', visit.id)]);
  }
  async completeVisit({ visit, input, at, followUp }: VisitCompletion) {
    const statements = [
      this.db
        .prepare('INSERT INTO visit_completions(visit_id,result) VALUES(?,?)')
        .bind(visit.id, input.result),
      this.db
        .prepare(
          "UPDATE visits SET status=?,notes=?,order_id=?,completed_at=? WHERE id=? AND deleted_at IS NULL AND status='programada'",
        )
        .bind(
          input.result,
          input.notes,
          input.result === 'con_pedido' ? input.orderId : null,
          at,
          visit.id,
        ),
      this.audit(input.result, 'visita', visit.id),
    ];
    if (followUp) statements.push(this.visitInsert(followUp));
    await this.db.batch(statements);
  }
  private visitInsert(visit: VisitRegistration) {
    return this.db
      .prepare(
        'INSERT INTO visits(id,client_id,seller_id,scheduled_at,created_at) VALUES(?,?,?,?,?)',
      )
      .bind(visit.id, visit.clientId, visit.sellerId, visit.scheduledAt, visit.at);
  }
}
