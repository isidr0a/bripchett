import { computed, ref } from 'vue';
import type {
  CatalogImport,
  CatalogImportPreview,
  CatalogImportSummary,
  Currency,
} from '@briochett/contracts';
import { api, ApiFailure } from '../../infrastructure/http/api-client';
import { type CatalogWorkbook } from '../../infrastructure/imports/catalog-xls';
const maxSize = 2 * 1024 * 1024;
const pageSize = 12;

export function useCatalogImport() {
  const workbook = ref<CatalogWorkbook>();
  const fileName = ref('');
  const currency = ref<Currency>('COP');
  const zoneId = ref('');
  const zoneName = ref('');
  const createClients = ref(true);
  const zoneMode = ref<'automatic' | 'manual'>('automatic');
  const preview = ref<CatalogImportPreview>();
  const summary = ref<CatalogImportSummary>();
  const busy = ref(false);
  const error = ref('');
  const lineFilter = ref<'all' | 'omitir'>('all');
  const page = ref(1);
  const excluded = ref(new Set<number>());
  const dirty = ref(false);
  const decisions = computed(
    () =>
      preview.value?.decisions.filter((d) => lineFilter.value === 'all' || d.action === 'omitir') ??
      [],
  );
  const visible = computed(() =>
    decisions.value.slice((page.value - 1) * pageSize, page.value * pageSize),
  );
  const request = (): CatalogImport | undefined => {
    const current = workbook.value;
    if (!current) return;
    if (current.kind === 'clients')
      return {
        kind: 'clients',
        rows: current.rows.filter((r) => !excluded.value.has(r.line)),
        ...(createClients.value
          ? zoneMode.value === 'automatic'
            ? { classifyZones: true }
            : { zoneId: zoneId.value }
          : {}),
      };
    if (currency.value)
      return {
        kind: 'prices',
        currency: currency.value,
        rows: current.rows.filter((r) => !excluded.value.has(r.line)),
      };
  };
  const canPreview = computed(
    () =>
      !!workbook.value &&
      !busy.value &&
      !!request()?.rows.length &&
      (!createClients.value || zoneMode.value === 'automatic' || !!zoneId.value),
  );
  const canApply = computed(
    () =>
      !!preview.value &&
      !busy.value &&
      !dirty.value &&
      preview.value.summary.creates + preview.value.summary.updates > 0,
  );
  function invalidate() {
    dirty.value = true;
    summary.value = undefined;
  }
  async function choose(file?: File) {
    workbook.value = undefined;
    fileName.value = '';
    preview.value = undefined;
    summary.value = undefined;
    error.value = '';
    excluded.value = new Set();
    currency.value = 'COP';
    zoneId.value = '';
    zoneName.value = '';
    createClients.value = true;
    zoneMode.value = 'automatic';
    if (!file) return;
    busy.value = true;
    try {
      if (file.size > maxSize) throw new Error('El archivo supera el máximo de 2 MB.');
      const { parseCatalogWorkbook } = await import('../../infrastructure/imports/catalog-xls');
      workbook.value = parseCatalogWorkbook(await file.arrayBuffer());
      fileName.value = file.name;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'No se pudo leer el archivo.';
    } finally {
      busy.value = false;
    }
  }
  function toggle(line: number) {
    if (!excluded.value.delete(line)) excluded.value.add(line);
    invalidate();
  }
  function restoreExcluded() {
    excluded.value.clear();
    invalidate();
  }
  async function run(apply = false) {
    const input = request();
    if (!input || !canPreview.value || (apply && !canApply.value)) return;
    busy.value = true;
    error.value = '';
    summary.value = undefined;
    try {
      const response = await api<CatalogImportPreview>('/catalog-import', {
        method: 'POST',
        body: {
          ...input,
          ...(apply
            ? {
                revision: preview.value?.revision,
                ...(input.kind === 'clients' && input.classifyZones
                  ? { zoneAssignments: preview.value?.zoneAssignments }
                  : {}),
              }
            : {}),
        },
      });
      if (apply) {
        summary.value = response.summary;
        preview.value = undefined;
      } else {
        preview.value = response;
        page.value = 1;
        lineFilter.value = 'all';
      }
      dirty.value = false;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'No se pudo completar la importación.';
      if (e instanceof ApiFailure && e.code === 'IMPORT_CHANGED') invalidate();
    } finally {
      busy.value = false;
    }
  }
  return {
    workbook,
    fileName,
    currency,
    zoneId,
    zoneName,
    createClients,
    zoneMode,
    preview,
    summary,
    busy,
    error,
    lineFilter,
    page,
    pageSize,
    decisions,
    visible,
    excluded,
    dirty,
    canPreview,
    canApply,
    invalidate,
    choose,
    toggle,
    restoreExcluded,
    run,
  };
}
