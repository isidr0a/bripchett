import Decimal from 'decimal.js';
import {
  clientMissing,
  type OrderInput,
  type Quote,
  type QuoteInput,
  type SessionUser,
} from '@briochett/contracts';
import type { CatalogRepository, OrderRepository, Pagination, PlanningRepository } from '../ports';
import type { CatalogService } from './catalog-service';
import { calculateLine } from '../../domain/pricing';
import { fail } from '../../domain/errors';
import { hash, now, uid } from '../../domain/primitives';

export class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly catalogRepository: CatalogRepository,
    private readonly planning: PlanningRepository,
    private readonly catalog: CatalogService,
    private readonly actor: SessionUser,
  ) {}

  list(pagination: Pagination) {
    return this.repository.list(
      pagination,
      this.actor.role === 'vendedor' ? this.actor.id : undefined,
    );
  }
  async get(id: string) {
    const order = await this.repository.find(id);
    if (!order || (this.actor.role === 'vendedor' && order.authorId !== this.actor.id))
      fail(404, 'ORDER_NOT_FOUND', 'Pedido no encontrado en tu alcance.');
    return order;
  }
  async quote(input: QuoteInput): Promise<Quote> {
    const client = await this.catalog.client(input.clientId, true);
    if (this.actor.role === 'vendedor') {
      const missing = clientMissing(client);
      if (missing.length)
        fail(
          422,
          'CLIENT_INCOMPLETE',
          'Completa los datos del cliente antes de registrar el pedido.',
          { missing, clientId: client.id },
        );
    }
    let rate = '1',
      rateId: string | null = null;
    if (input.currency !== 'USD') {
      const current = await this.catalogRepository.latestRate(input.currency);
      if (!current)
        fail(
          422,
          'RATE_MISSING',
          'Administración debe registrar la tasa de ' + input.currency + ' antes de continuar.',
        );
      rate = current.rate;
      rateId = current.id;
    }
    const products = await this.catalogRepository.findProducts(input.items.map((i) => i.productId));
    const items = input.items.map((item) => {
      const product = products.find((p) => p.id === item.productId && p.active);
      if (!product) fail(422, 'PRODUCT_UNAVAILABLE', 'Uno de los productos ya no está disponible.');
      return calculateLine(product, item.quantity, rate);
    });
    const total = items.reduce((sum, line) => sum.plus(line.subtotal), new Decimal(0)).toFixed(2);
    const totalUsd = items
      .reduce(
        (sum, line) => sum.plus(new Decimal(line.priceUsd).mul(line.quantity)),
        new Decimal(0),
      )
      .toFixed(2);
    const units = items.reduce((sum, line) => sum + line.quantity, 0);
    if (
      new Decimal(total).mul(100).gt(Number.MAX_SAFE_INTEGER) ||
      new Decimal(totalUsd).mul(100).gt(Number.MAX_SAFE_INTEGER)
    )
      fail(422, 'ORDER_TOO_LARGE', 'El importe supera el límite permitido.');
    const version = await hash({
      clientId: client.id,
      clientVersion: client.updatedAt,
      currency: input.currency,
      rate,
      rateId,
      items,
    });
    return {
      clientId: client.id,
      currency: input.currency,
      rate,
      rateId,
      items,
      total,
      totalUsd,
      units,
      version,
    };
  }
  async register(input: OrderInput, key: string) {
    const requestHash = await hash({
      clientId: input.clientId,
      currency: input.currency,
      items: [...input.items].sort((a, b) => a.productId.localeCompare(b.productId)),
      notes: input.notes,
      visitId: input.visitId || null,
    });
    const existing = await this.repository.findAttempt(this.actor.id, key);
    if (existing) {
      if (existing.requestHash !== requestHash)
        fail(409, 'IDEMPOTENCY_CONFLICT', 'Este intento ya se utilizó para otro pedido.');
      return { order: await this.get(existing.id), created: false };
    }
    const quote = await this.quote(input);
    if (quote.version !== input.quoteVersion)
      fail(
        409,
        'QUOTE_CHANGED',
        'Los precios, la tasa o los datos del cliente cambiaron. Revisa el resumen actualizado.',
      );
    if (input.visitId) {
      const visit = await this.planning.findVisit(input.visitId);
      if (
        !visit ||
        visit.clientId !== input.clientId ||
        visit.status !== 'programada' ||
        (this.actor.role === 'vendedor' && visit.sellerId !== this.actor.id)
      )
        fail(422, 'VISIT_INVALID', 'La visita no está disponible para este pedido.');
    }
    const client = await this.catalog.client(input.clientId, true),
      id = uid();
    try {
      await this.repository.register({
        id,
        input,
        quote,
        client,
        authorId: this.actor.id,
        key,
        requestHash,
        at: now(),
      });
    } catch (error) {
      const found = await this.repository.findAttempt(this.actor.id, key);
      if (found) {
        if (found.requestHash !== requestHash)
          fail(409, 'IDEMPOTENCY_CONFLICT', 'El intento pertenece a otro pedido.');
        return { order: await this.get(found.id), created: false };
      }
      throw error;
    }
    return { order: await this.get(id), created: true };
  }
  async validate(id: string) {
    const order = await this.get(id);
    if (order.status !== 'pendiente')
      fail(409, 'ORDER_STATE', 'Solo puedes validar pedidos pendientes.');
    await this.repository.validate(id, uid(), now());
    return this.get(id);
  }
  async cancel(id: string) {
    await this.get(id);
    if (!(await this.repository.cancel(id, now())))
      fail(409, 'ORDER_STATE', 'El pedido ya fue anulado o inició su preparación.');
    return this.get(id);
  }
  commands(pagination: Pagination) {
    return this.repository.listCommands(pagination);
  }
  async advanceCommand(id: string) {
    const command = await this.repository.findCommand(id);
    if (!command || command.orderStatus === 'anulado')
      fail(404, 'COMMAND_NOT_FOUND', 'Comanda no disponible.');
    if (command.status === 'listo') fail(409, 'COMMAND_STATE', 'La comanda ya está lista.');
    const next = command.status === 'pendiente' ? 'en_preparacion' : 'listo';
    if (!(await this.repository.advanceCommand(command, next, now())))
      fail(409, 'COMMAND_CHANGED', 'La comanda cambió. Actualiza el listado.');
    return { id, status: next };
  }
}
