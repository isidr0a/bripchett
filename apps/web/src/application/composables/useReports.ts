import { downloadCsv } from '../../infrastructure/export/csv-download';
import type { Report } from '@briochett/contracts';
import type { NamedUser } from '@briochett/contracts';
import { ref, onMounted } from 'vue';
import { statusLabels } from '@briochett/contracts';
import { api } from '../../infrastructure/http/api-client';
import { errorMessage, today } from '../../shared/formatters';
export function useReports() {
  const from = ref(today().slice(0, 7) + '-01'),
    to = ref(today()),
    seller = ref(''),
    sellers = ref<{ id: string; name: string }[]>([]),
    data = ref<Report | null>(null),
    busy = ref(false),
    error = ref('');
  onMounted(async () => {
    try {
      sellers.value = (await api<{ items: NamedUser[] }>('/sellers')).items;
    } catch (e) {
      error.value = errorMessage(e);
    }
  });
  async function generate() {
    busy.value = true;
    error.value = '';
    try {
      data.value = await api<Report>(
        '/reports?' +
          new URLSearchParams({
            from: from.value,
            to: to.value,
            ...(seller.value ? { sellerId: seller.value } : {}),
          }),
      );
    } catch (e) {
      error.value = errorMessage(e);
    } finally {
      busy.value = false;
    }
  }
  function download() {
    if (!data.value) return;
    const rows = [
      ['Reporte Briochett', data.value.from, data.value.to],
      ['Moneda', 'Pedidos', 'Total'],
      ...data.value.totals.map((r) => [r.currency, r.orders, r.total]),
      ['Base USD', '', data.value.totalUsd],
      [],
      ['Estado de pedido', 'Cantidad'],
      ...data.value.states.map((s) => [statusLabels[s.status], s.total]),
      [],
      ['Visitas', 'Cantidad'],
      ...data.value.visits.map((s) => [statusLabels[s.status], s.total]),
    ];
    downloadCsv('briochett-' + data.value.from + '-' + data.value.to + '.csv', rows);
  }
  return { from, to, seller, sellers, data, busy, error, generate, download };
}
