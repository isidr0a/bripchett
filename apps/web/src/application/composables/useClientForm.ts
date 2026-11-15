import type { NamedUser } from '@briochett/contracts';
import { computed, reactive, ref, watch, onMounted } from 'vue';
import {
  allVisitDays,
  clientSchema,
  sellerClientSchema,
  visitDaysSchema,
  type ZoneImpact,
  clientMissing,
  type Client,
  type ClientInput,
  type GeoPoint,
} from '@briochett/contracts';
import { useAuth } from '../stores/auth';
import { api, ApiFailure } from '../../infrastructure/http/api-client';
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
  const sellerIntake = computed(() => !props.client && !auth.isAdmin);
  const requireDetails = computed(() => !!props.completion || sellerIntake.value);
  const key =
    'briochett:client:' +
    auth.user!.id +
    ':' +
    (props.client?.id || 'new') +
    (props.completion ? ':completion' : '');
  const initial: ClientInput & { zoneName: string } = props.client
    ? {
        name: props.client.name,
        rif: props.client.rif,
        contact: props.client.contact,
        phone: props.client.phone,
        address: props.client.address,
        zoneId: props.client.zoneId ?? '',
        zoneName: props.client.zone,
        sellerId: props.client.sellerId,
        active: props.client.active,
        geo: props.client.geo,
        visitDays: props.client.visitDays,
        recurrence: props.client.recurrence,
        recurrenceStart: props.client.recurrenceStart,
      }
    : {
        name: '',
        rif: '',
        contact: '',
        phone: '',
        address: '',
        zoneId: '',
        zoneName: '',
        sellerId: null,
        active: true,
        geo: null,
        visitDays: [...allVisitDays],
        recurrence: 'semanal',
        recurrenceStart: today(),
      };
  const recovered = readDraft<(Partial<typeof initial> & { slots?: { day: number }[] }) | null>(
    key,
    null,
  );
  const previousDays = visitDaysSchema.safeParse(
    recovered?.visitDays ??
      (Array.isArray(recovered?.slots)
        ? [...new Set(recovered.slots.map((slot) => slot.day))]
        : initial.visitDays),
  );
  const form = reactive<typeof initial>({
      ...initial,
      ...recovered,
      visitDays: previousDays.success ? previousDays.data : initial.visitDays,
    }),
    busy = ref(false),
    gpsBusy = ref(false),
    error = ref(''),
    gpsError = ref(''),
    candidate = ref<Omit<GeoPoint, 'confirmed'> | null>(null),
    sellers = ref<{ id: string; name: string }[]>([]),
    storageError = ref(false),
    review = ref<ZoneImpact | null>(null),
    reviewed = ref(false);
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
  function cancelReview() {
    review.value = null;
    reviewed.value = false;
    error.value = '';
  }
  async function save() {
    error.value = '';
    if (busy.value) return;
    const details = {
      name: form.name,
      rif: form.rif,
      contact: form.contact,
      phone: form.phone,
      address: form.address,
      geo: form.geo,
    };
    if (requireDetails.value && clientMissing(details).length) {
      error.value = 'Completa los datos obligatorios y confirma la ubicación del negocio.';
      return;
    }
    const input = props.completion
      ? null
      : sellerIntake.value
        ? sellerClientSchema.safeParse({ ...details, zoneId: form.zoneId })
        : clientSchema.safeParse({ ...form, zoneImpactRevision: undefined });
    if (input && !input.success) {
      error.value = !form.zoneId
        ? 'Selecciona una zona activa.'
        : input.error.issues.map((issue) => issue.message).join(' ');
      return;
    }
    if (review.value && !reviewed.value) return;
    busy.value = true;
    emit('busy', true);
    try {
      let revision = review.value?.revision;
      if (!props.completion && props.client && form.zoneId !== props.client.zoneId && !revision) {
        const impact = await api<ZoneImpact>(
          '/clients/' + props.client.id + '/zone-impact?zoneId=' + encodeURIComponent(form.zoneId),
        );
        if (impact.stops.length) {
          review.value = impact;
          return;
        }
        revision = impact.revision;
      }
      const result = await api<Client>(
        props.client
          ? '/clients/' + props.client.id + (props.completion ? '/completion' : '')
          : '/clients',
        {
          method: props.client ? 'PATCH' : 'POST',
          body: props.completion
            ? details
            : { ...input?.data, ...(revision ? { zoneImpactRevision: revision } : {}) },
        },
      );
      removeDraft(key);
      emit('saved', result);
    } catch (e) {
      if (e instanceof ApiFailure && e.code === 'ZONE_IMPACT_CHANGED') {
        cancelReview();
        error.value =
          'El cliente o sus paradas cambiaron. Vuelve a guardar para revisar el impacto actualizado.';
      } else error.value = errorMessage(e);
    } finally {
      busy.value = false;
      emit('busy', false);
    }
  }
  return {
    auth,
    sellerIntake,
    requireDetails,
    review,
    reviewed,
    cancelReview,
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
    locate,
    confirmGPS,
    save,
  };
}
