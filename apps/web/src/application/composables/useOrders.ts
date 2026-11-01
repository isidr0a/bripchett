import { ref } from 'vue';
import { type Order } from '@briochett/contracts';
import { useAuth } from '../stores/auth';
import { api } from '../../infrastructure/http/api-client';
import { errorMessage } from '../../shared/formatters';
import { useList } from './use-list';
export function useOrders() {
  const auth = useAuth(),
    { data, page, busy, error, load } = useList<Order>(() => '/orders'),
    creating = ref(false),
    detail = ref<Order | null>(null),
    working = ref(false),
    message = ref('');
  async function show(id: string) {
    message.value = '';
    try {
      detail.value = await api<Order>('/orders/' + id);
    } catch (e) {
      error.value = errorMessage(e);
    }
  }
  async function action(kind: 'validate' | 'cancel') {
    if (!detail.value) return;
    working.value = true;
    message.value = '';
    try {
      await api('/orders/' + detail.value.id + '/' + kind, { method: 'POST' });
      await show(detail.value.id);
      load();
    } catch (e) {
      message.value = errorMessage(e);
    } finally {
      working.value = false;
    }
  }
  return { auth, data, page, busy, error, load, creating, detail, working, message, show, action };
}
