import { ref, watch } from 'vue';
import { zoneSchema, type Zone } from '@briochett/contracts';
import { api } from '../../infrastructure/http/api-client';
import { errorMessage } from '../../shared/formatters';
import { debounceRef, useList } from './use-list';

export function useZoneList(onlyActive = false) {
  const query = ref('');
  const search = debounceRef(query);
  const list = useList<Zone>(
    () => '/zones?q=' + encodeURIComponent(search.value) + (onlyActive ? '&active=true' : ''),
  );
  watch(search, () => {
    list.page.value = 1;
  });
  return { ...list, query };
}

export function useZoneManager() {
  const list = useZoneList();
  const editing = ref<Zone | null>(null),
    open = ref(false),
    name = ref(''),
    active = ref(true),
    working = ref(false),
    issue = ref('');
  function start(zone?: Zone) {
    editing.value = zone ?? null;
    name.value = zone?.name ?? '';
    active.value = zone?.active ?? true;
    issue.value = '';
    open.value = true;
  }
  async function save() {
    const input = zoneSchema.safeParse({ name: name.value, active: active.value });
    if (!input.success) {
      issue.value = 'Introduce un nombre válido para la zona.';
      return;
    }
    working.value = true;
    issue.value = '';
    try {
      await api(editing.value ? '/zones/' + encodeURIComponent(editing.value.id) : '/zones', {
        method: editing.value ? 'PATCH' : 'POST',
        body: input.data,
      });
      open.value = false;
      await list.load();
    } catch (e) {
      issue.value = errorMessage(e);
    } finally {
      working.value = false;
    }
  }
  return { ...list, open, name, active, working, issue, editing, start, save };
}
