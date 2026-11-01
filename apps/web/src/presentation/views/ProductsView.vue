<script setup lang="ts">
import { money } from '@briochett/contracts';
import PageHeader from '../components/PageHeader.vue';
import AppPagination from '../components/AppPagination.vue';
import AppModal from '../components/AppModal.vue';
import { useProducts } from '../../application/composables/useProducts';
const { auth, data, page, busy, error, open, selected, saving, formError, form, edit, save } =
  useProducts();
</script>
<template>
  <PageHeader title="Productos" description="Catálogo y precios base en dólares" />
  <div class="toolbar">
    <button v-if="auth.isAdmin" @click="edit(null)">+ Nuevo producto</button>
  </div>
  <p v-if="error" class="notice error" role="alert">{{ error }}</p>
  <section class="card">
    <h2>Catálogo de productos</h2>
    <div class="table-wrap">
      <table v-responsive-table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Código</th>
            <th>Precio USD</th>
            <th>Estado</th>
            <th v-if="auth.isAdmin">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in data.items" :key="p.id">
            <td class="strong">{{ p.name }}</td>
            <td>{{ p.sku }}</td>
            <td>{{ money(p.priceUsd, 'USD') }}</td>
            <td>{{ p.active ? 'Activo' : 'Inactivo' }}</td>
            <td v-if="auth.isAdmin">
              <button class="secondary compact" @click="edit(p)">Editar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!busy && !data.items.length" class="empty">Aún no hay productos en el catálogo.</p>
    <AppPagination :page="page" :total="data.total" :busy="busy" @change="page = $event" />
  </section>
  <AppModal
    v-if="open"
    :title="selected ? 'Editar producto' : 'Nuevo producto'"
    :busy="saving"
    @close="open = false"
    ><form class="stack" @submit.prevent="save">
      <label>Nombre<input v-model="form.name" required maxlength="150" /></label
      ><label>Código de producto<input v-model="form.sku" required maxlength="40" /></label
      ><label
        >Precio base USD<input
          v-model="form.priceUsd"
          type="number"
          min="0.01"
          max="9999999.99"
          step="0.01"
          required /></label
      ><label class="check"><input v-model="form.active" type="checkbox" /> Producto activo</label>
      <p v-if="formError" class="notice error" role="alert">{{ formError }}</p>
      <button :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar producto' }}</button>
    </form></AppModal
  >
</template>
