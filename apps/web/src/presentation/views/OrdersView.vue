<script setup lang="ts">
import { money, statusLabels } from '@briochett/contracts';
import PageHeader from '../components/PageHeader.vue';
import AppPagination from '../components/AppPagination.vue';
import AppModal from '../components/AppModal.vue';
import OrderWizard from '../components/OrderWizard.vue';
import { dateTime } from '../../shared/formatters';
import { useOrders } from '../../application/composables/useOrders';
const { auth, data, page, busy, error, load, creating, detail, working, message, show, action } =
  useOrders();
</script>
<template>
  <PageHeader title="Pedidos" description="Registro, validación y seguimiento de pedidos" />
  <div class="toolbar">
    <button v-if="auth.canSell" @click="creating = true">+ Nuevo pedido</button
    ><button class="secondary" :disabled="busy" @click="load">Actualizar</button>
  </div>
  <p v-if="error" class="notice error" role="alert">{{ error }}</p>
  <section class="card">
    <h2>Listado de pedidos</h2>
    <div class="table-wrap">
      <table v-responsive-table>
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th>Vendedor</th>
            <th>Fecha</th>
            <th>Total</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in data.items" :key="o.id">
            <td class="strong">PED-{{ String(o.number).padStart(4, '0') }}</td>
            <td>{{ o.clientName }}</td>
            <td>{{ o.authorName }}</td>
            <td>{{ dateTime(o.createdAt) }}</td>
            <td>{{ money(o.total, o.currency) }}</td>
            <td>
              <span class="badge" :class="o.status">{{ statusLabels[o.status] }}</span>
            </td>
            <td><button class="secondary compact" @click="show(o.id)">Ver pedido</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!busy && !data.items.length" class="empty">Aún no hay pedidos registrados.</p>
    <AppPagination :page="page" :total="data.total" :busy="busy" @change="page = $event" />
  </section>
  <OrderWizard
    v-if="creating"
    @close="creating = false"
    @saved="
      creating = false;
      load();
    "
  /><AppModal
    v-if="detail"
    :title="'PED-' + String(detail.number).padStart(4, '0')"
    wide
    :busy="working"
    @close="detail = null"
    ><div class="stack">
      <div class="split">
        <h3>{{ detail.clientName }}</h3>
        <span class="badge" :class="detail.status">{{ statusLabels[detail.status] }}</span>
      </div>
      <p class="muted">{{ detail.authorName }} · {{ dateTime(detail.createdAt) }}</p>
      <p>Moneda: {{ detail.currency }} · Tasa aplicada: {{ detail.rate }}</p>
      <div v-for="line in detail.items" :key="line.productId" class="review-line">
        <div>
          <strong>{{ line.name }}</strong
          ><small>{{ line.quantity }} × {{ money(line.unitPrice, detail.currency) }}</small>
        </div>
        <strong>{{ money(line.subtotal, detail.currency) }}</strong>
      </div>
      <div class="summary-bar">
        <span>Total</span><strong>{{ money(detail.total, detail.currency) }}</strong>
      </div>
      <p v-if="detail.notes">{{ detail.notes }}</p>
      <p class="muted small">
        a2: integración no configurada. El pedido está guardado en Briochett.
      </p>
      <p v-if="message" class="notice error" role="alert">{{ message }}</p>
      <div v-if="auth.isAdmin" class="actions">
        <button
          v-if="detail.status === 'pendiente'"
          :disabled="working"
          @click="action('validate')"
        >
          Validar y habilitar preparación</button
        ><button
          v-if="['pendiente', 'validado'].includes(detail.status)"
          class="secondary danger"
          :disabled="working"
          @click="action('cancel')"
        >
          Anular pedido
        </button>
      </div>
    </div></AppModal
  >
</template>
