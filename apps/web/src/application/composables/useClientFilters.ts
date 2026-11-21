import { onMounted, ref } from 'vue';
import type { NamedUser, Page, Zone } from '@briochett/contracts';
import { useAuth } from '../stores/auth';
import { api } from '../../infrastructure/http/api-client';
import { errorMessage } from '../../shared/formatters';

export function useClientFilters() {
  const auth = useAuth();
  const zones = ref<Zone[]>([]);
  const zoneError = ref('');
  const sellers = ref<NamedUser[]>([]);
  const sellerError = ref('');
  async function loadZones() {
    zoneError.value = '';
    try {
      const all: Zone[] = [];
      let page = 1;
      let result: Page<Zone>;
      do {
        result = await api<Page<Zone>>('/zones?page=' + page++);
        all.push(...result.items);
      } while (all.length < result.total && result.items.length);
      zones.value = all;
    } catch (e) {
      zoneError.value = errorMessage(e);
    }
  }
  async function loadSellers() {
    sellerError.value = '';
    try {
      sellers.value = (await api<{ items: NamedUser[] }>('/sellers')).items;
    } catch (e) {
      sellerError.value = errorMessage(e);
    }
  }
  onMounted(() => {
    void loadZones();
    if (auth.user?.role !== 'vendedor') void loadSellers();
  });
  return { auth, zones, zoneError, loadZones, sellers, sellerError, loadSellers };
}
