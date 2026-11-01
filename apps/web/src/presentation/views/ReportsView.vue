<script setup lang="ts">
import { money, statusLabels, type Currency } from '@briochett/contracts';
import PageHeader from '../components/PageHeader.vue';
import { useReports } from '../../application/composables/useReports';
const { from, to, seller, sellers, data, busy, error, generate, download } = useReports();
</script>
<template>
  <PageHeader
    title="Reportes"
    description="Seguimiento de pedidos, importes y visitas comerciales"
  />
  <section class="card">
    <form class="toolbar" @submit.prevent="generate">
      <label>Desde<input v-model="from" type="date" required /></label
      ><label>Hasta<input v-model="to" type="date" required /></label
      ><label
        >Vendedor<select v-model="seller">
          <option value="">Todos</option>
          <option v-for="s in sellers" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select></label
      ><button :disabled="busy">{{ busy ? 'Generando…' : 'Generar reporte' }}</button>
    </form>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-if="!data && !busy" class="empty">Selecciona el período y genera el reporte.</p>
  </section>
  <template v-if="data"
    ><section class="card stack">
      <div class="split">
        <h2>Resultados: {{ data.from }} — {{ data.to }}</h2>
        <button class="secondary" @click="download">Descargar CSV</button>
      </div>
      <div class="metrics">
        <article v-for="t in data.totals" :key="t.currency" class="card inset">
          <small>{{ t.currency }} · {{ t.orders }} pedidos</small
          ><strong>{{ money(t.total, t.currency as Currency) }}</strong>
        </article>
        <article class="card inset">
          <small>Consolidado base USD</small><strong>{{ money(data.totalUsd, 'USD') }}</strong>
        </article>
      </div>
      <p class="muted small">
        Importes sin pedidos anulados. El consolidado usa los precios base en USD conservados en
        cada pedido.
      </p>
    </section>
    <div class="command-grid">
      <section class="card stack">
        <h2>Estados de pedidos</h2>
        <div v-for="s in data.states" :key="s.status" class="split">
          <span>{{ statusLabels[s.status] }}</span
          ><strong>{{ s.total }}</strong>
        </div>
        <p v-if="!data.states.length" class="muted">Sin pedidos en el período.</p>
      </section>
      <section class="card stack">
        <h2>Visitas</h2>
        <div v-for="s in data.visits" :key="s.status" class="split">
          <span>{{ statusLabels[s.status] }}</span
          ><strong>{{ s.total }}</strong>
        </div>
        <p v-if="!data.visits.length" class="muted">Sin visitas en el período.</p>
      </section>
    </div></template
  >
</template>
