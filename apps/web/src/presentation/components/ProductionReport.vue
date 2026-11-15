<script setup lang="ts">
import {
  productionOptionTypes,
  productionStateLabels,
  productionStates,
} from '@briochett/contracts';
import {
  productionDimensions,
  useProductionReport,
} from '../../application/composables/useProductionReport';
import ProductionOptionPicker from './ProductionOptionPicker.vue';

const {
  from,
  to,
  state,
  selections,
  editing,
  draft,
  validDates,
  busy,
  error,
  result,
  choose,
  generate,
  download,
} = useProductionReport();
const numbers = new Intl.NumberFormat('es-VE');
</script>

<template>
  <section class="card stack" aria-labelledby="production-filters-heading">
    <h2 id="production-filters-heading">Totales de producción</h2>
    <form class="production-filters" @submit.prevent="generate">
      <label>Emisión desde<input v-model="from" type="date" /></label>
      <label>Emisión hasta<input v-model="to" type="date" /></label>
      <label class="production-wide">
        Estado de comanda
        <select v-model="state">
          <option v-for="option in productionStates" :key="option" :value="option">
            {{ productionStateLabels[option] }}
          </option>
        </select>
      </label>
      <div
        v-for="type in productionOptionTypes"
        :key="type"
        class="production-filter"
        :class="{ 'production-wide': type === 'client' }"
      >
        <span>{{ productionDimensions[type] }}</span>
        <button
          type="button"
          class="secondary"
          :aria-label="
            productionDimensions[type] + ': ' + (selections[type]?.label || 'sin filtro')
          "
          aria-haspopup="dialog"
          :disabled="!validDates"
          @click="editing = type"
        >
          {{ selections[type]?.label ?? (type === 'client' ? 'Todos' : 'Todas') }}
        </button>
      </div>
      <div class="toolbar production-wide">
        <button type="submit" :disabled="busy">
          {{ busy ? 'Calculando…' : 'Aplicar filtros' }}
        </button>
      </div>
    </form>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-if="busy" class="muted" role="status">Calculando el consolidado…</p>
  </section>

  <section v-if="result" class="card stack" aria-labelledby="production-result-heading">
    <div class="split">
      <h2 id="production-result-heading">Productos para producción</h2>
      <button type="button" class="secondary" @click="download">Descargar CSV</button>
    </div>
    <dl class="production-applied">
      <div v-for="[label, value] in result.filters" :key="label">
        <dt>{{ label }}</dt>
        <dd>{{ value }}</dd>
      </div>
    </dl>
    <div class="metrics production-metrics">
      <article class="card inset">
        <small>Unidades</small><strong>{{ numbers.format(result.report.totals.units) }}</strong>
      </article>
      <article class="card inset">
        <small>Productos</small><strong>{{ numbers.format(result.report.totals.products) }}</strong>
      </article>
      <article class="card inset">
        <small>Comandas</small><strong>{{ numbers.format(result.report.totals.commands) }}</strong>
      </article>
    </div>
    <div v-if="result.report.items.length" class="table-wrap">
      <table v-responsive-table aria-labelledby="production-result-heading">
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col">SKU</th>
            <th scope="col">Unidades</th>
            <th scope="col">Comandas</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="product in result.report.items" :key="product.productId">
            <td>
              <strong>{{ product.name }}</strong>
            </td>
            <td>{{ product.sku }}</td>
            <td>
              <strong>{{ numbers.format(product.units) }}</strong>
            </td>
            <td>{{ numbers.format(product.commands) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="empty">No hay comandas para los filtros aplicados.</p>
  </section>

  <ProductionOptionPicker
    v-if="editing"
    :type="editing"
    :filters="draft"
    :selected="selections[editing]?.value"
    @choose="choose"
    @close="editing = null"
  />
</template>

<style scoped>
.production-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 270px), 1fr));
  gap: 14px;
  align-items: end;
}
.production-filter {
  display: grid;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  min-width: 0;
}
.production-filter button {
  justify-content: flex-start;
  text-align: left;
  overflow-wrap: anywhere;
}
.production-applied {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin: 0;
  font-size: 12px;
}
.production-applied dt {
  color: var(--muted);
}
.production-applied dd {
  margin: 2px 0 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.production-metrics {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
@media (max-width: 480px) {
  .production-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .production-wide {
    grid-column: 1 / -1;
  }
  .production-filters input {
    min-width: 0;
  }
  .production-filters button[type='submit'] {
    width: 100%;
  }
  .production-metrics {
    gap: 6px;
  }
  .production-metrics .inset {
    padding: 8px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .split {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
