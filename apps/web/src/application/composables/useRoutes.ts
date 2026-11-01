import type { NamedUser } from '@briochett/contracts';
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  recurringRouteDates,
  addCalendarDays,
  routeSchema,
  type RouteFrequency,
  type Route,
  type Visit,
  type Client,
} from '@briochett/contracts';
import { useAuth } from '../stores/auth';
import { api } from '../../infrastructure/http/api-client';
import { errorMessage, today, toISO } from '../../shared/formatters';
import { useList } from './use-list';
export function useRoutes() {
  const auth = useAuth(),
    route = useRoute(),
    tab = ref('routes'),
    routes = useList<Route>(() => '/routes'),
    visits = useList<Visit>(() => '/visits'),
    sellers = ref<{ id: string; name: string }[]>([]),
    modal = ref<'route' | 'schedule' | 'result' | null>(null),
    busy = ref(false),
    error = ref(''),
    selecting = ref(false),
    client = ref<Client | null>(null),
    visit = ref<Visit | null>(null),
    wizard = ref<{ clientId: string; visitId: string } | null>(null);
  const editingRouteId = ref<string | null>(null),
    editingSeries = ref<Route['recurrence']>(null),
    repeatEnabled = ref(false);
  const form = reactive({
      name: '',
      sellerId: '',
      date: today(),
      frequency: 'semanal' as RouteFrequency,
      until: addCalendarDays(today(), 28),
      stops: [] as { clientId: string; clientName: string; time: string }[],
    }),
    scheduled = ref(today() + 'T09:00'),
    notes = ref(''),
    nextEnabled = ref(false),
    nextAt = ref('');
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const recurrence = computed(() =>
    repeatEnabled.value && !editingSeries.value
      ? { frequency: form.frequency, until: form.until }
      : null,
  );
  const plannedDates = computed(() => recurringRouteDates(form.date, recurrence.value));
  watch([() => form.date, () => form.frequency, repeatEnabled], () => {
    if (
      repeatEnabled.value &&
      recurringRouteDates(form.date, { frequency: form.frequency, until: form.until }).length < 2
    )
      form.until = addCalendarDays(
        form.date || today(),
        form.frequency === 'mensual' ? 120 : form.frequency === 'quincenal' ? 56 : 28,
      );
  });
  onMounted(async () => {
    if (auth.isAdmin)
      try {
        sellers.value = (await api<{ items: NamedUser[] }>('/sellers')).items;
      } catch (e) {
        error.value = errorMessage(e);
      }
    if (route.query.cliente) {
      try {
        client.value = await api<Client>('/clients/' + route.query.cliente);
        modal.value = 'schedule';
      } catch (e) {
        error.value = errorMessage(e);
      }
    }
  });
  function openRoute() {
    editingRouteId.value = null;
    editingSeries.value = null;
    repeatEnabled.value = false;
    Object.assign(form, {
      name: '',
      sellerId: '',
      date: today(),
      frequency: 'semanal',
      until: addCalendarDays(today(), 28),
      stops: [],
    });
    error.value = '';
    selecting.value = false;
    modal.value = 'route';
  }
  function openSchedule() {
    client.value = null;
    error.value = '';
    modal.value = 'schedule';
  }
  function addStop(c: Client) {
    if (c.sellerId !== form.sellerId) {
      error.value = 'Este cliente no pertenece al vendedor seleccionado.';
      return;
    }
    if (form.stops.some((s) => s.clientId === c.id)) {
      error.value = 'Este cliente ya está en la ruta.';
      return;
    }
    form.stops.push({ clientId: c.id, clientName: c.name, time: '09:00' });
    selecting.value = false;
    error.value = '';
  }
  function move(i: number, n: number) {
    const j = i + n;
    if (j < 0 || j >= form.stops.length) return;
    [form.stops[i], form.stops[j]] = [form.stops[j], form.stops[i]];
  }
  async function saveRoute() {
    const input = routeSchema.safeParse({
      name: form.name,
      sellerId: form.sellerId,
      date: form.date,
      recurrence: recurrence.value,
      stops: form.stops.map((s) => ({ clientId: s.clientId, time: s.time })),
    });
    if (!input.success) {
      error.value = input.error.issues.map((issue) => issue.message).join(' ');
      return;
    }
    busy.value = true;
    error.value = '';
    try {
      await api(editingRouteId.value ? '/routes/' + editingRouteId.value : '/routes', {
        method: editingRouteId.value ? 'PATCH' : 'POST',
        body: input.data,
      });
      modal.value = null;
      routes.load();
      visits.load();
    } catch (e) {
      error.value = errorMessage(e);
    } finally {
      busy.value = false;
    }
  }
  async function saveVisit() {
    if (!client.value) return;
    busy.value = true;
    error.value = '';
    try {
      await api('/visits', {
        method: 'POST',
        body: { clientId: client.value.id, scheduledAt: toISO(scheduled.value) },
      });
      modal.value = null;
      tab.value = 'visits';
      visits.load();
    } catch (e) {
      error.value = errorMessage(e);
    } finally {
      busy.value = false;
    }
  }
  function showVisit(v: Visit) {
    visit.value = v;
    notes.value = '';
    nextEnabled.value = false;
    nextAt.value = '';
    error.value = '';
    modal.value = 'result';
  }
  async function showStop(id: string) {
    try {
      showVisit(await api<Visit>('/visits/' + id));
    } catch (e) {
      error.value = errorMessage(e);
    }
  }
  function editRoute(r: Route) {
    editingRouteId.value = r.id;
    editingSeries.value = r.recurrence;
    repeatEnabled.value = false;
    Object.assign(form, {
      name: r.name,
      sellerId: r.sellerId,
      date: r.date,
      frequency: 'semanal',
      until: addCalendarDays(r.date, 28),
      stops: r.stops.map((s) => ({ ...s })),
    });
    error.value = '';
    selecting.value = false;
    modal.value = 'route';
  }
  function repeatRoute(r: Route) {
    editRoute(r);
    editingRouteId.value = null;
    editingSeries.value = null;
    let date = addCalendarDays(r.date, 7);
    while (date < today()) date = addCalendarDays(date, 7);
    form.date = date;
    form.until = addCalendarDays(date, 28);
    repeatEnabled.value = true;
  }
  async function noOrder() {
    if (!visit.value) return;
    busy.value = true;
    error.value = '';
    try {
      await api('/visits/' + visit.value.id + '/result', {
        method: 'POST',
        body: {
          result: 'sin_pedido',
          notes: notes.value,
          nextAt: nextEnabled.value ? toISO(nextAt.value) : null,
        },
      });
      modal.value = null;
      visits.load();
      routes.load();
    } catch (e) {
      error.value = errorMessage(e);
    } finally {
      busy.value = false;
    }
  }
  function withOrder() {
    if (!visit.value) return;
    wizard.value = { clientId: visit.value.clientId, visitId: visit.value.id };
    modal.value = null;
  }
  return {
    auth,
    route,
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
    repeatEnabled,
    editingSeries,
    plannedDates,
    editingRouteId,
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
    repeatRoute,
    noOrder,
    withOrder,
  };
}
