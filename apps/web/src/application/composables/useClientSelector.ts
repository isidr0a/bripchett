import { ref, watch, onUnmounted, useId } from 'vue';
import type { Client, Page } from '@briochett/contracts';
import { api } from '../../infrastructure/http/api-client';
import { errorMessage } from '../../shared/formatters';
export function useClientSelector() {
  const q = ref(''),
    page = ref(1),
    data = ref<Page<Client>>({ items: [], total: 0, page: 1, pageSize: 20 }),
    busy = ref(false),
    error = ref(''),
    listId = useId();
  let timer: ReturnType<typeof setTimeout>, controller: AbortController | undefined;
  async function load() {
    controller?.abort();
    controller = new AbortController();
    const current = controller;
    busy.value = true;
    error.value = '';
    try {
      const response = await api<Page<Client>>(
        '/clients?active=true&page=' + page.value + '&q=' + encodeURIComponent(q.value),
        { signal: controller.signal },
      );
      if (current === controller) data.value = response;
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) error.value = errorMessage(e);
    } finally {
      if (current === controller) busy.value = false;
    }
  }
  watch(q, () => {
    page.value = 1;
    clearTimeout(timer);
    timer = setTimeout(load, 300);
  });
  watch(page, load);
  load();
  onUnmounted(() => {
    clearTimeout(timer);
    controller?.abort();
  });
  return { q, page, data, busy, error, listId, load };
}
