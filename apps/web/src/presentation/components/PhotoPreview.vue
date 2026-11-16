<script setup lang="ts">
import { ref } from 'vue';
import { usePhotoPreview } from '../../application/composables/useRecordPhoto';

const props = defineProps<{
  path?: string;
  photoId?: string | null;
  file?: File | null;
  alt: string;
  compact?: boolean;
  round?: boolean;
  lazy?: boolean;
}>();
const element = ref<HTMLElement | null>(null);
const { source, broken, loading } = usePhotoPreview(element, props);
</script>

<template>
  <div ref="element" class="photo-preview" :class="{ compact, round }">
    <img v-if="source && !broken" :src="source" :alt="alt" @error="broken = true" />
    <span v-else>
      {{
        loading
          ? 'Cargando foto…'
          : broken
            ? file
              ? 'Vista previa al guardar'
              : 'Foto no disponible'
            : 'Sin foto'
      }}
    </span>
  </div>
</template>

<style scoped>
.photo-preview {
  flex: none;
  display: grid;
  place-items: center;
  width: min(180px, 100%);
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  color: var(--muted);
  text-align: center;
  font-size: 12px;
}
.photo-preview img {
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: contain;
}
.photo-preview.compact {
  width: 56px;
  font-size: 9px;
  line-height: 1.2;
}
.photo-preview.compact img,
.photo-preview.round img {
  object-fit: cover;
}
.photo-preview.round {
  border-radius: 50%;
}
</style>
