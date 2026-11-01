<script setup lang="ts">
import { type Client } from '@briochett/contracts';
import { useClientForm } from '../../application/composables/useClientForm';
const props = defineProps<{ client?: Client; completion?: boolean }>();
const emit = defineEmits<{ saved: [client: Client]; cancel: []; busy: [value: boolean] }>();
const {
  auth,
  recovered,
  form,
  busy,
  gpsBusy,
  error,
  gpsError,
  candidate,
  sellers,
  storageError,
  days,
  locate,
  confirmGPS,
  save,
} = useClientForm(props, emit);
</script>
<template>
  <form class="stack" @submit.prevent="save">
    <p class="muted">
      {{
        completion
          ? 'Completa la ficha del negocio antes de continuar. Los cambios se guardan para próximos pedidos.'
          : 'Datos del negocio y planificación de sus visitas.'
      }}
    </p>
    <p v-if="recovered" class="notice">Se recuperó el borrador de esta ficha.</p>
    <p v-if="storageError" class="notice error">
      El navegador no permite guardar el borrador en este dispositivo. Mantén esta ventana abierta
      hasta guardar.
    </p>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <div class="form-grid">
      <label
        >Nombre del negocio *<input
          v-model="form.name"
          required
          maxlength="150"
          autocomplete="organization" /></label
      ><label
        >RIF{{ completion ? ' *' : ''
        }}<input v-model="form.rif" :required="completion" maxlength="30" /></label
      ><label
        >Contacto{{ completion ? ' *' : ''
        }}<input
          v-model="form.contact"
          :required="completion"
          maxlength="100"
          autocomplete="name" /></label
      ><label
        >Teléfono{{ completion ? ' *' : ''
        }}<input
          v-model="form.phone"
          type="tel"
          :required="completion"
          maxlength="40"
          autocomplete="tel" /></label
      ><label class="full"
        >Dirección del negocio{{ completion ? ' *' : ''
        }}<textarea
          v-model="form.address"
          :required="completion"
          maxlength="300"
          autocomplete="street-address"
        ></textarea>
      </label>
    </div>
    <section class="card inset">
      <h3>Ubicación del negocio{{ completion ? ' *' : '' }}</h3>
      <p v-if="form.geo">
        GPS confirmado · {{ form.geo.latitude.toFixed(6) }}, {{ form.geo.longitude.toFixed(6) }}
        <small>· Precisión ±{{ Math.round(form.geo.accuracy) }} m</small>
      </p>
      <p v-else class="muted">Ubicación pendiente</p>
      <p class="muted small">
        Captúrala cuando estés en el negocio. Confirma que corresponde a su punto de entrega.
      </p>
      <p v-if="gpsError" role="alert" class="notice error">{{ gpsError }}</p>
      <button type="button" :disabled="gpsBusy || busy" @click="locate">
        {{
          gpsBusy
            ? 'Obteniendo ubicación…'
            : form.geo
              ? 'Volver a capturar ubicación'
              : 'Usar GPS del teléfono'
        }}
      </button>
      <div v-if="candidate" class="gps-review stack">
        <strong>Ubicación encontrada</strong>
        <p>{{ candidate.latitude.toFixed(6) }}, {{ candidate.longitude.toFixed(6) }}</p>
        <p class="small">
          Precisión ±{{ Math.round(candidate.accuracy) }} m. ¿Este punto corresponde al negocio?
        </p>
        <div class="actions">
          <button type="button" @click="confirmGPS">Confirmar ubicación del negocio</button
          ><button type="button" class="secondary" @click="candidate = null">
            Descartar captura
          </button>
        </div>
      </div>
    </section>
    <template v-if="!completion && auth.isAdmin"
      ><div class="form-grid">
        <label>Zona<input v-model="form.zone" maxlength="100" /></label
        ><label
          >Vendedor asignado<select v-model="form.sellerId">
            <option :value="null">Sin asignar</option>
            <option v-for="s in sellers" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select></label
        ><label
          >Recurrencia<select v-model="form.recurrence">
            <option value="semanal">Semanal</option>
            <option value="quincenal">Quincenal</option>
            <option value="mensual">Mensual</option>
          </select></label
        ><label
          >Inicio de recurrencia<input v-model="form.recurrenceStart" type="date" required
        /></label>
      </div>
      <fieldset>
        <legend>Días y horarios de visita</legend>
        <p class="muted small">
          Quincenal: semanas alternas desde la fecha de inicio. Mensual: la misma semana del mes que
          la fecha de inicio.
        </p>
        <div v-for="(slot, i) in form.slots" :key="i" class="slot-row">
          <label
            >Día<select v-model="slot.day">
              <option v-for="(day, n) in days" :key="n" :value="n">{{ day }}</option>
            </select></label
          ><label>Desde<input v-model="slot.start" type="time" required /></label
          ><label>Hasta<input v-model="slot.end" type="time" required /></label
          ><button
            class="secondary"
            type="button"
            aria-label="Quitar horario"
            @click="form.slots.splice(i, 1)"
          >
            ×
          </button>
        </div>
        <button
          type="button"
          class="secondary"
          :disabled="form.slots.length >= 21"
          @click="form.slots.push({ day: 1, start: '08:00', end: '12:00' })"
        >
          Agregar horario
        </button>
      </fieldset>
      <label class="check"
        ><input v-model="form.active" type="checkbox" /> Cliente activo</label
      ></template
    >
    <div class="actions">
      <button :disabled="busy || gpsBusy">
        {{
          busy ? 'Guardando…' : completion ? 'Guardar datos y continuar' : 'Guardar cliente'
        }}</button
      ><button type="button" class="secondary" :disabled="busy" @click="emit('cancel')">
        Volver
      </button>
    </div>
  </form>
</template>
