import { ref, reactive } from 'vue';
import { type Product } from '@briochett/contracts';
import { useAuth } from '../stores/auth';
import { api } from '../../infrastructure/http/api-client';
import { errorMessage } from '../../shared/formatters';
import { useList } from './use-list';
import { photoPath, usePhotoDraft } from './useRecordPhoto';
export function useProducts() {
  const photo = reactive(usePhotoDraft());
  const pendingId = ref('');
  const auth = useAuth(),
    { data, page, busy, error, load } = useList<Product>(() => '/products'),
    open = ref(false),
    selected = ref<Product | null>(null),
    saving = ref(false),
    formError = ref(''),
    form = reactive({ name: '', sku: '', priceUsd: '', active: true });
  function edit(p: Product | null) {
    photo.reset(p?.photoId);
    pendingId.value = '';
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
    if (saving.value) return;
    saving.value = true;
    formError.value = '';
    try {
      if (!pendingId.value) {
        const saved = await api<Product>(
          selected.value ? '/products/' + selected.value.id : '/products',
          {
            method: selected.value ? 'PATCH' : 'POST',
            body: { ...form, priceUsd: String(form.priceUsd) },
          },
        );
        pendingId.value = saved.id;
      }
      await photo.commit(photoPath('products', pendingId.value));
      close();
    } catch (e) {
      formError.value = errorMessage(e);
    } finally {
      saving.value = false;
    }
  }
  function close() {
    if (pendingId.value) void load();
    open.value = false;
    photo.reset();
    pendingId.value = '';
  }
  return {
    auth,
    data,
    page,
    busy,
    error,
    open,
    selected,
    saving,
    formError,
    form,
    edit,
    save,
    photo,
    pendingId,
    close,
    load,
  };
}
