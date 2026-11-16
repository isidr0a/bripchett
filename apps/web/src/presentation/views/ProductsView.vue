<script setup lang="ts">
import DeleteRecord from '../components/DeleteRecord.vue';
import { money } from '@briochett/contracts';
import PageHeader from '../components/PageHeader.vue';
import AppPagination from '../components/AppPagination.vue';
import AppModal from '../components/AppModal.vue';
import PhotoField from '../components/PhotoField.vue';
import PhotoPreview from '../components/PhotoPreview.vue';
import { photoPath } from '../../application/composables/useRecordPhoto';
import { useProducts } from '../../application/composables/useProducts';
const {
  auth,
  data,
  page,
  busy,
  error,
  open,
  selected,
  saving,
  formError,
  form,
  edit,
  save,
  load,
  photo,
  pendingId,
  close,
} = useProducts();
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
            <td class="strong">
              <div class="photo-cell">
                <PhotoPreview
                  :path="photoPath('products', p.id)"
                  :photo-id="p.photoId"
                  alt=""
                  compact
                  lazy
                />
                <span>{{ p.name }}</span>
              </div>
            </td>
            <td>{{ p.sku }}</td>
            <td>{{ money(p.priceUsd, 'USD') }}</td>
            <td>{{ p.active ? 'Activo' : 'Inactivo' }}</td>
            <td v-if="auth.isAdmin">
              <button class="secondary compact" @click="edit(p)">Editar</button>
              <DeleteRecord :id="p.id" type="products" :label="p.name" @deleted="load" />
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
    @close="close"
    ><form class="stack" @submit.prevent="save">
      <template v-if="!pendingId">
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
        ><label class="check"
          ><input v-model="form.active" type="checkbox" /> Producto activo</label
        >
      </template>
      <p v-else class="notice" role="status">Los datos del producto ya se guardaron.</p>
      <PhotoField
        v-model="photo.draft"
        :path="pendingId || selected ? photoPath('products', pendingId || selected!.id) : undefined"
        :photo-id="photo.current"
        label="Foto del producto"
        :disabled="saving"
      />
      <p v-if="formError" class="notice error" role="alert">{{ formError }}</p>
      <div class="actions">
        <button :disabled="saving">
          {{ saving ? 'Guardando…' : pendingId ? 'Reintentar foto' : 'Guardar producto' }}
        </button>
        <button v-if="pendingId" type="button" class="secondary" :disabled="saving" @click="close">
          Terminar sin aplicar la foto
        </button>
      </div>
    </form></AppModal
  >
</template>
