import { ref, reactive } from 'vue';
import { userSchema, userUpdateSchema, type SessionUser } from '@briochett/contracts';
import { api } from '../../infrastructure/http/api-client';
import { errorMessage } from '../../shared/formatters';
import { useList } from './use-list';
import { photoPath, usePhotoDraft } from './useRecordPhoto';
export function useUsers() {
  const photo = reactive(usePhotoDraft());
  const pendingId = ref('');
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
    photo.reset(u?.photoId);
    pendingId.value = '';
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
    if (saving.value) return;
    if (!pendingId.value) {
      const parsed = selected.value ? userUpdateSchema.safeParse(form) : userSchema.safeParse(form);
      if (!parsed.success) {
        const field = parsed.error.issues[0]?.path[0];
        const messages: Record<string, string> = {
          name: 'El nombre debe tener entre 2 y 100 caracteres.',
          email: 'Introduce un correo electrónico válido.',
          username:
            'El usuario debe tener entre 3 y 40 caracteres y usar solo letras, números, punto, guion o guion bajo.',
          password: 'La contraseña debe tener entre 10 y 128 caracteres.',
          role: 'Selecciona un rol válido.',
        };
        formError.value = messages[String(field)] ?? 'Revisa los datos del usuario.';
        return;
      }
    }
    saving.value = true;
    formError.value = '';
    try {
      if (!pendingId.value) {
        const saved = await api<Pick<SessionUser, 'id'>>(
          selected.value ? '/users/' + selected.value.id : '/users',
          {
            method: selected.value ? 'PATCH' : 'POST',
            body: selected.value
              ? { name: form.name, email: form.email, role: form.role, active: form.active }
              : form,
          },
        );
        pendingId.value = saved.id;
        form.password = '';
      }
      if (form.role === 'vendedor') await photo.commit(photoPath('users', pendingId.value));
      close();
    } catch (e) {
      formError.value = errorMessage(e);
    } finally {
      saving.value = false;
    }
  }
  function close() {
    if (pendingId.value) void load();
    open.value = false;
    photo.reset();
    pendingId.value = '';
    form.password = '';
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
    load,
    photo,
    pendingId,
    close,
  };
}
