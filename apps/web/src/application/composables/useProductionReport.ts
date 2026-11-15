import {
  productionFiltersSchema,
  productionStateLabels,
  type ProductionFilters,
  type ProductionOption,
  type ProductionOptionType,
  type ProductionReport,
  type ProductionState,
} from '@briochett/contracts';
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { api } from '../../infrastructure/http/api-client';
import { downloadCsv } from '../../infrastructure/export/csv-download';
import { errorMessage } from '../../shared/formatters';

const endpoint = '/reports/production';
export const productionDimensions = {
  zone: 'Zona',
  route: 'Ruta',
  client: 'Cliente',
} as const;
export const productionOptionKeys = { zone: 'zone', route: 'route', client: 'clientId' } as const;

export function productionQuery(filters: ProductionFilters) {
  const query = new URLSearchParams({ state: filters.state });
  for (const key of ['from', 'to', 'zone', 'route', 'clientId'] as const) {
    const value = filters[key];
    if (value) query.set(key, value);
  }
  return query;
}

export function useProductionReport() {
  const from = ref('');
  const to = ref('');
  const state = ref<ProductionState>('open');
  const selections = reactive<Partial<Record<ProductionOptionType, ProductionOption>>>({});
  const editing = ref<ProductionOptionType | null>(null);
  const busy = ref(false);
  const error = ref('');
  const result = ref<{ report: ProductionReport; filters: [string, string][] } | null>(null);
  const draft = computed<ProductionFilters>(() => ({
    state: state.value,
    from: from.value || undefined,
    to: to.value || undefined,
    zone: selections.zone?.value,
    route: selections.route?.value,
    clientId: selections.client?.value,
  }));
  const validDates = computed(() => !from.value || !to.value || from.value <= to.value);
  let controller: AbortController | undefined;

  function choose(option: ProductionOption | null) {
    if (!editing.value) return;
    if (option) selections[editing.value] = option;
    else delete selections[editing.value];
    editing.value = null;
  }

  async function generate() {
    const parsed = productionFiltersSchema.safeParse(draft.value);
    if (!parsed.success) {
      error.value = parsed.error.issues[0].message;
      return;
    }
    const filters: [string, string][] = [
      ['Emisión desde', parsed.data.from ?? 'Sin límite'],
      ['Emisión hasta', parsed.data.to ?? 'Sin límite'],
      ['Estado', productionStateLabels[parsed.data.state]],
      ['Zona', selections.zone?.label ?? 'Todas'],
      ['Ruta', selections.route?.label ?? 'Todas'],
      ['Cliente', selections.client?.label ?? 'Todos'],
    ];
    controller?.abort();
    const current = new AbortController();
    controller = current;
    busy.value = true;
    error.value = '';
    try {
      const report = await api<ProductionReport>(endpoint + '?' + productionQuery(parsed.data), {
        signal: current.signal,
      });
      if (controller === current) result.value = { report, filters };
    } catch (e) {
      if (!current.signal.aborted) error.value = errorMessage(e);
    } finally {
      if (controller === current) busy.value = false;
    }
  }

  function download() {
    if (!result.value) return;
    const { report, filters } = result.value;
    const rows = [
      ['Totales de producción'],
      ...filters,
      ['Comandas distintas', report.totals.commands],
      ['Productos distintos', report.totals.products],
      ['Unidades totales', report.totals.units],
      [],
      ['SKU', 'Producto', 'Unidades', 'Comandas'],
      ...report.items.map((product) => [
        product.sku,
        product.name,
        product.units,
        product.commands,
      ]),
    ];
    downloadCsv(
      'briochett-produccion.csv',
      rows.map((row) =>
        row.map((value) =>
          typeof value === 'string' && /^\s*[=+\-@]|^[\t\r\n]/u.test(value) ? "'" + value : value,
        ),
      ),
    );
  }

  onMounted(generate);
  onUnmounted(() => controller?.abort());
  return {
    from,
    to,
    state,
    selections,
    editing,
    draft,
    validDates,
    busy,
    error,
    result,
    choose,
    generate,
    download,
  };
}
