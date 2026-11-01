import { ref, onMounted } from 'vue';
import type { Rate } from '@briochett/contracts';
import { api } from '../../infrastructure/http/api-client';
import { errorMessage } from '../../shared/formatters';
export function useSettings() {
  const rates = ref<Rate[]>([]),
    currency = ref('COP'),
    rate = ref(''),
    busy = ref(false),
    error = ref(''),
    success = ref(''),
    integration = ref<{ message: string } | null>(null);
  async function load() {
    try {
      const [r, i] = await Promise.all([
        api<{ items: Rate[] }>('/rates'),
        api<{ message: string }>('/integration/a2'),
      ]);
      rates.value = r.items;
      integration.value = i;
    } catch (e) {
      error.value = errorMessage(e);
    }
  }
  onMounted(load);
  async function save() {
    busy.value = true;
    error.value = '';
    success.value = '';
    try {
      await api('/rates', {
        method: 'POST',
        body: { currency: currency.value, rate: String(rate.value) },
      });
      rate.value = '';
      success.value = 'Tasa registrada. Los pedidos anteriores conservan su tasa original.';
      await load();
    } catch (e) {
      error.value = errorMessage(e);
    } finally {
      busy.value = false;
    }
  }
  return { rates, currency, rate, busy, error, success, integration, save };
}
