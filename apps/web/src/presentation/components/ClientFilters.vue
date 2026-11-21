<script setup lang="ts">
import { useClientFilters } from '../../application/composables/useClientFilters';
const zoneId = defineModel<string>('zoneId', { required: true });
const sellerId = defineModel<string>('sellerId', { required: true });
const { auth, zones, zoneError, loadZones, sellers, sellerError, loadSellers } = useClientFilters();
</script>
<template>
  <div class="client-filters">
    <label
      >Zona<select v-model="zoneId">
        <option value="">Todas las zonas</option>
        <option v-for="zone in zones" :key="zone.id" :value="zone.id">
          {{ zone.name }}{{ zone.active ? '' : ' (inactiva)' }}
        </option>
      </select></label
    >
    <label v-if="auth.user?.role !== 'vendedor'"
      >Vendedor<select v-model="sellerId">
        <option value="">Todos los vendedores</option>
        <option v-for="seller in sellers" :key="seller.id" :value="seller.id">
          {{ seller.name }}
        </option>
      </select></label
    >
    <p v-if="zoneError" class="notice error" role="alert">
      {{ zoneError }}
      <button type="button" class="text-button" @click="loadZones">Reintentar</button>
    </p>
    <p v-if="sellerError" class="notice error" role="alert">
      {{ sellerError }}
      <button type="button" class="text-button" @click="loadSellers">Reintentar</button>
    </p>
  </div>
</template>
