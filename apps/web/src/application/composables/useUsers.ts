import { ref, reactive } from 'vue';
import { type SessionUser } from '@briochett/contracts';
import { api } from '../../infrastructure/http/api-client';
import { errorMessage } from '../../shared/formatters';
import { useList } from './use-list';
export function useUsers() {
  const { data, page, busy, error, load } = useList<SessionUser>(() => '/users'),
    open = ref(false),
    selected = ref<SessionUser | null>(null),
    saving = ref(false),
    formError = ref(''),
    reset = ref(false),
    password = ref(''),
    form = reactive({
      name: '',
      email: '',
      username: '',
      role: 'vendedor',
      password: '',
      active: true,
    });
  function edit(u: SessionUser | null) {
    selected.value = u;
    Object.assign(
      form,
      u
        ? {
            name: u.name,
            email: u.email,
            username: u.username,
            role: u.role,
            password: '',
            active: u.active,
          }
        : { name: '', email: '', username: '', role: 'vendedor', password: '', active: true },
    );
    formError.value = '';
    reset.value = false;
    open.value = true;
  }
  async function save() {
    saving.value = true;
    formError.value = '';
    try {
      await api(selected.value ? '/users/' + selected.value.id : '/users', {
        method: selected.value ? 'PATCH' : 'POST',
        body: selected.value
          ? { name: form.name, email: form.email, role: form.role, active: form.active }
          : form,
      });
      open.value = false;
      form.password = '';
      load();
    } catch (e) {
      formError.value = errorMessage(e);
    } finally {
      saving.value = false;
    }
  }
  async function resetPassword() {
    saving.value = true;
    formError.value = '';
    try {
      await api('/users/' + selected.value!.id + '/password', {
        method: 'POST',
        body: { password: password.value },
      });
      password.value = '';
      open.value = false;
      load();
    } catch (e) {
      formError.value = errorMessage(e);
    } finally {
      saving.value = false;
    }
  }
  return {
    data,
    page,
    busy,
    error,
    open,
    selected,
    saving,
    formError,
    reset,
    password,
    form,
    edit,
    save,
    resetPassword,
  };
}
