<script setup lang="ts">
import AppModal from '../components/AppModal.vue';
import AppPagination from '../components/AppPagination.vue';
import DeleteRecord from '../components/DeleteRecord.vue';
import PageHeader from '../components/PageHeader.vue';
import { useZoneManager } from '../../application/composables/useZones';
const {
  query,
  data,
  page,
  busy,
  error,
  load,
  editing,
  open,
  name,
  active,
  working,
  issue,
  start,
  save,
} = useZoneManager();
</script>
<template>
  <PageHeader title="Zonas" description="Gestiona las zonas comerciales de clientes y rutas." />
  <div class="toolbar">
    <label
      >Buscar zona<input v-model="query" type="search" placeholder="Nombre de la zona"
    /></label>
    <button @click="start()">+ Nueva zona</button>
  </div>
  <p v-if="error" class="notice error" role="alert">{{ error }}</p>
  <section class="card">
    <p v-if="busy" role="status">Cargando zonas…</p>
    <p v-else-if="!data.items.length" class="empty">No hay zonas para mostrar.</p>
    <div v-if="data.items.length" class="table-wrap">
      <table v-responsive-table>
        <thead>
          <tr>
            <th>Zona</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="zone in data.items" :key="zone.id">
            <td>
              <strong>{{ zone.name }}</strong>
            </td>
            <td>
              <span class="badge" :class="{ inactive: !zone.active }">{{
                zone.active ? 'Activa' : 'Inactiva'
              }}</span>
            </td>
            <td>
              <button class="secondary compact" @click="start(zone)">Editar</button>
              <DeleteRecord :id="zone.id" type="zones" :label="zone.name" @deleted="load" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <AppPagination :page="page" :total="data.total" :busy="busy" @change="page = $event" />
  </section>
  <AppModal
    v-if="open"
    :title="editing ? 'Editar zona' : 'Nueva zona'"
    :busy="working"
    @close="open = false"
  >
    <form class="stack" @submit.prevent="save">
      <label>Nombre de la zona *<input v-model="name" required maxlength="100" /></label>
      <label class="check"><input v-model="active" type="checkbox" /> Zona activa</label>
      <p v-if="editing" class="muted small">
        Para desactivar una zona, reasigna sus clientes y resuelve los recorridos pendientes.
      </p>
      <p v-if="issue" class="notice error" role="alert">{{ issue }}</p>
      <div class="actions">
        <button :disabled="working">{{ working ? 'Guardando…' : 'Guardar zona' }}</button>
        <button type="button" class="secondary" :disabled="working" @click="open = false">
          Cancelar
        </button>
      </div>
    </form>
  </AppModal>
</template>
