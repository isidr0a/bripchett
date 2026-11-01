import { describe, expect, it, vi } from 'vitest';
import { clientSchema, type Client, type SessionUser } from '@briochett/contracts';
import type {
  AccountGateway,
  CatalogRepository,
  ManagementRepository,
} from '../apps/api/src/application/ports';
import { CatalogService } from '../apps/api/src/application/services/catalog-service';
import { ManagementService } from '../apps/api/src/application/services/management-service';

const actor: SessionUser = {
  id: 'seller-a',
  name: 'Vendedor',
  email: 'seller@example.invalid',
  username: 'seller',
  role: 'vendedor',
  active: true,
  mustChangePassword: false,
};
function catalogRepository() {
  return {
    findClient: vi.fn<CatalogRepository['findClient']>(),
    listClients: vi.fn<CatalogRepository['listClients']>(),
    sellerExists: vi.fn<CatalogRepository['sellerExists']>(),
    createClient: vi.fn<CatalogRepository['createClient']>(),
    updateClient: vi.fn<CatalogRepository['updateClient']>(),
    completeClient: vi.fn<CatalogRepository['completeClient']>(),
    listProducts: vi.fn<CatalogRepository['listProducts']>(),
    findProducts: vi.fn<CatalogRepository['findProducts']>(),
    createProduct: vi.fn<CatalogRepository['createProduct']>(),
    updateProduct: vi.fn<CatalogRepository['updateProduct']>(),
    listRates: vi.fn<CatalogRepository['listRates']>(),
    latestRate: vi.fn<CatalogRepository['latestRate']>(),
    createRate: vi.fn<CatalogRepository['createRate']>(),
  } satisfies CatalogRepository;
}

describe('Servicios independientes de HTTP y D1', () => {
  it('aplica el alcance del vendedor al consultar un cliente por el puerto', async () => {
    const repository = catalogRepository();
    const client: Client = {
      ...clientSchema.parse({
        name: 'Negocio ajeno',
        sellerId: 'seller-b',
        recurrenceStart: '2026-01-01',
      }),
      id: 'client',
      code: 'CLI-TEST',
      sellerName: null,
      updatedAt: '2026-01-01T00:00:00Z',
    };
    repository.findClient.mockResolvedValue(client);
    await expect(new CatalogService(repository, actor).client(client.id)).rejects.toMatchObject({
      status: 404,
      code: 'CLIENT_NOT_FOUND',
    });
  });

  it('bloquea la autodesactivación administrativa antes de escribir en el repositorio', async () => {
    const admin: SessionUser = { ...actor, role: 'administracion' };
    const repository = {
      listUsers: vi.fn<ManagementRepository['listUsers']>(),
      listSellers: vi.fn<ManagementRepository['listSellers']>(),
      findUser: vi.fn<ManagementRepository['findUser']>().mockResolvedValue(admin),
      recordUserCreation: vi.fn<ManagementRepository['recordUserCreation']>(),
      updateUser: vi.fn<ManagementRepository['updateUser']>(),
      requirePasswordChange: vi.fn<ManagementRepository['requirePasswordChange']>(),
      dashboard: vi.fn<ManagementRepository['dashboard']>(),
      report: vi.fn<ManagementRepository['report']>(),
      listAudit: vi.fn<ManagementRepository['listAudit']>(),
    } satisfies ManagementRepository;
    const accounts = {
      createUser: vi.fn<AccountGateway['createUser']>(),
      setPassword: vi.fn<AccountGateway['setPassword']>(),
    };
    const service = new ManagementService(repository, accounts, admin);
    await expect(
      service.updateUser(admin.id, {
        name: admin.name,
        email: admin.email,
        role: 'administracion',
        active: false,
      }),
    ).rejects.toMatchObject({ status: 422, code: 'SELF_CHANGE' });
    expect(repository.updateUser).not.toHaveBeenCalled();
  });
});
