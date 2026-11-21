<script setup lang="ts">
import DeleteRecord from '../components/DeleteRecord.vue';
import CatalogImportPanel from '../components/CatalogImportPanel.vue';

import PageHeader from '../components/PageHeader.vue';
import { dateTime } from '../../shared/formatters';
import { useSettings } from '../../application/composables/useSettings';
const { rates, currency, rate, busy, error, success, integration, current, save, load } =
  useSettings();
</script>
<template>
  <PageHeader title="Configuración" description="Tasas de cambio, importación e integración" />
  <p v-if="error" class="notice error" role="alert">{{ error }}</p>
  <p v-if="success" class="notice success" role="status">{{ success }}</p>
  <section class="card stack">
    <h2>Configuración de monedas</h2>
    <p class="muted">
      Los precios y pedidos usan pesos colombianos como moneda base. Las tasas de dólares y
      bolívares se registran por cada dólar y se usan para calcular su equivalencia en pesos.
    </p>
    <div class="metrics rates">
      <article class="inset card">
        <small>Moneda base</small><strong>Peso colombiano · COP</strong>
      </article>
      <article class="inset card">
        <small>Dólar estadounidense · USD</small>
        <strong>{{ current.usd ? `1 USD = ${current.usd.rate} COP` : 'Sin configurar' }}</strong>
      </article>
      <article class="inset card">
        <small>Bolívar · VES</small>
        <strong>
          {{
            current.copPerVes === null
              ? 'Sin configurar'
              : `1 VES ≈ ${new Intl.NumberFormat('es-CO', { maximumSignificantDigits: 8 }).format(current.copPerVes)} COP`
          }}
        </strong>
        <small v-if="current.ves">1 USD = {{ current.ves.rate }} VES</small>
      </article>
    </div>
    <form class="toolbar" @submit.prevent="save">
      <label
        >Moneda a modificar<select v-model="currency" @change="rate = ''">
          <option value="USD">Dólar estadounidense · USD</option>
          <option value="VES">Bolívar · VES</option>
        </select></label
      >
      <label
        >{{ currency === 'USD' ? 'Pesos colombianos por 1 USD' : 'Bolívares por 1 USD'
        }}<input
          v-model="rate"
          type="text"
          inputmode="decimal"
          pattern="[0-9]+(\.[0-9]{1,6})?"
          :placeholder="currency === 'USD' ? 'Ej. 4200.00' : 'Ej. 120.00'"
          required
      /></label>
      <button :disabled="busy">{{ busy ? 'Guardando…' : 'Guardar tasa' }}</button>
    </form>
    <p class="muted small">
      Para convertir bolívares se necesitan las tasas de dólar y bolívar. Los pedidos anteriores
      conservan su tasa.
    </p>
    <div class="table-wrap">
      <table v-responsive-table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Moneda configurada</th>
            <th>Equivalencia registrada</th>
            <th>Registrada por</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rates" :key="r.id">
            <td>{{ dateTime(r.createdAt) }}</td>
            <td>{{ r.currency === 'COP' ? 'Dólar · USD' : 'Bolívar · VES' }}</td>
            <td>1 USD = {{ r.rate }} {{ r.currency }}</td>
            <td>{{ r.createdBy }}</td>
            <td>
              <DeleteRecord
                :id="r.id"
                type="rates"
                :label="'1 USD = ' + r.rate + ' ' + r.currency"
                @deleted="load"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
  <CatalogImportPanel />
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
      a2 está instalado en un equipo local. La sincronización automática de clientes, el envío de
      pedidos y los estados de cuenta se habilitarán cuando se configure una conexión compatible.
    </p>
    <p class="small muted">Los pedidos se guardan en Briochett. No se han enviado datos a a2.</p>
  </section>
</template>
