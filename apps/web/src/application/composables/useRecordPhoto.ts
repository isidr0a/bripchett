import { photoChangeSchema, type PhotoChange, type PhotoKind } from '@briochett/contracts';
import { computed, onMounted, onUnmounted, ref, shallowRef, watch, type Ref } from 'vue';
import { api, apiBlob, ApiFailure } from '../../infrastructure/http/api-client';

export type PhotoDraft = File | null | undefined;
export function photoPath(kind: PhotoKind, id: string) {
  return '/' + kind + '/' + encodeURIComponent(id) + '/photo';
}

export function usePhotoDraft() {
  const current = ref<string | null>(null);
  const draft = shallowRef<PhotoDraft>();
  const changed = computed(() => draft.value !== undefined);
  function reset(photoId?: string | null) {
    current.value = photoId ?? null;
    draft.value = undefined;
  }
  async function commit(path: string) {
    const next = draft.value;
    if (next === undefined) return current.value;
    try {
      let result: PhotoChange;
      if (next === null) {
        const query = new URLSearchParams(current.value ? { expectedPhotoId: current.value } : {});
        result = await api<PhotoChange>(path + (query.size ? '?' + query : ''), {
          method: 'DELETE',
        });
      } else {
        const body = new FormData();
        body.append('file', next);
        if (current.value) body.append('expectedPhotoId', current.value);
        result = await api<PhotoChange>(path, { method: 'POST', body });
      }
      reset(result.photoId);
      return result.photoId;
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'PHOTO_CHANGED') {
        const latest = photoChangeSchema.safeParse(error.details);
        if (latest.success) current.value = latest.data.photoId;
      }
      throw error;
    }
  }
  return { current, draft, changed, reset, commit };
}

export function usePhotoPreview(
  element: Ref<HTMLElement | null>,
  props: Readonly<{ path?: string; photoId?: string | null; file?: File | null; lazy?: boolean }>,
) {
  const visible = ref(!props.lazy);
  const source = ref('');
  const broken = ref(false);
  const loading = ref(false);
  let observer: IntersectionObserver | undefined;
  onMounted(() => {
    if (!props.lazy || !element.value || !('IntersectionObserver' in window)) {
      visible.value = true;
      return;
    }
    observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      visible.value = true;
      observer?.disconnect();
    });
    observer.observe(element.value);
  });
  onUnmounted(() => observer?.disconnect());

  watch(
    [() => props.path, () => props.photoId, () => props.file, visible],
    async ([path, photoId, file, ready], _previous, onCleanup) => {
      const controller = new AbortController();
      let url = '';
      source.value = '';
      broken.value = false;
      loading.value = false;
      onCleanup(() => {
        controller.abort();
        if (url) URL.revokeObjectURL(url);
      });
      if (!ready || file === null || (!file && (!path || !photoId))) return;
      try {
        loading.value = !file;
        const image =
          file || (await apiBlob(path + '?v=' + encodeURIComponent(photoId!), controller.signal));
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(image);
        source.value = url;
      } catch {
        if (!controller.signal.aborted) broken.value = true;
      } finally {
        if (!controller.signal.aborted) loading.value = false;
      }
    },
    { immediate: true },
  );
  return { source, broken, loading };
}
