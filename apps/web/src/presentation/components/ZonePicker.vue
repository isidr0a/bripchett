<script setup lang="ts">
import { computed } from 'vue';
import AppPagination from './AppPagination.vue';
import { useZoneList } from '../../application/composables/useZones';
const props = defineProps<{ label?: string }>();
const id = defineModel<string>({ required: true });
const name = defineModel<string>('name', { required: true });
const { query, data, page, busy, error, load } = useZoneList(true);
const hasCurrent = computed(() => data.value.items.some((zone) => zone.id === id.value));
function select(event: Event) {
  const selectedId = (event.target as HTMLSelectElement).value;
  name.value = data.value.items.find((zone) => zone.id === selectedId)?.name ?? name.value;
  id.value = selectedId;
}
</script>
<template>
  <fieldset class="stack">
    <legend>{{ props.label || 'Zona comercial' }}</legend>
    <label
      >Buscar zona<input
        v-model="query"
        type="search"
        autocomplete="off"
        placeholder="Nombre de la zona"
    /></label>
    <label
      >Zona *<select :value="id" required @change="select">
        <option value="" disabled>Selecciona una zona activa</option>
        <option v-if="id && !hasCurrent" :value="id">{{ name || 'Zona seleccionada' }}</option>
        <option v-for="zone in data.items" :key="zone.id" :value="zone.id">{{ zone.name }}</option>
      </select></label
    >
    <p v-if="busy" class="muted small" role="status">Buscando zonas…</p>
    <p v-else-if="!error && !data.items.length" class="muted small">
      {{
        query
          ? 'No hay zonas que coincidan con la búsqueda.'
          : 'No hay zonas activas. Administración debe habilitar una para continuar.'
      }}
    </p>
    <p v-if="error" class="notice error" role="alert">
      {{ error }} <button type="button" class="text-button" @click="load">Reintentar</button>
    </p>
    <AppPagination
      v-if="data.total > data.pageSize"
      :page="page"
      :total="data.total"
      :busy="busy"
      @change="page = $event"
    />
  </fieldset>
</template>
