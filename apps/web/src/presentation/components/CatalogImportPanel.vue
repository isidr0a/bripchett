<script setup lang="ts">
import { useCatalogImport } from '../../application/composables/useCatalogImport';
import AppPagination from './AppPagination.vue';
import ZonePicker from './ZonePicker.vue';

const {
  workbook,
  fileName,
  currency,
  zoneId,
  zoneName,
  createClients,
  zoneMode,
  preview,
  summary,
  busy,
  error,
  lineFilter,
  page,
  pageSize,
  decisions,
  visible,
  excluded,
  dirty,
  canPreview,
  canApply,
  invalidate,
  choose,
  toggle,
  restoreExcluded,
  run,
} = useCatalogImport();

const actions = {
  crear: 'Crear',
  actualizar: 'Actualizar',
  sin_cambios: 'Sin cambios',
  omitir: 'Omitir',
};
function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  void choose(file);
}
</script>

<template>
  <section class="card stack" aria-labelledby="catalog-import-heading">
    <h2 id="catalog-import-heading">Importar clientes y precios</h2>
    <p>
      Selecciona un reporte <strong>General de Clientes</strong> o <strong>Lista de Precios</strong>
      de Excel. Revisa los cambios antes de aplicarlos.
    </p>
    <label>
      Archivo de Excel
      <input type="file" accept=".xls,.xlsx" :disabled="busy" @change="onFile" />
    </label>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <template v-if="workbook">
      <p class="muted">{{ fileName }} · {{ workbook.rows.length }} filas para revisar.</p>
      <details v-if="workbook.issues.length">
        <summary>{{ workbook.issues.length }} filas que no se pudieron leer</summary>
        <ul>
          <li v-for="issue in workbook.issues" :key="issue.line">
            Fila {{ issue.line }}: {{ issue.text }}
          </li>
        </ul>
      </details>
      <template v-if="workbook.kind === 'prices'">
        <label>
          Moneda de Precio 1
          <select v-model="currency" :disabled="busy" @change="invalidate">
            <option value="COP">Pesos colombianos (COP)</option>
            <option value="USD">Dólares (USD)</option>
            <option value="VES">Bolívares (VES)</option>
          </select>
        </label>
        <p class="muted small">
          Se actualizan nombres y precios base por código. Los importes en USD o VES se convierten a
          COP con la tasa vigente de Configuración. La columna Existencia no se importa.
        </p>
      </template>
      <template v-else>
        <label>
          <span
            ><input v-model="createClients" type="checkbox" :disabled="busy" @change="invalidate" />
            Crear clientes nuevos</span
          >
        </label>
        <fieldset v-if="createClients" :disabled="busy">
          <label>
            Asignación de zonas
            <select v-model="zoneMode" @change="invalidate">
              <option value="automatic">Clasificar con Jev</option>
              <option value="manual">Elegir una zona para todas las altas</option>
            </select>
          </label>
          <ZonePicker
            v-if="zoneMode === 'manual'"
            v-model="zoneId"
            v-model:name="zoneName"
            label="Zona para las altas"
            @update:model-value="invalidate"
          />
          <p v-else class="muted small">
            Jev consulta la dirección y el catálogo de zonas activas. Las direcciones sin una
            coincidencia clara quedan en Sin clasificar.
          </p>
        </fieldset>
        <p class="muted small">
          Se coteja el código o RIF. La descripción puede quedar vacía, en cuyo caso se conserva el
          nombre de las fichas existentes. Los clientes nuevos quedan sin vendedor y tendrán que
          completar su ficha para hacer pedidos.
        </p>
      </template>
      <div class="toolbar">
        <button type="button" :disabled="!canPreview" @click="run()">
          {{ busy ? 'Procesando…' : 'Generar vista previa' }}
        </button>
        <button
          v-if="excluded.size"
          type="button"
          class="secondary"
          :disabled="busy"
          @click="restoreExcluded"
        >
          Volver a incluir las {{ excluded.size }} filas excluidas
        </button>
      </div>
      <p v-if="summary" role="status" class="notice success">
        Importación aplicada: {{ summary.creates }} altas y {{ summary.updates }} actualizaciones.
        {{ summary.skipped }} filas omitidas; {{ summary.unchanged }} sin cambios.
      </p>
      <template v-if="preview">
        <p role="status">
          {{ preview.summary.creates }} altas · {{ preview.summary.updates }} actualizaciones ·
          {{ preview.summary.skipped }} omitidas · {{ preview.summary.unchanged }} sin cambios.
        </p>
        <p v-if="preview.copRate" class="muted">Tasa: 1 USD = {{ preview.copRate }} COP.</p>
        <p v-if="preview.vesRate" class="muted">Tasa: 1 VES = {{ preview.vesRate }} COP.</p>
        <p v-if="preview.zoneWarning" class="notice" role="status">{{ preview.zoneWarning }}</p>
        <p v-if="dirty" class="notice" role="status">
          Se modificó la selección. Genera una nueva vista previa.
        </p>
        <label>
          Mostrar filas
          <select v-model="lineFilter" @change="page = 1">
            <option value="all">Todas</option>
            <option value="omitir">Solo las que se omitirán</option>
          </select>
        </label>
        <div v-if="visible.length" class="table-wrap">
          <table v-responsive-table>
            <thead>
              <tr>
                <th>Fila</th>
                <th>Registro</th>
                <th>Resultado</th>
                <th>Detalle</th>
                <th>Incluir</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in visible" :key="entry.line">
                <td>{{ entry.line }}</td>
                <td>
                  <strong>{{ entry.code }}</strong
                  ><template v-if="entry.name"><br />{{ entry.name }}</template>
                </td>
                <td>{{ actions[entry.action] }}</td>
                <td>{{ entry.note }}</td>
                <td>
                  <input
                    type="checkbox"
                    :aria-label="'Incluir fila ' + entry.line"
                    :disabled="busy"
                    :checked="!excluded.has(entry.line)"
                    @change="toggle(entry.line)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="muted">No hay filas en esta selección.</p>
        <AppPagination
          v-if="decisions.length > pageSize"
          :page="page"
          :page-size="pageSize"
          :total="decisions.length"
          :busy="busy"
          @change="page = $event"
        />
        <div class="toolbar">
          <button type="button" :disabled="!canApply" @click="run(true)">
            Aplicar {{ preview.summary.creates + preview.summary.updates }} cambios
          </button>
        </div>
      </template>
    </template>
  </section>
</template>
