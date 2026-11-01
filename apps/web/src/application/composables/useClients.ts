import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { type Client } from '@briochett/contracts';
import { useAuth } from '../stores/auth';
import { api } from '../../infrastructure/http/api-client';
import { errorMessage } from '../../shared/formatters';
import { useList, debounceRef } from './use-list';
export function useClients() {
  const auth = useAuth(),
    router = useRouter(),
    q = ref(''),
    search = debounceRef(q),
    { data, page, busy, error, load } = useList<Client>(
      () => '/clients?q=' + encodeURIComponent(search.value),
    );
  watch(search, () => (page.value = 1));
  const selected = ref<Client | null>(null),
    mode = ref<'detail' | 'edit' | 'new' | 'complete' | null>(null),
    saving = ref(false),
    order = ref<string | null>(null),
    message = ref('');
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  function saved(c: Client) {
    selected.value = c;
    mode.value = 'detail';
    load();
  }
  async function account() {
    try {
      await api('/clients/' + selected.value!.id + '/account');
    } catch (e) {
      message.value = errorMessage(e);
    }
  }
  return {
    auth,
    router,
    q,
    search,
    data,
    page,
    busy,
    error,
    load,
    selected,
    mode,
    saving,
    order,
    message,
    days,
    saved,
    account,
  };
}
