import type {
  ClientInput,
  CompletionInput,
  ProductInput,
  RateInput,
  SessionUser,
} from '@briochett/contracts';
import type { CatalogRepository, Pagination } from '../ports';
import { fail } from '../../domain/errors';
import { now, uid } from '../../domain/primitives';

export class CatalogService {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly actor: SessionUser,
  ) {}

  async client(id: string, active = false) {
    const client = await this.repository.findClient(id);
    if (
      !client ||
      (this.actor.role === 'vendedor' && (client.sellerId !== this.actor.id || !client.active))
    )
      fail(404, 'CLIENT_NOT_FOUND', 'No se encontró el cliente en tu alcance.');
    if (active && !client.active) fail(409, 'CLIENT_INACTIVE', 'El cliente está desactivado.');
    return client;
  }
  async requireSeller(id: string | null) {
    if (id && !(await this.repository.sellerExists(id)))
      fail(422, 'SELLER', 'Selecciona un vendedor activo.');
  }
  listClients(pagination: Pagination, query: string, active: boolean) {
    const q = query.trim().slice(0, 100),
      tokens = q.normalize('NFKC').match(/[\p{L}\p{N}]+/gu) || [];
    if (q && !tokens.length)
      return Promise.resolve({
        items: [],
        total: 0,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });
    const search = tokens.map((t) => '"' + t.replaceAll('"', '""') + '"*').join(' AND ');
    return this.repository.listClients({
      ...pagination,
      active,
      search,
      sellerId: this.actor.role === 'vendedor' ? this.actor.id : undefined,
    });
  }
  async createClient(input: ClientInput) {
    await this.requireSeller(input.sellerId);
    const id = uid();
    await this.repository.createClient(
      id,
      'CLI-' + id.slice(0, 8).toUpperCase(),
      this.normalizeClient(input),
      now(),
    );
    return this.client(id);
  }
  async updateClient(id: string, input: ClientInput) {
    const old = await this.client(id);
    await this.requireSeller(input.sellerId);
    const responsible =
      JSON.stringify(input.geo) !== JSON.stringify(old.geo)
        ? this.actor.id
        : old.geoUpdatedBy || null;
    await this.repository.updateClient(id, this.normalizeClient(input), responsible, now());
    return this.client(id);
  }
  async completeClient(id: string, input: CompletionInput) {
    await this.client(id, true);
    if (!input.geo) fail(422, 'GPS_REQUIRED', 'Confirma la ubicación del cliente.');
    if (new Date(input.geo.capturedAt).getTime() > Date.now() + 60000)
      fail(422, 'GPS_DATE', 'La fecha de captura no es válida.');
    const changed = await this.repository.completeClient(
      id,
      { ...input, rif: this.normalizeRif(input.rif) },
      this.actor.role === 'vendedor' ? this.actor.id : undefined,
      now(),
    );
    if (!changed) fail(409, 'CLIENT_CHANGED', 'El cliente cambió; vuelve a consultar su ficha.');
    return this.client(id);
  }
  listProducts(pagination: Pagination, active: boolean) {
    return this.repository.listProducts({
      ...pagination,
      active: active || this.actor.role === 'vendedor',
    });
  }
  async createProduct(input: ProductInput) {
    const id = uid(),
      at = now();
    await this.repository.createProduct(id, input, at);
    return { id, ...input, updatedAt: at };
  }
  async updateProduct(id: string, input: ProductInput) {
    if (!(await this.repository.updateProduct(id, input, now())))
      fail(404, 'NOT_FOUND', 'Producto no encontrado.');
    return { id, ...input };
  }
  async listRates() {
    return { items: await this.repository.listRates() };
  }
  async createRate(input: RateInput) {
    const id = uid(),
      at = now();
    await this.repository.createRate(id, input, at);
    return { id, ...input, createdAt: at };
  }
  private normalizeRif(rif: string) {
    return rif.toUpperCase().replaceAll(' ', '');
  }
  private normalizeClient(input: ClientInput) {
    return { ...input, rif: this.normalizeRif(input.rif) };
  }
}
