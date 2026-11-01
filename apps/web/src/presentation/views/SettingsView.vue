<script setup lang="ts">
import PageHeader from '../components/PageHeader.vue';
import { dateTime } from '../../shared/formatters';
import { useSettings } from '../../application/composables/useSettings';
const { rates, currency, rate, busy, error, success, integration, save } = useSettings();
</script>
<template>
  <PageHeader title="Configuración" description="Tasas de cambio e integración administrativa" />
  <p v-if="error" class="notice error" role="alert">{{ error }}</p>
  <p v-if="success" class="notice success" role="status">{{ success }}</p>
  <section class="card stack">
    <h2>Tasas de cambio</h2>
    <p class="muted">
      Precios base en USD. Registra cuántos pesos colombianos o bolívares equivalen a un dólar.
    </p>
    <div class="metrics rates">
      <article class="inset card">
        <small>1 USD en COP</small
        ><strong>{{ rates.find((r) => r.currency === 'COP')?.rate || 'Sin configurar' }}</strong>
      </article>
      <article class="inset card">
        <small>1 USD en VES</small
        ><strong>{{ rates.find((r) => r.currency === 'VES')?.rate || 'Sin configurar' }}</strong>
      </article>
    </div>
    <form class="toolbar" @submit.prevent="save">
      <label
        >Moneda<select v-model="currency">
          <option value="COP">Pesos colombianos · COP</option>
          <option value="VES">Bolívares · VES</option>
        </select></label
      ><label
        >Unidades por 1 USD<input
          v-model="rate"
          type="text"
          inputmode="decimal"
          pattern="[0-9]+(\.[0-9]{1,6})?"
          placeholder="Ej. 4200.00"
          required /></label
      ><button :disabled="busy">{{ busy ? 'Guardando…' : 'Registrar tasa' }}</button>
    </form>
    <div class="table-wrap">
      <table v-responsive-table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Moneda</th>
            <th>Unidades / USD</th>
            <th>Registrada por</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rates" :key="r.id">
            <td>{{ dateTime(r.createdAt) }}</td>
            <td>{{ r.currency }}</td>
            <td>{{ r.rate }}</td>
            <td>{{ r.createdBy }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
  <section class="card stack">
    <h2>Integración con a2</h2>
    <span class="badge inactive">Integración no configurada</span>
    <p>
      {{
        integration?.message ||
        'Pendiente de confirmar la versión y configurar el conector local de a2.'
      }}
    </p>
    <p class="muted">
      a2 está instalado en un equipo local. La importación y alta de clientes, el envío de pedidos y
      los estados de cuenta se habilitarán cuando se configure una conexión compatible.
    </p>
    <p class="small muted">Los pedidos se guardan en Briochett. No se han enviado datos a a2.</p>
  </section>
</template>
