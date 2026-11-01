import { ref, reactive } from 'vue';
import { type Product } from '@briochett/contracts';
import { useAuth } from '../stores/auth';
import { api } from '../../infrastructure/http/api-client';
import { errorMessage } from '../../shared/formatters';
import { useList } from './use-list';
export function useProducts() {
  const auth = useAuth(),
    { data, page, busy, error, load } = useList<Product>(() => '/products'),
    open = ref(false),
    selected = ref<Product | null>(null),
    saving = ref(false),
    formError = ref(''),
    form = reactive({ name: '', sku: '', priceUsd: '', active: true });
  function edit(p: Product | null) {
    selected.value = p;
    Object.assign(
      form,
      p
        ? { name: p.name, sku: p.sku, priceUsd: p.priceUsd, active: p.active }
        : { name: '', sku: '', priceUsd: '', active: true },
    );
    formError.value = '';
    open.value = true;
  }
  async function save() {
    saving.value = true;
    formError.value = '';
    try {
      await api(selected.value ? '/products/' + selected.value.id : '/products', {
        method: selected.value ? 'PATCH' : 'POST',
        body: { ...form, priceUsd: String(form.priceUsd) },
      });
      open.value = false;
      load();
    } catch (e) {
      formError.value = errorMessage(e);
    } finally {
      saving.value = false;
    }
  }
  return { auth, data, page, busy, error, open, selected, saving, formError, form, edit, save };
}
