<script setup lang="ts">
import { ref } from 'vue';
import AppModal from './AppModal.vue';
import { useDeleteAction, type DeleteTarget } from '../../application/composables/useTrash';
import { useAuth } from '../../application/stores/auth';

const target = defineProps<DeleteTarget>();
const emit = defineEmits<{ deleted: [] }>();
const auth = useAuth();
const open = ref(false);
const message = ref('');
const { scope, busy, error, remove } = useDeleteAction();

function confirm() {
  error.value = '';
  scope.value = 'date';
  open.value = true;
}

async function submit() {
  const result = await remove(target);
  if (result === null) return;
  if (!result.affected && scope.value === 'upcoming') {
    error.value = 'No hay recorridos pendientes para eliminar en este alcance.';
    return;
  }
  open.value = false;
  message.value = 'Registro enviado a la papelera.';
  emit('deleted');
}
</script>
<template>
  <template v-if="auth.isAdmin && !(type === 'users' && id === auth.user?.id)">
    <button
      type="button"
      class="secondary compact danger"
      :aria-label="'Eliminar ' + label"
      @click="confirm"
    >
      Eliminar
    </button>
    <p v-if="message" class="small" role="status">{{ message }}</p>
    <AppModal v-if="open" title="Confirmar eliminación" :busy="busy" @close="open = false">
      <form class="stack" @submit.prevent="submit">
        <p>
          <strong>{{ label }}</strong> se ocultará de los listados habituales y podrá restaurarse
          desde la Papelera.
        </p>
        <p v-if="type === 'users'" class="muted small">Se cerrarán sus sesiones activas.</p>
        <p v-if="type === 'rates'" class="muted small">
          Si es la tasa vigente, se usará la anterior disponible de esa moneda. Si no hay otra, no
          se podrán cotizar pedidos en esa moneda.
        </p>
        <p v-if="type === 'routes'" class="muted small">
          También se enviarán a la papelera las paradas pendientes de los recorridos eliminados.
        </p>
        <fieldset v-if="recurring" class="stack" :disabled="busy">
          <legend>Alcance</legend>
          <label class="check"
            ><input v-model="scope" type="radio" value="date" /> Solo esta fecha</label
          >
          <label class="check"
            ><input v-model="scope" type="radio" value="upcoming" /> Esta fecha y las próximas
            pendientes</label
          >
          <p v-if="scope === 'upcoming'" class="muted small">
            Se conservarán los recorridos con visitas realizadas.
          </p>
        </fieldset>
        <p v-if="error" class="notice error" role="alert">{{ error }}</p>
        <div class="actions">
          <button type="submit" class="secondary danger" :disabled="busy">
            {{ busy ? 'Eliminando…' : 'Mover a la papelera' }}
          </button>
          <button type="button" class="secondary" :disabled="busy" @click="open = false">
            Cancelar
          </button>
        </div>
      </form>
    </AppModal>
  </template>
</template>
