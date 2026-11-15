<script setup lang="ts">
import { statusLabels } from '@briochett/contracts';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import AppPagination from '../components/AppPagination.vue';
import ProductionReport from '../components/ProductionReport.vue';
import { useCommands } from '../../application/composables/useCommands';
const { auth, data, page, busy, error, load, working, advance } = useCommands();
const route = useRoute();
const router = useRouter();
const production = computed(() => route.query.vista === 'produccion');
</script>
<template>
  <PageHeader title="Comandas" description="Preparación de pedidos validados por Administración" />
  <div class="toolbar">
    <div class="tabs" role="group" aria-label="Vistas de comandas">
      <button
        type="button"
        :class="{ secondary: production }"
        :aria-pressed="!production"
        @click="router.push('/comandas')"
      >
        Listado
      </button>
      <button
        type="button"
        :class="{ secondary: !production }"
        :aria-pressed="production"
        @click="router.push('/comandas?vista=produccion')"
      >
        Totales de producción
      </button>
    </div>
  </div>
  <ProductionReport v-if="production" />
  <template v-else>
    <div class="toolbar">
      <button class="secondary" :disabled="busy" @click="load">Actualizar comandas</button>
    </div>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <div class="command-grid">
      <article v-for="k in data.items" :key="k.id" class="card stack">
        <div class="split">
          <h2>PED-{{ String(k.number).padStart(4, '0') }}</h2>
          <span class="badge" :class="k.status">{{
            k.status === 'pendiente' ? 'Pendiente' : statusLabels[k.status]
          }}</span>
        </div>
        <h3>{{ k.clientName }}</h3>
        <div v-for="line in k.items" :key="line.sku" class="split">
          <span>{{ line.name }}</span
          ><strong>{{ line.quantity }} u.</strong>
        </div>
        <p v-if="k.notes" class="notice">{{ k.notes }}</p>
        <button
          v-if="auth.user?.role !== 'supervision' && k.status !== 'listo'"
          :disabled="!!working"
          @click="advance(k)"
        >
          {{
            working === k.id
              ? 'Guardando…'
              : k.status === 'pendiente'
                ? 'Iniciar preparación'
                : 'Marcar lista'
          }}
        </button>
      </article>
    </div>
    <p v-if="!busy && !data.items.length" class="card empty">
      No hay comandas disponibles. Los pedidos deben ser validados por Administración.
    </p>
    <AppPagination :page="page" :total="data.total" :busy="busy" @change="page = $event" />
  </template>
</template>
