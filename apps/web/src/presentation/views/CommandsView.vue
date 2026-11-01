<script setup lang="ts">
import { statusLabels } from '@briochett/contracts';
import PageHeader from '../components/PageHeader.vue';
import AppPagination from '../components/AppPagination.vue';
import { useCommands } from '../../application/composables/useCommands';
const { auth, data, page, busy, error, load, working, advance } = useCommands();
</script>
<template>
  <PageHeader title="Comandas" description="Preparación de pedidos validados por Administración" />
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
