import { ref, reactive } from 'vue';
import { productSchema, type Product } from '@briochett/contracts';
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
    form = reactive({ name: '', sku: '', priceCop: '', active: true });
  function edit(p: Product | null) {
    photo.reset(p?.photoId);
    pendingId.value = '';
    selected.value = p;
    Object.assign(
      form,
      p
        ? { name: p.name, sku: p.sku, priceCop: p.priceCop, active: p.active }
        : { name: '', sku: '', priceCop: '', active: true },
    );
    formError.value = '';
    open.value = true;
  }
  async function save() {
    if (saving.value) return;
    if (!pendingId.value) {
      const parsed = productSchema.safeParse({ ...form, priceCop: String(form.priceCop) });
      if (!parsed.success) {
        const field = parsed.error.issues[0]?.path[0];
        formError.value =
          field === 'name'
            ? 'El nombre debe tener entre 2 y 150 caracteres.'
            : field === 'sku'
              ? 'Introduce un código de producto de hasta 40 caracteres.'
              : 'Introduce un precio mayor que cero, con hasta 2 decimales.';
        return;
      }
    }
    saving.value = true;
    formError.value = '';
    try {
      if (!pendingId.value) {
        const saved = await api<Product>(
          selected.value ? '/products/' + selected.value.id : '/products',
          {
            method: selected.value ? 'PATCH' : 'POST',
            body: { ...form, priceCop: String(form.priceCop) },
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
