import type { DeletionScope, SessionUser, TrashType } from '@briochett/contracts';
import type { Pagination, TrashRepository } from '../ports';
import type { CatalogService } from './catalog-service';
import { ApplicationError, fail } from '../../domain/errors';
import { now } from '../../domain/primitives';
import { visitFits } from '../../domain/scheduling';

export class TrashService {
  constructor(
    private readonly repository: TrashRepository,
    private readonly catalog: CatalogService,
    private readonly actor: SessionUser,
  ) {}

  private requireAdmin() {
    if (this.actor.role !== 'administracion')
      fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
  }

  list(pagination: Pagination, type?: TrashType) {
    this.requireAdmin();
    return this.repository.list(pagination, type);
  }

  async remove(type: TrashType, id: string, scope: DeletionScope) {
    this.requireAdmin();
    if (type === 'users' && id === this.actor.id)
      fail(409, 'TRASH_SELF', 'No puedes eliminar tu propia cuenta.');
    const affected = await this.repository.remove(type, id, scope, now());
    if (affected === null) fail(404, 'NOT_FOUND', 'No se encontró el registro.');
    return { affected };
  }

  async restore(type: TrashType, id: string) {
    this.requireAdmin();
    const versions: Record<string, string> = Object.create(null);
    if (type === 'visits' || type === 'routes') {
      const visits = await this.repository.restoreVisits(type, id);
      for (const visit of visits) {
        try {
          const client = await this.catalog.client(visit.clientId, true);
          await this.catalog.requireSeller(visit.sellerId);
          if (client.sellerId !== visit.sellerId || !visitFits(client, visit.scheduledAt))
            fail(
              409,
              'TRASH_RESTORE_DEPENDENCY',
              'La asignación, el horario o la recurrencia del cliente cambió.',
            );
          versions[client.id] = client.updatedAt;
        } catch (error) {
          if (!(error instanceof ApplicationError)) throw error;
          fail(
            409,
            'TRASH_RESTORE_DEPENDENCY',
            `No se puede recuperar la visita del ${visit.scheduledAt.slice(0, 10)}. ${error.message}`,
          );
        }
      }
    }
    if (!(await this.repository.restore(type, id, versions)))
      fail(
        409,
        'TRASH_RESTORE_CONFLICT',
        'El registro o sus dependencias cambiaron. Actualiza la papelera y vuelve a intentar.',
      );
    return { affected: 1 };
  }
}
