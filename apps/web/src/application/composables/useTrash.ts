import { ref, watch } from 'vue';
import type { DeletionResult, DeletionScope, TrashEntry, TrashType } from '@briochett/contracts';
import { api } from '../../infrastructure/http/api-client';
import { errorMessage } from '../../shared/formatters';
import { useList } from './use-list';

export type DeleteTarget = { type: TrashType; id: string; label: string; recurring?: boolean };

export const trashLabels: Record<TrashType, string> = {
  users: 'Usuarios',
  zones: 'Zonas',
  clients: 'Clientes',
  products: 'Productos',
  rates: 'Tasas',
  routes: 'Rutas',
  visits: 'Visitas',
  orders: 'Pedidos',
};

export function useDeleteAction() {
  const scope = ref<DeletionScope>('date');
  const busy = ref(false);
  const error = ref('');
  async function remove(target: DeleteTarget) {
    if (busy.value) return null;
    busy.value = true;
    error.value = '';
    try {
      return await api<DeletionResult>(
        `/${target.type}/${encodeURIComponent(target.id)}` +
          (target.recurring ? '?scope=' + scope.value : ''),
        { method: 'DELETE' },
      );
    } catch (e) {
      error.value = errorMessage(e);
      return null;
    } finally {
      busy.value = false;
    }
  }
  return { scope, busy, error, remove };
}

export function useTrash() {
  const filter = ref<TrashType | ''>('');
  const selected = ref<TrashEntry | null>(null);
  const working = ref(false);
  const restoreError = ref('');
  const message = ref('');
  const { data, page, load, error, busy } = useList<TrashEntry>(
    () => '/trash' + (filter.value ? '?type=' + filter.value : ''),
  );
  watch(filter, () => {
    page.value = 1;
    message.value = '';
  });
  function select(entry: TrashEntry) {
    selected.value = entry;
    message.value = '';
    restoreError.value = '';
  }
  async function restore() {
    const entry = selected.value;
    if (!entry || working.value) return;
    working.value = true;
    restoreError.value = '';
    try {
      await api(`/trash/${entry.type}/${encodeURIComponent(entry.id)}/restore`, { method: 'POST' });
      selected.value = null;
      message.value = 'Registro restaurado.';
      if (page.value > 1 && data.value.items.length === 1) page.value--;
      else await load();
    } catch (e) {
      restoreError.value = errorMessage(e);
    } finally {
      working.value = false;
    }
  }
  return {
    filter,
    selected,
    working,
    restoreError,
    message,
    data,
    page,
    error,
    busy,
    select,
    restore,
  };
}
