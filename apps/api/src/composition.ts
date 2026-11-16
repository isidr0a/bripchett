import { ZoneService } from './application/services/zone-service';
import { D1ZoneRepository } from './infrastructure/repositories/zone-repository';
import { TrashService } from './application/services/trash-service';
import { D1TrashRepository } from './infrastructure/repositories/trash-repository';
import { IntegrationService } from './application/services/integration-service';
import { DisabledA2Gateway } from './infrastructure/integrations/a2-gateway';
import type { SessionUser } from '@briochett/contracts';
import type { Bindings } from './config/bindings';
import { CatalogService } from './application/services/catalog-service';
import { OrderService } from './application/services/order-service';
import { PlanningService } from './application/services/planning-service';
import { ManagementService } from './application/services/management-service';
import { BootstrapService } from './application/services/bootstrap-service';
import { createAuth } from './infrastructure/auth/better-auth';
import { BetterAuthAccountGateway } from './infrastructure/auth/account-gateway';
import { D1AuthRepository } from './infrastructure/repositories/auth-repository';
import { D1CatalogRepository } from './infrastructure/repositories/catalog-repository';
import { D1OrderRepository } from './infrastructure/repositories/order-repository';
import { D1PlanningRepository } from './infrastructure/repositories/planning-repository';
import { D1ManagementRepository } from './infrastructure/repositories/management-repository';
import { ProductionReportService } from './application/services/production-report-service';
import { D1ProductionReportRepository } from './infrastructure/repositories/production-report-repository';
import { collectPhotos, PhotoService } from './application/services/photo-service';
import {
  D1PhotoCollection,
  D1PhotoRepository,
} from './infrastructure/repositories/photo-repository';
import { R2PhotoStorage } from './infrastructure/media/r2-photo-storage';
import { WorkerPhotoProcessor } from './infrastructure/media/worker-photo-processor';

export function createServices(
  env: Bindings,
  actor: SessionUser,
  auth: ReturnType<typeof createAuth>,
  headers: Headers,
) {
  const catalogRepository = new D1CatalogRepository(env.DB, actor.id);
  const orderRepository = new D1OrderRepository(env.DB, actor.id);
  const planningRepository = new D1PlanningRepository(env.DB, actor.id);
  const zones = new ZoneService(new D1ZoneRepository(env.DB, actor.id));
  const catalog = new CatalogService(catalogRepository, actor, zones);
  return {
    catalog,
    zones,
    photos: new PhotoService(
      new D1PhotoRepository(env.DB, actor),
      new R2PhotoStorage(env.PHOTOS),
      new WorkerPhotoProcessor(env.IMAGES),
    ),
    trash: new TrashService(new D1TrashRepository(env.DB, actor.id), catalog, actor),
    integration: new IntegrationService(new DisabledA2Gateway(), catalog),
    orders: new OrderService(
      orderRepository,
      catalogRepository,
      planningRepository,
      catalog,
      actor,
    ),
    planning: new PlanningService(planningRepository, orderRepository, catalog, actor, zones),
    productionReport: new ProductionReportService(
      new D1ProductionReportRepository(env.DB, actor.id),
    ),
    management: new ManagementService(
      new D1ManagementRepository(env.DB, actor.id),
      new BetterAuthAccountGateway(auth, headers),
      actor,
    ),
  };
}
export function createAuthentication(env: Bindings, headers: Headers) {
  const auth = createAuth(env),
    repository = new D1AuthRepository(env.DB);
  return {
    auth,
    repository,
    bootstrap: new BootstrapService(repository, new BetterAuthAccountGateway(auth, headers)),
  };
}
export type Services = ReturnType<typeof createServices>;
export type Authentication = ReturnType<typeof createAuthentication>;

export function cleanupPhotos(env: Bindings) {
  return collectPhotos(new D1PhotoCollection(env.DB), new R2PhotoStorage(env.PHOTOS));
}
