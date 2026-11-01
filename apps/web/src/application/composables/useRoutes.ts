import type { NamedUser } from '@briochett/contracts';
import { ref, reactive, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { type Route, type Visit, type Client } from '@briochett/contracts';
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
  const editingRouteId = ref<string | null>(null);
  const form = reactive({
      name: '',
      sellerId: '',
      date: today(),
      stops: [] as { clientId: string; clientName: string; time: string }[],
    }),
    scheduled = ref(today() + 'T09:00'),
    notes = ref(''),
    nextEnabled = ref(false),
    nextAt = ref('');
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
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
    Object.assign(form, { name: '', sellerId: '', date: today(), stops: [] });
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
    busy.value = true;
    error.value = '';
    try {
      await api(editingRouteId.value ? '/routes/' + editingRouteId.value : '/routes', {
        method: editingRouteId.value ? 'PATCH' : 'POST',
        body: {
          name: form.name,
          sellerId: form.sellerId,
          date: form.date,
          stops: form.stops.map((s) => ({ clientId: s.clientId, time: s.time })),
        },
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
    Object.assign(form, {
      name: r.name,
      sellerId: r.sellerId,
      date: r.date,
      stops: r.stops.map((s) => ({ ...s })),
    });
    error.value = '';
    selecting.value = false;
    modal.value = 'route';
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
  };
}
