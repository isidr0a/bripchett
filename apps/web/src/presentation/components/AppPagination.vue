<script setup lang="ts">
defineProps<{ page: number; total: number; pageSize?: number; busy?: boolean }>();
const emit = defineEmits<{ change: [page: number] }>();
</script>
<template>
  <nav v-if="total > 0" class="pagination" aria-label="Páginas">
    <button class="secondary" :disabled="page <= 1 || busy" @click="emit('change', page - 1)">
      Anterior</button
    ><span
      >Página {{ page }} de {{ Math.max(1, Math.ceil(total / (pageSize || 20))) }} ·
      {{ total }} registros</span
    ><button
      class="secondary"
      :disabled="page * (pageSize || 20) >= total || busy"
      @click="emit('change', page + 1)"
    >
      Siguiente
    </button>
  </nav>
</template>
