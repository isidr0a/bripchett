import type { NamedUser } from '@briochett/contracts';
import { reactive, ref, watch, onMounted } from 'vue';
import { clientMissing, type Client, type ClientInput, type GeoPoint } from '@briochett/contracts';
import { useAuth } from '../stores/auth';
import { api } from '../../infrastructure/http/api-client';
import { errorMessage, today } from '../../shared/formatters';
import { readDraft, writeDraft, removeDraft } from '../../infrastructure/storage/draft-storage';
import { captureLocation } from '../../infrastructure/geolocation/browser-location';
export function useClientForm(
  props: Readonly<{ client?: Client; completion?: boolean }>,
  emit: {
    (event: 'saved', client: Client): void;
    (event: 'cancel'): void;
    (event: 'busy', value: boolean): void;
  },
) {
  const auth = useAuth();
  const key =
    'briochett:client:' +
    auth.user!.id +
    ':' +
    (props.client?.id || 'new') +
    (props.completion ? ':completion' : '');
  const initial: ClientInput = props.client
    ? {
        name: props.client.name,
        rif: props.client.rif,
        contact: props.client.contact,
        phone: props.client.phone,
        address: props.client.address,
        zone: props.client.zone,
        sellerId: props.client.sellerId,
        active: props.client.active,
        geo: props.client.geo,
        slots: props.client.slots,
        recurrence: props.client.recurrence,
        recurrenceStart: props.client.recurrenceStart,
      }
    : {
        name: '',
        rif: '',
        contact: '',
        phone: '',
        address: '',
        zone: '',
        sellerId: null,
        active: true,
        geo: null,
        slots: [],
        recurrence: 'semanal',
        recurrenceStart: today(),
      };
  const recovered = readDraft<ClientInput | null>(key, null),
    form = reactive<ClientInput>(recovered || JSON.parse(JSON.stringify(initial))),
    busy = ref(false),
    gpsBusy = ref(false),
    error = ref(''),
    gpsError = ref(''),
    candidate = ref<Omit<GeoPoint, 'confirmed'> | null>(null),
    sellers = ref<{ id: string; name: string }[]>([]),
    storageError = ref(false),
    days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  watch(
    form,
    () => {
      storageError.value = !writeDraft(key, form);
    },
    { deep: true },
  );
  onMounted(async () => {
    if (auth.isAdmin && !props.completion)
      try {
        sellers.value = (await api<{ items: NamedUser[] }>('/sellers')).items;
      } catch (e) {
        error.value = errorMessage(e);
      }
  });
  async function locate() {
    gpsBusy.value = true;
    gpsError.value = '';
    candidate.value = null;
    try {
      candidate.value = await captureLocation();
    } catch (e) {
      gpsError.value = errorMessage(e);
    } finally {
      gpsBusy.value = false;
    }
  }
  function confirmGPS() {
    if (candidate.value) {
      form.geo = { ...candidate.value, confirmed: true };
      candidate.value = null;
    }
  }
  async function save() {
    error.value = '';
    if (props.completion && clientMissing(form).length) {
      error.value = 'Completa los datos obligatorios y confirma la ubicación del negocio.';
      return;
    }
    busy.value = true;
    emit('busy', true);
    try {
      const result = await api<Client>(
        props.client
          ? '/clients/' + props.client.id + (props.completion ? '/completion' : '')
          : '/clients',
        {
          method: props.client ? 'PATCH' : 'POST',
          body: props.completion
            ? {
                name: form.name,
                rif: form.rif,
                contact: form.contact,
                phone: form.phone,
                address: form.address,
                geo: form.geo,
              }
            : form,
        },
      );
      removeDraft(key);
      emit('saved', result);
    } catch (e) {
      error.value = errorMessage(e);
    } finally {
      busy.value = false;
      emit('busy', false);
    }
  }
  return {
    auth,
    key,
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
  };
}
