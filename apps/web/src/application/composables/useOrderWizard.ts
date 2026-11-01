import type { OrderInput } from '@briochett/contracts';
import { ref, reactive, computed, watch, onMounted } from 'vue';
import {
  clientMissing,
  type Client,
  type Product,
  type Page,
  type Currency,
  type Quote,
  type Order,
} from '@briochett/contracts';
import { useAuth } from '../stores/auth';
import { api, ApiFailure } from '../../infrastructure/http/api-client';
import { errorMessage } from '../../shared/formatters';
import { readDraft, writeDraft, removeDraft } from '../../infrastructure/storage/draft-storage';
export function useOrderWizard(
  props: Readonly<{ clientId?: string; visitId?: string }>,
  emit: { (event: 'close'): void; (event: 'saved', order: Order): void },
) {
  const auth = useAuth(),
    key = 'briochett:order:' + auth.user!.id;
  type Draft = {
    clientId: string;
    currency: Currency;
    quantities: Record<string, number>;
    notes: string;
    key: string;
    visitId?: string;
    attempt: OrderInput | null;
    quote: Quote | null;
  };
  const blank = (): Draft => ({
      clientId: props.clientId || '',
      currency: 'USD',
      quantities: {},
      notes: '',
      key: crypto.randomUUID(),
      visitId: props.visitId,
      attempt: null,
      quote: null,
    }),
    restored = readDraft<Draft | null>(key, null),
    draft = reactive<Draft>(restored || blank());
  const stage = ref<'client' | 'completion' | 'products' | 'review'>(
      draft.attempt ? 'review' : 'client',
    ),
    client = ref<Client | null>(null),
    products = ref<Page<Product>>({ items: [], total: 0, page: 1, pageSize: 20 }),
    page = ref(1),
    busy = ref(false),
    error = ref(''),
    storageError = ref(false),
    notice = ref(restored ? 'Se recuperó el borrador de tu pedido.' : '');
  const title = computed(
    () =>
      ({
        client: 'Seleccionar cliente',
        completion: 'Completar datos del cliente',
        products: 'Registrar pedido',
        review: 'Revisar pedido',
      })[stage.value],
  );
  watch(
    draft,
    () => {
      storageError.value = !writeDraft(key, draft);
    },
    { deep: true, flush: 'sync' },
  );
  async function select(c: Client) {
    client.value = c;
    draft.clientId = c.id;
    stage.value =
      auth.user?.role === 'vendedor' && clientMissing(c).length ? 'completion' : 'products';
    error.value = '';
  }
  async function loadProducts() {
    try {
      products.value = await api<Page<Product>>('/products?active=true&page=' + page.value);
    } catch (e) {
      error.value = errorMessage(e);
    }
  }
  watch(page, loadProducts);
  onMounted(async () => {
    await loadProducts();
    if (draft.clientId)
      try {
        const c = await api<Client>('/clients/' + draft.clientId);
        client.value = c;
        if (!draft.attempt) await select(c);
      } catch (e) {
        error.value = errorMessage(e);
        stage.value = 'client';
      }
  });
  const units = computed(() =>
    Object.values(draft.quantities).reduce((a, b) => a + (Number(b) || 0), 0),
  );
  function adjust(id: string, amount: number) {
    draft.quantities[id] = Math.max(
      0,
      Math.min(100000, (Number(draft.quantities[id]) || 0) + amount),
    );
  }
  async function review() {
    error.value = '';
    busy.value = true;
    try {
      const items = Object.entries(draft.quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([productId, quantity]) => ({ productId, quantity: Number(quantity) }));
      draft.quote = await api<Quote>('/orders/quote', {
        method: 'POST',
        body: { clientId: draft.clientId, currency: draft.currency, items },
      });
      stage.value = 'review';
    } catch (e) {
      error.value = errorMessage(e);
      if (e instanceof ApiFailure && e.code === 'CLIENT_INCOMPLETE') {
        client.value = await api<Client>('/clients/' + draft.clientId);
        stage.value = 'completion';
      }
    } finally {
      busy.value = false;
    }
  }
  async function confirm() {
    if (!draft.quote) return;
    error.value = '';
    busy.value = true;
    draft.attempt ??= {
      clientId: draft.clientId,
      currency: draft.currency,
      items: draft.quote.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      quoteVersion: draft.quote.version,
      notes: draft.notes,
      visitId: draft.visitId || null,
    };
    try {
      const order = await api<Order>('/orders', {
        method: 'POST',
        body: draft.attempt,
        headers: { 'Idempotency-Key': draft.key },
      });
      removeDraft(key);
      emit('saved', order);
    } catch (e) {
      error.value = errorMessage(e);
      if (
        e instanceof ApiFailure &&
        e.status >= 400 &&
        e.status < 500 &&
        e.code !== 'IDEMPOTENCY_CONFLICT'
      ) {
        draft.attempt = null;
        if (e.code === 'QUOTE_CHANGED') await review();
        if (e.code === 'CLIENT_INCOMPLETE') {
          client.value = await api<Client>('/clients/' + draft.clientId);
          stage.value = 'completion';
        }
      }
    } finally {
      busy.value = false;
    }
  }
  function discard() {
    if (draft.attempt) return;
    removeDraft(key);
    Object.assign(draft, blank());
    client.value = null;
    stage.value = 'client';
    notice.value = '';
  }
  return {
    key,
    draft,
    stage,
    client,
    products,
    page,
    busy,
    error,
    storageError,
    notice,
    title,
    select,
    units,
    adjust,
    review,
    confirm,
    discard,
  };
}
