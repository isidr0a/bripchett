<script setup lang="ts">
import { money, type Order } from '@briochett/contracts';
import AppModal from './AppModal.vue';
import ClientSelector from './ClientSelector.vue';
import ClientForm from './ClientForm.vue';
import AppPagination from './AppPagination.vue';
import { useOrderWizard } from '../../application/composables/useOrderWizard';
const props = defineProps<{ clientId?: string; visitId?: string }>();
const emit = defineEmits<{ close: []; saved: [order: Order] }>();
const {
  draft,
  stage,
  client,
  products,
  page,
  busy,
  error,
  storageError,
  notice,
  title,
  select,
  units,
  adjust,
  review,
  confirm,
  discard,
} = useOrderWizard(props, emit);
</script>
<template>
  <AppModal
    :title="title"
    :wide="stage === 'products' || stage === 'review'"
    :busy="busy"
    @close="emit('close')"
    ><p v-if="notice" class="notice">{{ notice }}</p>
    <p v-if="storageError" class="notice error">
      No se pudo guardar el borrador en este dispositivo. Mantén esta ventana abierta.
    </p>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <ClientSelector v-if="stage === 'client'" @select="select" />
    <ClientForm
      v-else-if="stage === 'completion' && client"
      :key="client.id"
      :client="client"
      completion
      @busy="busy = $event"
      @saved="select"
      @cancel="stage = 'client'"
    />
    <div v-else-if="stage === 'products'" class="stack">
      <div class="split">
        <div>
          <small class="muted">Cliente</small>
          <h3>{{ client?.name }}</h3>
        </div>
        <button class="secondary" @click="stage = 'client'">Buscar o cambiar cliente</button>
      </div>
      <label
        >Moneda del pedido<select v-model="draft.currency">
          <option value="USD">Dólares · USD</option>
          <option value="COP">Pesos colombianos · COP</option>
          <option value="VES">Bolívares · VES</option>
        </select></label
      >
      <p class="muted small">
        Precios base en USD. El resumen aplicará la tasa vigente de la moneda elegida.
      </p>
      <div v-for="p in products.items" :key="p.id" class="product-line">
        <div>
          <strong>{{ p.name }}</strong
          ><small>{{ p.sku }} · {{ money(p.priceUsd, 'USD') }} / unidad</small>
        </div>
        <div class="quantity">
          <button class="secondary" :aria-label="'Restar ' + p.name" @click="adjust(p.id, -1)">
            −</button
          ><input
            v-model.number="draft.quantities[p.id]"
            :aria-label="'Cantidad de ' + p.name"
            type="number"
            min="0"
            max="100000"
            step="1"
            placeholder="0"
          /><button class="secondary" :aria-label="'Sumar ' + p.name" @click="adjust(p.id, 1)">
            +</button
          ><button
            class="secondary"
            :aria-label="'Agregar seis ' + p.name"
            @click="adjust(p.id, 6)"
          >
            +6
          </button>
        </div>
      </div>
      <AppPagination :page="page" :total="products.total" @change="page = $event" />
      <p v-if="!products.items.length" class="empty">
        No hay productos activos. Administración debe agregar productos al catálogo.
      </p>
      <label>Observaciones<textarea v-model="draft.notes" maxlength="1000"></textarea></label>
      <div class="summary-bar">
        <span>Unidades seleccionadas</span><strong>{{ units }}</strong>
      </div>
      <div class="actions">
        <button :disabled="busy || units < 1" @click="review">
          {{ busy ? 'Calculando…' : 'Revisar pedido' }}</button
        ><button class="secondary" @click="emit('close')">Guardar borrador y cerrar</button>
      </div>
    </div>
    <div v-else-if="stage === 'review' && draft.quote" class="stack">
      <h3>{{ client?.name || 'Cliente seleccionado' }}</h3>
      <p>{{ draft.currency }} · Tasa: 1 USD = {{ draft.quote.rate }} {{ draft.currency }}</p>
      <div v-for="line in draft.quote.items" :key="line.productId" class="review-line">
        <div>
          <strong>{{ line.name }}</strong
          ><small>{{ line.quantity }} × {{ money(line.unitPrice, draft.currency) }}</small>
        </div>
        <strong>{{ money(line.subtotal, draft.currency) }}</strong>
      </div>
      <div class="summary-bar">
        <span>{{ draft.quote.units }} unidades · Total</span
        ><strong>{{ money(draft.quote.total, draft.currency) }}</strong>
      </div>
      <p class="muted small">
        Al registrar, el pedido quedará pendiente de validación administrativa. Los precios y la
        tasa de este pedido se conservarán.
      </p>
      <p v-if="draft.attempt" class="notice">
        Se está resolviendo este registro. Puedes reintentar sin crear otro pedido.
      </p>
      <div class="actions">
        <button :disabled="busy" @click="confirm">
          {{
            busy
              ? 'Registrando…'
              : draft.attempt
                ? 'Reintentar registro'
                : 'Confirmar y registrar pedido'
          }}</button
        ><button
          v-if="!draft.attempt"
          class="secondary"
          :disabled="busy"
          @click="stage = 'products'"
        >
          Editar cantidades</button
        ><button v-else class="secondary" :disabled="busy" @click="emit('close')">
          Cerrar y conservar intento
        </button>
      </div>
    </div>
    <button
      v-if="!draft.attempt && stage !== 'completion'"
      class="text-button danger"
      :disabled="busy"
      @click="discard"
    >
      Descartar borrador y empezar de nuevo
    </button></AppModal
  >
</template>
