import type { A2Gateway } from '../ports';
import type { CatalogService } from './catalog-service';

export class IntegrationService {
  constructor(
    private readonly gateway: A2Gateway,
    private readonly catalog: CatalogService,
  ) {}
  status() {
    return {
      configured: false,
      status: 'no_configurado',
      source: 'equipo_local',
      message: 'Pendiente de confirmar la versión y configurar el conector local de a2.',
    };
  }
  importClients() {
    return this.gateway.importClients();
  }
  async pushClient(id: string) {
    await this.catalog.client(id);
    return this.gateway.pushClient(id);
  }
  async accountStatement(id: string) {
    await this.catalog.client(id);
    return this.gateway.getAccountStatement(id);
  }
  pushOrder(id: string) {
    return this.gateway.pushOrder(id);
  }
}
