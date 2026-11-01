<script setup lang="ts">
import { clientMissing } from '@briochett/contracts';
import { visitSlotTime } from '../../shared/formatters';
import PageHeader from '../components/PageHeader.vue';
import AppPagination from '../components/AppPagination.vue';
import AppModal from '../components/AppModal.vue';
import ClientForm from '../components/ClientForm.vue';
import OrderWizard from '../components/OrderWizard.vue';
import { useClients } from '../../application/composables/useClients';
const {
  auth,
  router,
  q,
  data,
  page,
  busy,
  error,
  load,
  selected,
  mode,
  saving,
  order,
  message,
  days,
  saved,
  account,
} = useClients();
</script>
<template>
  <PageHeader title="Clientes" description="Directorio comercial y asignación a vendedores" />
  <div class="toolbar">
    <label class="search-label"
      >Buscar cliente<input v-model="q" type="search" placeholder="Nombre, código o RIF" /></label
    ><button
      v-if="auth.isAdmin"
      @click="
        selected = null;
        mode = 'new';
      "
    >
      + Nuevo cliente
    </button>
  </div>
  <p v-if="error" class="notice error" role="alert">{{ error }}</p>
  <section class="card">
    <h2>Directorio de clientes</h2>
    <p v-if="busy" role="status">Cargando clientes…</p>
    <div class="table-wrap">
      <table v-responsive-table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>RIF / Contacto</th>
            <th>Zona</th>
            <th>Vendedor</th>
            <th>Estado</th>
            <th><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in data.items" :key="c.id">
            <td>
              <button
                class="text-button strong"
                @click="
                  selected = c;
                  mode = 'detail';
                  message = '';
                "
              >
                {{ c.name }}</button
              ><small>{{ c.code }}</small>
            </td>
            <td>
              {{ c.rif || 'RIF pendiente' }}<small>{{ c.contact }}</small>
            </td>
            <td>{{ c.zone || '—' }}</td>
            <td>{{ c.sellerName || 'Sin asignar' }}</td>
            <td>
              <span class="badge" :class="{ inactive: !c.active }">{{
                c.active ? 'Activo' : 'Inactivo'
              }}</span>
            </td>
            <td>
              <button
                class="secondary compact"
                @click="
                  selected = c;
                  mode = 'detail';
                  message = '';
                "
              >
                Ver ficha
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!busy && !data.items.length" class="empty">No hay clientes para esta búsqueda.</p>
    <AppPagination :page="page" :total="data.total" :busy="busy" @change="page = $event" />
  </section>
  <AppModal
    v-if="mode"
    :title="
      mode === 'new'
        ? 'Nuevo cliente'
        : mode === 'complete'
          ? 'Completar datos del cliente'
          : mode === 'edit'
            ? 'Editar cliente'
            : selected?.name || 'Cliente'
    "
    :wide="mode !== 'detail'"
    :busy="saving"
    @close="mode = null"
    ><ClientForm
      v-if="mode !== 'detail'"
      :key="(selected?.id || 'new') + mode"
      :client="selected || undefined"
      :completion="mode === 'complete'"
      @busy="saving = $event"
      @saved="saved"
      @cancel="mode = null"
    />
    <div v-else-if="selected" class="stack">
      <div class="detail-grid">
        <div>
          <small>Código</small>
          <p>{{ selected.code }}</p>
        </div>
        <div>
          <small>RIF</small>
          <p>{{ selected.rif || 'Pendiente' }}</p>
        </div>
        <div>
          <small>Contacto</small>
          <p>{{ selected.contact || 'Pendiente' }}</p>
        </div>
        <div>
          <small>Teléfono</small>
          <p>{{ selected.phone || 'Pendiente' }}</p>
        </div>
        <div>
          <small>Dirección</small>
          <p>{{ selected.address || 'Pendiente' }}</p>
        </div>
        <div>
          <small>Vendedor</small>
          <p>{{ selected.sellerName || 'Sin asignar' }}</p>
        </div>
      </div>
      <div class="card inset">
        <h3>Ubicación del negocio</h3>
        <p v-if="selected.geo">
          {{ selected.geo.latitude.toFixed(6) }}, {{ selected.geo.longitude.toFixed(6) }} · ±{{
            Math.round(selected.geo.accuracy)
          }}
          m
        </p>
        <p v-else class="muted">Ubicación pendiente</p>
        <p class="small" :class="clientMissing(selected).length ? 'muted' : 'success-text'">
          {{
            clientMissing(selected).length
              ? 'Falta completar: ' + clientMissing(selected).join(', ')
              : 'Datos completos'
          }}
        </p>
      </div>
      <section>
        <h3>Disponibilidad de visitas</h3>
        <p v-for="(slot, i) in selected.slots" :key="i">
          {{ days[slot.day] }} · {{ visitSlotTime(slot) }}
        </p>
        <p v-if="!selected.slots.length" class="muted">Sin horarios configurados.</p>
        <p class="muted small">{{ selected.recurrence }} · Desde {{ selected.recurrenceStart }}</p>
      </section>
      <p v-if="message" class="notice" role="status">{{ message }}</p>
      <div class="actions">
        <button v-if="auth.isAdmin" @click="mode = 'edit'">Editar cliente</button
        ><button v-if="auth.canSell" class="secondary" @click="mode = 'complete'">
          Completar datos y GPS</button
        ><button class="secondary" @click="account">Consultar estado de cuenta</button
        ><button
          v-if="auth.canSell && selected.active"
          class="secondary"
          @click="
            order = selected.id;
            mode = null;
          "
        >
          Crear pedido</button
        ><button
          v-if="auth.canSell && selected.active"
          class="secondary"
          @click="router.push('/rutas?cliente=' + selected.id)"
        >
          Programar visita
        </button>
      </div>
    </div></AppModal
  >
  <OrderWizard
    v-if="order"
    :client-id="order"
    @close="order = null"
    @saved="
      order = null;
      load();
    "
  />
</template>
