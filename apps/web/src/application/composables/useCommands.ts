import { ref } from 'vue';

import { useAuth } from '../stores/auth';
import { api } from '../../infrastructure/http/api-client';
import { errorMessage } from '../../shared/formatters';
import { useList } from './use-list';
export function useCommands() {
  type Command = {
    id: string;
    number: number;
    clientName: string;
    status: string;
    notes: string;
    items: { name: string; sku: string; quantity: number }[];
  };
  const auth = useAuth(),
    { data, page, busy, error, load } = useList<Command>(() => '/commands'),
    working = ref('');
  async function advance(k: Command) {
    working.value = k.id;
    try {
      await api('/commands/' + k.id + '/advance', { method: 'POST' });
      await load();
    } catch (e) {
      error.value = errorMessage(e);
    } finally {
      working.value = '';
    }
  }
  return { auth, data, page, busy, error, load, working, advance };
}
