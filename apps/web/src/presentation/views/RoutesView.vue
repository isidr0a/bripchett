<script setup lang="ts">
import { statusLabels } from '@briochett/contracts';
import PageHeader from '../components/PageHeader.vue';
import AppPagination from '../components/AppPagination.vue';
import AppModal from '../components/AppModal.vue';
import ClientSelector from '../components/ClientSelector.vue';
import OrderWizard from '../components/OrderWizard.vue';
import { dateTime, visitSlotTime } from '../../shared/formatters';
import { useRoutes } from '../../application/composables/useRoutes';
const {
  auth,
  tab,
  routes,
  visits,
  sellers,
  modal,
  busy,
  error,
  selecting,
  client,
  visit,
  wizard,
  form,
  scheduled,
  notes,
  nextEnabled,
  nextAt,
  days,
  openRoute,
  openSchedule,
  addStop,
  move,
  saveRoute,
  saveVisit,
  showVisit,
  showStop,
  editRoute,
  noOrder,
  withOrder,
} = useRoutes();
</script>
<template>
  <PageHeader
    title="Rutas y visitas"
    description="Planificación comercial y registro de clientes visitados"
  />
  <div class="toolbar">
    <div class="tabs">
      <button :class="tab === 'routes' ? '' : 'secondary'" @click="tab = 'routes'">Rutas</button
      ><button :class="tab === 'visits' ? '' : 'secondary'" @click="tab = 'visits'">Visitas</button>
    </div>
    <button v-if="auth.isAdmin" @click="openRoute">+ Nueva ruta</button
    ><button v-if="auth.canSell" class="secondary" @click="openSchedule">Programar visita</button>
  </div>
  <p v-if="!modal && error" class="notice error" role="alert">{{ error }}</p>
  <template v-if="tab === 'routes'"
    ><p v-if="routes.error.value" class="notice error">{{ routes.error.value }}</p>
    <div class="command-grid">
      <article v-for="r in routes.data.value.items" :key="r.id" class="card stack">
        <div>
          <h2>{{ r.name }}</h2>
          <p class="muted">{{ r.date }} · {{ r.sellerName }}</p>
        </div>
        <button v-if="auth.isAdmin" class="secondary" @click="editRoute(r)">
          Editar ruta y orden de paradas
        </button>
        <ol class="route-stops">
          <li v-for="s in r.stops" :key="s.visitId">
            <strong>{{ s.time }}</strong
            ><span>{{ s.clientName }}</span
            ><button class="secondary compact" @click="showStop(s.visitId)">Ver visita</button>
          </li>
        </ol>
      </article>
    </div>
    <p v-if="!routes.busy.value && !routes.data.value.items.length" class="card empty">
      No hay rutas planificadas.
    </p>
    <AppPagination
      :page="routes.page.value"
      :total="routes.data.value.total"
      @change="routes.page.value = $event"
  /></template>
  <section v-else class="card">
    <h2>Visitas programadas y registradas</h2>
    <p v-if="visits.error.value" class="notice error">{{ visits.error.value }}</p>
    <div class="table-wrap">
      <table v-responsive-table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Fecha y hora</th>
            <th>Vendedor</th>
            <th>Resultado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in visits.data.value.items" :key="v.id">
            <td class="strong">{{ v.clientName }}</td>
            <td>{{ dateTime(v.scheduledAt) }}</td>
            <td>{{ v.sellerName }}</td>
            <td>{{ statusLabels[v.status] }}</td>
            <td>
              <button class="secondary compact" @click="showVisit(v)">
                {{ v.status === 'programada' && auth.canSell ? 'Registrar visita' : 'Ver detalle' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!visits.busy.value && !visits.data.value.items.length" class="empty">
      No hay visitas para mostrar.
    </p>
    <AppPagination
      :page="visits.page.value"
      :total="visits.data.value.total"
      @change="visits.page.value = $event"
    />
  </section>
  <AppModal
    v-if="modal"
    :title="
      modal === 'route'
        ? 'Planificar ruta'
        : modal === 'schedule'
          ? 'Programar visita'
          : 'Registro de visita'
    "
    :busy="busy"
    wide
    @close="modal = null"
    ><p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <template v-if="modal === 'route'"
      ><div v-if="selecting" class="stack">
        <ClientSelector @select="addStop" /><button class="secondary" @click="selecting = false">
          Volver a la ruta
        </button>
      </div>
      <form v-else class="stack" @submit.prevent="saveRoute">
        <label>Nombre de la ruta<input v-model="form.name" required maxlength="100" /></label>
        <div class="form-grid">
          <label
            >Vendedor<select v-model="form.sellerId" required @change="form.stops = []">
              <option value="" disabled>Selecciona un vendedor</option>
              <option v-for="s in sellers" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select></label
          ><label>Fecha de visitas<input v-model="form.date" type="date" required /></label>
        </div>
        <p class="muted small">
          Las paradas deben respetar los días, horarios y recurrencia de cada negocio. Puedes
          cambiar su orden.
        </p>
        <div v-for="(s, i) in form.stops" :key="s.clientId" class="stop-editor">
          <strong>{{ i + 1 }}. {{ s.clientName }}</strong
          ><label>Hora<input v-model="s.time" type="time" required /></label>
          <div class="actions">
            <button
              type="button"
              class="secondary compact"
              :disabled="i === 0"
              aria-label="Subir parada"
              @click="move(i, -1)"
            >
              ↑</button
            ><button
              type="button"
              class="secondary compact"
              :disabled="i === form.stops.length - 1"
              aria-label="Bajar parada"
              @click="move(i, 1)"
            >
              ↓</button
            ><button type="button" class="secondary compact" @click="form.stops.splice(i, 1)">
              Quitar
            </button>
          </div>
        </div>
        <button
          type="button"
          class="secondary"
          :disabled="!form.sellerId"
          @click="selecting = true"
        >
          Agregar cliente a la ruta</button
        ><button :disabled="busy || !form.stops.length">
          {{ busy ? 'Guardando…' : 'Guardar ruta y visitas' }}
        </button>
      </form></template
    >
    <template v-else-if="modal === 'schedule'"
      ><ClientSelector v-if="!client" @select="client = $event" />
      <form v-else class="stack" @submit.prevent="saveVisit">
        <h3>{{ client.name }}</h3>
        <p class="muted">{{ client.recurrence }} · Desde {{ client.recurrenceStart }}</p>
        <p v-for="(s, i) in client.slots" :key="i" class="small">
          {{ days[s.day] }}: {{ visitSlotTime(s) }}
        </p>
        <p v-if="!client.slots.length" class="notice">
          Administración debe configurar los horarios de este cliente.
        </p>
        <label
          >Fecha y hora de la visita<input v-model="scheduled" type="datetime-local" required
        /></label>
        <div class="actions">
          <button :disabled="busy || !client.slots.length">
            {{ busy ? 'Guardando…' : 'Programar visita' }}</button
          ><button class="secondary" type="button" @click="client = null">Cambiar cliente</button>
        </div>
      </form></template
    >
    <div v-else-if="visit" class="stack">
      <h3>{{ visit.clientName }}</h3>
      <p>{{ dateTime(visit.scheduledAt) }} · {{ visit.sellerName }}</p>
      <p class="badge">{{ statusLabels[visit.status] }}</p>
      <template v-if="visit.status === 'programada' && auth.canSell"
        ><button @click="withOrder">Con pedido · Agregar productos</button>
        <hr />
        <h3>Registrar visita sin pedido</h3>
        <form class="stack" @submit.prevent="noOrder">
          <label
            >Motivo y observaciones<textarea
              v-model="notes"
              maxlength="1000"
              required
            ></textarea></label
          ><label class="check"
            ><input v-model="nextEnabled" type="checkbox" /> Programar una nueva visita</label
          ><label v-if="nextEnabled"
            >Fecha y hora de la nueva visita<input
              v-model="nextAt"
              type="datetime-local"
              required /></label
          ><button :disabled="busy">
            {{ busy ? 'Registrando…' : 'Guardar visita sin pedido' }}
          </button>
        </form></template
      ><template v-else
        ><p>{{ visit.notes || 'Sin observaciones.' }}</p>
        <p v-if="visit.orderId" class="muted">Esta visita tiene un pedido registrado.</p></template
      >
    </div></AppModal
  ><OrderWizard
    v-if="wizard"
    :client-id="wizard.clientId"
    :visit-id="wizard.visitId"
    @close="wizard = null"
    @saved="
      wizard = null;
      visits.load();
      routes.load();
    "
  />
</template>
