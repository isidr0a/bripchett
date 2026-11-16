<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { usePhotoDraft } from '../../application/composables/useRecordPhoto';
import { errorMessage } from '../../shared/formatters';
import PhotoField from './PhotoField.vue';

const props = defineProps<{
  path: string;
  photoId?: string | null;
  label: string;
  portrait?: boolean;
}>();
const emit = defineEmits<{ saved: [photoId: string | null]; busy: [busy: boolean] }>();
const photo = reactive(usePhotoDraft());
const busy = ref(false);
const error = ref('');
const saved = ref(false);
watch(
  () => props.path,
  () => photo.reset(props.photoId),
  { immediate: true },
);
watch(
  () => props.photoId,
  (value) => {
    if (!photo.changed) photo.reset(value);
  },
);
async function save() {
  if (busy.value || !photo.changed) return;
  busy.value = true;
  emit('busy', true);
  error.value = '';
  saved.value = false;
  try {
    emit('saved', await photo.commit(props.path));
    saved.value = true;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
    emit('busy', false);
  }
}
</script>
<template>
  <form class="stack" @submit.prevent="save">
    <PhotoField
      v-model="photo.draft"
      :path="path"
      :photo-id="photo.current"
      :label="label"
      :portrait="portrait"
      :disabled="busy"
    />
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-if="saved && !photo.changed" class="notice success" role="status">Foto actualizada.</p>
    <button v-if="photo.changed" :disabled="busy">
      {{ busy ? 'Guardando foto…' : error ? 'Reintentar foto' : 'Guardar foto' }}
    </button>
  </form>
</template>
