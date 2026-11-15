<script setup lang="ts">
import type {
  ProductionFilters,
  ProductionOption,
  ProductionOptionType,
} from '@briochett/contracts';
import { ref, watch } from 'vue';
import {
  productionDimensions,
  productionOptionKeys,
  productionQuery,
} from '../../application/composables/useProductionReport';
import { debounceRef, useList } from '../../application/composables/use-list';
import AppModal from './AppModal.vue';
import AppPagination from './AppPagination.vue';

const props = defineProps<{
  type: ProductionOptionType;
  filters: ProductionFilters;
  selected?: string;
}>();
const emit = defineEmits<{ close: []; choose: [ProductionOption | null] }>();
const search = ref('');
const searchQuery = debounceRef(search);
const { data, page, busy, error, load } = useList<ProductionOption>(() => {
  const query = productionQuery(props.filters);
  query.delete(productionOptionKeys[props.type]);
  query.set('type', props.type);
  query.set('q', searchQuery.value);
  return '/reports/production/options?' + query;
});
watch(searchQuery, () => (page.value = 1), { flush: 'sync' });
const titles: Record<ProductionOptionType, string> = {
  zone: 'Elegir zona',
  route: 'Elegir ruta',
  client: 'Elegir cliente',
};
const placeholders: Record<ProductionOptionType, string> = {
  zone: 'Nombre de la zona',
  route: 'Nombre o fecha del recorrido',
  client: 'Nombre o código del cliente',
};
</script>

<template>
  <AppModal :title="titles[type]" @close="emit('close')">
    <div class="stack">
      <label>
        Buscar {{ productionDimensions[type].toLowerCase() }}
        <input v-model="search" type="search" :placeholder="placeholders[type]" maxlength="100" />
      </label>
      <button
        type="button"
        class="secondary"
        :aria-pressed="!selected"
        @click="emit('choose', null)"
      >
        {{
          type === 'zone'
            ? 'Todas las zonas'
            : type === 'route'
              ? 'Todas las rutas'
              : 'Todos los clientes'
        }}
      </button>
      <p v-if="busy" role="status">Buscando…</p>
      <p v-else-if="error" class="notice error" role="alert">
        {{ error }} <button type="button" class="text-button" @click="load">Reintentar</button>
      </p>
      <template v-else>
        <ul v-if="data.items.length" class="production-options">
          <li v-for="item in data.items" :key="item.value">
            <button
              type="button"
              class="secondary"
              :aria-pressed="item.value === selected"
              @click="emit('choose', item)"
            >
              {{ item.label }}
            </button>
          </li>
        </ul>
        <p v-else class="muted">No hay opciones para los filtros seleccionados.</p>
      </template>
      <AppPagination :page="page" :total="data.total" :busy="busy" @change="page = $event" />
    </div>
  </AppModal>
</template>

<style scoped>
.production-options {
  padding: 0;
  margin: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}
.production-options button {
  width: 100%;
  text-align: left;
  overflow-wrap: anywhere;
}
.production-options button[aria-pressed='true'] {
  border-color: var(--accent);
}
</style>
