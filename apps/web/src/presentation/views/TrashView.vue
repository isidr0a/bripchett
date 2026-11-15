<script setup lang="ts">
import { trashTypes } from '@briochett/contracts';
import PageHeader from '../components/PageHeader.vue';
import AppPagination from '../components/AppPagination.vue';
import AppModal from '../components/AppModal.vue';
import { useTrash, trashLabels } from '../../application/composables/useTrash';
import { dateTime } from '../../shared/formatters';

const {
  filter,
  selected,
  working,
  restoreError,
  message,
  data,
  page,
  busy,
  error,
  select,
  restore,
} = useTrash();
</script>
<template>
  <PageHeader
    title="Papelera"
    description="Consulta y restaura los registros eliminados del sistema."
  />
  <div class="toolbar">
    <label
      >Tipo de registro
      <select v-model="filter">
        <option value="">Todos los tipos</option>
        <option v-for="type in trashTypes" :key="type" :value="type">
          {{ trashLabels[type] }}
        </option>
      </select>
    </label>
  </div>
  <p v-if="error" class="notice error" role="alert">{{ error }}</p>
  <p v-if="message" class="notice success" role="status">{{ message }}</p>
  <section class="card">
    <p v-if="busy" role="status">Cargando papelera…</p>
    <p v-else-if="!data.items.length" class="empty">No hay registros eliminados de este tipo.</p>
    <div v-if="data.items.length" class="table-wrap">
      <table v-responsive-table>
        <thead>
          <tr>
            <th>Registro</th>
            <th>Tipo</th>
            <th>Eliminado el</th>
            <th>Eliminado por</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in data.items" :key="entry.type + ':' + entry.id">
            <td>
              <strong>{{ entry.label }}</strong
              ><small v-if="entry.context">{{
                entry.type === 'visits' ? dateTime(entry.context) : entry.context
              }}</small>
            </td>
            <td>{{ trashLabels[entry.type] }}</td>
            <td>{{ dateTime(entry.deletedAt) }}</td>
            <td>{{ entry.deletedByName }}</td>
            <td>
              <button
                class="secondary compact"
                :aria-label="'Restaurar ' + entry.label"
                @click="select(entry)"
              >
                Restaurar
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <AppPagination :page="page" :total="data.total" :busy="busy" @change="page = $event" />
  </section>
  <AppModal v-if="selected" title="Restaurar registro" :busy="working" @close="selected = null">
    <form class="stack" @submit.prevent="restore">
      <p>
        <strong>{{ selected.label }}</strong> volverá a su listado habitual.
      </p>
      <p v-if="selected.type === 'routes'" class="muted small">
        Se recuperará esta fecha con las paradas que se eliminaron junto al recorrido.
      </p>
      <p v-if="selected.type === 'orders'" class="muted small">El pedido seguirá anulado.</p>
      <p v-if="restoreError" class="notice error" role="alert">{{ restoreError }}</p>
      <div class="actions">
        <button type="submit" :disabled="working">
          {{ working ? 'Restaurando…' : 'Restaurar registro' }}
        </button>
        <button type="button" class="secondary" :disabled="working" @click="selected = null">
          Cancelar
        </button>
      </div>
    </form>
  </AppModal>
</template>
