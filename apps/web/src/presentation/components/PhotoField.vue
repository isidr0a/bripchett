<script setup lang="ts">
import { maxPhotoBytes, photoPickerAccept } from '@briochett/contracts';
import { ref } from 'vue';
import type { PhotoDraft } from '../../application/composables/useRecordPhoto';
import PhotoPreview from './PhotoPreview.vue';

defineProps<{
  label: string;
  path?: string;
  photoId?: string | null;
  disabled?: boolean;
  portrait?: boolean;
}>();
const draft = defineModel<PhotoDraft>();
const gallery = ref<HTMLInputElement | null>(null);
const camera = ref<HTMLInputElement | null>(null);
const error = ref('');
function select(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  error.value = '';
  if (file.size > maxPhotoBytes) {
    error.value = 'La foto debe pesar como máximo 10 MB.';
    return;
  }
  draft.value = file;
}
</script>
<template>
  <fieldset class="stack">
    <legend>{{ label }}</legend>
    <PhotoPreview :path="path" :photo-id="photoId" :file="draft" :alt="label" :round="portrait" />
    <p class="small muted">JPG, PNG, WebP o HEIC. Hasta 10 MB.</p>
    <p v-if="draft" class="small photo-filename">{{ draft.name }}</p>
    <input
      ref="gallery"
      type="file"
      hidden
      :accept="photoPickerAccept"
      :disabled="disabled"
      @change="select"
    />
    <input
      ref="camera"
      type="file"
      hidden
      accept="image/*"
      :capture="portrait ? 'user' : 'environment'"
      :disabled="disabled"
      @change="select"
    />
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <div class="photo-actions">
      <button
        type="button"
        class="secondary photo-camera"
        :disabled="disabled"
        @click="camera?.click()"
      >
        Tomar foto
      </button>
      <button type="button" class="secondary" :disabled="disabled" @click="gallery?.click()">
        <span class="photo-desktop">Elegir archivo</span
        ><span class="photo-mobile">Elegir de la galería</span>
      </button>
      <button
        v-if="draft || (photoId && draft !== null)"
        type="button"
        class="secondary"
        :disabled="disabled"
        @click="draft = photoId ? null : undefined"
      >
        Quitar foto
      </button>
      <button
        v-if="draft === null"
        type="button"
        class="secondary"
        :disabled="disabled"
        @click="draft = undefined"
      >
        Conservar foto
      </button>
    </div>
  </fieldset>
</template>
<style scoped>
.photo-filename {
  overflow-wrap: anywhere;
}
.photo-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.photo-mobile,
.photo-actions .photo-camera {
  display: none;
}
@media (max-width: 767px), (pointer: coarse) {
  .photo-desktop {
    display: none;
  }
  .photo-mobile {
    display: inline;
  }
  .photo-actions .photo-camera {
    display: inline-flex;
  }
}
</style>
