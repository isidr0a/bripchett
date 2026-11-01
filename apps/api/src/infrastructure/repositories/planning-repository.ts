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
  'SELECT r.id,r.name,r.date,r.seller_id sellerId,u.name sellerName,r.series_id seriesId,r.recurrence_json recurrenceJson FROM routes r JOIN user u ON u.id=r.seller_id';

const visitSelect =
  'SELECT v.id,v.client_id clientId,c.name clientName,v.seller_id sellerId,u.name sellerName,v.scheduled_at scheduledAt,v.status,v.notes,v.order_id orderId,v.route_id routeId FROM visits v JOIN clients c ON c.id=v.client_id JOIN user u ON u.id=v.seller_id';
const localTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Caracas',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export class D1PlanningRepository extends D1Repository implements PlanningRepository {
  async listRoutes({ page, pageSize, offset }: Pagination, sellerId?: string) {
    const where = sellerId ? ' WHERE r.seller_id=?' : '',
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
      .prepare(visitSelect + ' WHERE v.route_id=? ORDER BY v.route_position')
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
      .prepare(routeSelect + ' WHERE r.id=?')
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
            'UPDATE routes SET name=?,seller_id=?,date=?,series_id=?,recurrence_json=? WHERE id=?',
          )
          .bind(
            first.input.name,
            first.input.sellerId,
            first.input.date,
            first.seriesId,
            first.recurrence ? JSON.stringify(first.recurrence) : null,
            editingId,
          ),
        this.db
          .prepare("DELETE FROM visits WHERE route_id=? AND status='programada'")
          .bind(editingId),
      );
    }
    const newRoutes = routes
      .filter((route) => route.id !== editingId)
      .map((route) => ({
        id: route.id,
        name: route.input.name,
        sellerId: route.input.sellerId,
        date: route.input.date,
        seriesId: route.seriesId,
        recurrence: route.recurrence ? JSON.stringify(route.recurrence) : null,
      }));
    // Los lotes JSON mantienen acotado el número de consultas aunque haya varias fechas y paradas.
    if (newRoutes.length)
      statements.push(
        this.db
          .prepare(
            "INSERT INTO routes(id,name,seller_id,date,series_id,recurrence_json,created_by,created_at) SELECT json_extract(value,'$.id'),json_extract(value,'$.name'),json_extract(value,'$.sellerId'),json_extract(value,'$.date'),json_extract(value,'$.seriesId'),json_extract(value,'$.recurrence'),?,? FROM json_each(?)",
          )
          .bind(this.actorId, first.at, JSON.stringify(newRoutes)),
      );
    const stops = routes.flatMap((route) =>
      route.stops.map((stop) => ({ ...stop, routeId: route.id })),
    );
    statements.push(
      this.db
        .prepare(
          "INSERT INTO visits(id,client_id,seller_id,scheduled_at,route_id,route_position,created_at) SELECT json_extract(value,'$.id'),json_extract(value,'$.clientId'),json_extract(value,'$.sellerId'),json_extract(value,'$.scheduledAt'),json_extract(value,'$.routeId'),json_extract(value,'$.position'),? FROM json_each(?)",
        )
        .bind(first.at, JSON.stringify(stops)),
      this.audit(editingId ? 'actualizar' : 'crear', 'ruta', first.id, {
        recurrence: first.recurrence,
        occurrences: routes.length,
      }),
    );
    await this.db.batch(statements);
  }
  async listVisits({ page, pageSize, offset }: Pagination, sellerId?: string) {
    const where = sellerId ? ' WHERE v.seller_id=?' : '',
      args = sellerId ? [sellerId] : [];
    const [list, total] = await this.db.batch([
      this.db
        .prepare(visitSelect + where + ' ORDER BY v.scheduled_at DESC LIMIT ? OFFSET ?')
        .bind(...args, pageSize, offset),
      this.db.prepare('SELECT count(*) total FROM visits v' + where).bind(...args),
    ]);
    return { items: list.results as Visit[], total: count(total), page, pageSize };
  }
  findVisit(id: string) {
    return this.db
      .prepare(visitSelect + ' WHERE v.id=?')
      .bind(id)
      .first<Visit>();
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
          "UPDATE visits SET status=?,notes=?,order_id=?,completed_at=? WHERE id=? AND status='programada'",
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
