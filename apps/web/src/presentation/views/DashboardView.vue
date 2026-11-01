<script setup lang="ts">
import PageHeader from '../components/PageHeader.vue';
import { useDashboard } from '../../application/composables/useDashboard';
const { auth, data, error, load } = useDashboard();
</script>
<template>
  <PageHeader title="Dashboard" description="Resumen de la operación comercial" />
  <p v-if="error" class="notice error" role="alert">
    {{ error }} <button class="text-button" @click="load">Reintentar</button>
  </p>
  <div v-if="data" class="metrics">
    <article class="card">
      <small>Clientes activos</small><strong>{{ data.clients }}</strong>
    </article>
    <article class="card">
      <small>Pedidos registrados</small><strong>{{ data.orders }}</strong>
    </article>
    <article class="card">
      <small>Pendientes de validación</small><strong>{{ data.pending }}</strong>
    </article>
    <article class="card">
      <small>Visitas programadas</small><strong>{{ data.scheduled }}</strong>
    </article>
  </div>
  <section class="card">
    <h2>Tu operación</h2>
    <p class="muted">
      {{
        auth.isAdmin
          ? 'Gestiona tu equipo, planifica las visitas y valida los pedidos antes de preparación.'
          : auth.canSell
            ? 'Revisa tus visitas y registra los pedidos de tus clientes asignados.'
            : 'Consulta el estado de los pedidos y el seguimiento comercial.'
      }}
    </p>
    <div class="actions">
      <RouterLink class="button" to="/pedidos">Ver pedidos</RouterLink
      ><RouterLink class="button secondary" to="/rutas">Rutas y visitas</RouterLink
      ><RouterLink class="button secondary" to="/clientes">Directorio de clientes</RouterLink>
    </div>
  </section>
</template>
