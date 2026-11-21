<script setup lang="ts">
import type { Client } from '@briochett/contracts';
import AppPagination from './AppPagination.vue';
import ClientFilters from './ClientFilters.vue';
import { reactive, ref } from 'vue';
import { useClientSelector } from '../../application/composables/useClientSelector';
const props = defineProps<{ zoneId?: string; sellerId?: string }>();
const emit = defineEmits<{ select: [client: Client] }>();
const selectedZoneId = ref('');
const selectedSellerId = ref('');
const filters = reactive({
  get zoneId() {
    return props.zoneId || selectedZoneId.value;
  },
  get sellerId() {
    return props.sellerId || selectedSellerId.value;
  },
});
const { q, page, data, busy, error, listId, load } = useClientSelector(filters);
</script>
<template>
  <div class="stack">
    <p class="muted">
      Busca por nombre comercial, código o RIF.
      {{
        props.zoneId
          ? 'Solo aparecen clientes activos de la zona y el vendedor de la ruta.'
          : 'Solo aparecen clientes activos de tu alcance.'
      }}
    </p>
    <label
      >Buscar cliente<input
        v-model="q"
        type="search"
        placeholder="Nombre, código o RIF…"
        autocomplete="off"
        role="combobox"
        :aria-expanded="true"
        :aria-controls="listId"
    /></label>
    <ClientFilters
      v-if="!props.zoneId && !props.sellerId"
      v-model:zone-id="selectedZoneId"
      v-model:seller-id="selectedSellerId"
    />
    <p v-if="error" class="notice error" role="alert">
      {{ error }} <button class="text-button" @click="load">Reintentar</button>
    </p>
    <p v-if="busy" role="status">Buscando clientes…</p>
    <div :id="listId" class="search-results" role="listbox" aria-label="Clientes encontrados">
      <button
        v-for="client in data.items"
        :key="client.id"
        class="client-result secondary"
        role="option"
        :aria-selected="false"
        @click="emit('select', client)"
      >
        <strong>{{ client.name || client.code }}</strong
        ><span>{{ client.name ? client.code + ' · ' : '' }}{{ client.rif || 'RIF pendiente' }}</span
        ><small
          >{{ client.zone || 'Zona pendiente' }} ·
          {{ client.sellerName || 'Sin vendedor asignado' }}</small
        >
      </button>
    </div>
    <p v-if="!busy && !data.items.length" class="empty">
      No encontramos clientes. Prueba otro nombre, código o RIF.
    </p>
    <AppPagination :page="page" :total="data.total" :busy="busy" @change="page = $event" />
  </div>
</template>
