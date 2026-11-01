import {
  recurringRouteDates,
  type RouteInput,
  type SessionUser,
  type VisitInput,
  type VisitResultInput,
} from '@briochett/contracts';
import type { OrderRepository, Pagination, PlanningRepository, RouteRegistration } from '../ports';
import type { CatalogService } from './catalog-service';
import { fail } from '../../domain/errors';
import { now, uid } from '../../domain/primitives';
import { requireSchedule, visitFits } from '../../domain/scheduling';

export class PlanningService {
  constructor(
    private readonly repository: PlanningRepository,
    private readonly orders: OrderRepository,
    private readonly catalog: CatalogService,
    private readonly actor: SessionUser,
  ) {}

  routes(pagination: Pagination) {
    return this.repository.listRoutes(
      pagination,
      this.actor.role === 'vendedor' ? this.actor.id : undefined,
    );
  }
  visits(pagination: Pagination) {
    return this.repository.listVisits(
      pagination,
      this.actor.role === 'vendedor' ? this.actor.id : undefined,
    );
  }
  async visit(id: string) {
    const visit = await this.repository.findVisit(id);
    if (!visit || (this.actor.role === 'vendedor' && visit.sellerId !== this.actor.id))
      fail(404, 'VISIT_NOT_FOUND', 'Visita no encontrada.');
    return visit;
  }
  async saveRoute(input: RouteInput, existingId?: string) {
    const existing = existingId ? await this.repository.findRoute(existingId) : null;
    if (existingId && !existing) fail(404, 'ROUTE_NOT_FOUND', 'Ruta no encontrada.');
    if (existing?.seriesId && input.recurrence)
      fail(
        422,
        'ROUTE_SERIES',
        'Esta ruta ya pertenece a una repetición. Puedes editar esta fecha o crear otra repetición.',
      );
    await this.catalog.requireSeller(input.sellerId);
    const clients = await Promise.all(
      input.stops.map((stop) => this.catalog.client(stop.clientId, true)),
    );
    for (const client of clients)
      if (client.sellerId !== input.sellerId)
        fail(422, 'ROUTE_CLIENT', 'Todas las paradas deben pertenecer al vendedor de la ruta.');
    const id = existingId || uid();
    const dates = recurringRouteDates(input.date, input.recurrence);
    if (!dates.length) fail(422, 'ROUTE_RECURRENCE', 'Revisa las fechas de repetición de la ruta.');
    const seriesId = existing?.seriesId || (input.recurrence ? id : null);
    const recurrence =
      existing?.recurrence ||
      (input.recurrence ? { ...input.recurrence, startDate: input.date } : null);
    const at = now();
    const routes: RouteRegistration[] = dates.map((date, index) => ({
      id: index === 0 ? id : id + ':' + date,
      input: { ...input, date },
      seriesId,
      recurrence,
      at,
      stops: input.stops.map((stop, position) => {
        const scheduledAt = new Date(date + 'T' + stop.time + ':00-04:00').toISOString();
        if (!visitFits(clients[position], scheduledAt)) {
          fail(
            422,
            'VISIT_WINDOW',
            `${clients[position].name}: la visita del ${date} a las ${stop.time} no coincide con sus días, horario o recurrencia. No se guardó ninguna fecha.`,
          );
        }
        return {
          id: uid(),
          clientId: stop.clientId,
          sellerId: input.sellerId,
          scheduledAt,
          position,
        };
      }),
    }));
    await this.repository.saveRoutes(routes, existingId);
    return { id, ...input, seriesId, recurrence, occurrences: routes.length, dates };
  }
  async scheduleVisit(input: VisitInput) {
    const scheduledAt = new Date(input.scheduledAt).toISOString();
    const client = await this.catalog.client(input.clientId, true);
    requireSchedule(client, input.scheduledAt);
    const sellerId = this.actor.role === 'vendedor' ? this.actor.id : client.sellerId;
    if (!sellerId)
      fail(422, 'SELLER', 'Asigna un vendedor al cliente antes de programar su visita.');
    await this.catalog.requireSeller(sellerId);
    if (input.routeId)
      fail(422, 'ROUTE', 'Las paradas de ruta se crean desde la planificación de rutas.');
    const id = uid();
    await this.repository.createVisit({
      id,
      clientId: input.clientId,
      sellerId,
      scheduledAt,
      at: now(),
    });
    return { id, ...input, scheduledAt };
  }
  async completeVisit(id: string, input: VisitResultInput) {
    const visit = await this.visit(id);
    if (visit.status !== 'programada') fail(409, 'VISIT_STATE', 'La visita ya fue registrada.');
    const client = await this.catalog.client(visit.clientId, true);
    if (input.result === 'con_pedido') {
      const order = input.orderId ? await this.orders.find(input.orderId) : null;
      if (
        !order ||
        order.clientId !== visit.clientId ||
        order.status === 'anulado' ||
        (this.actor.role === 'vendedor' && order.authorId !== this.actor.id)
      )
        fail(422, 'ORDER_INVALID', 'Selecciona un pedido válido de este cliente.');
    }
    if (input.nextAt) {
      if (input.result !== 'sin_pedido')
        fail(422, 'NEXT_VISIT', 'La reprogramación corresponde a visitas sin pedido.');
      if (new Date(input.nextAt) <= new Date())
        fail(422, 'NEXT_VISIT', 'Selecciona una fecha futura.');
      requireSchedule(client, input.nextAt);
    }
    const at = now();
    const followUp = input.nextAt
      ? {
          id: uid(),
          clientId: visit.clientId,
          sellerId: visit.sellerId,
          scheduledAt: new Date(input.nextAt).toISOString(),
          at,
        }
      : undefined;
    await this.repository.completeVisit({ visit, input, at, followUp });
    return { id, status: input.result };
  }
}
