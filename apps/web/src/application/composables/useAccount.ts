import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { authClient } from '../../infrastructure/auth/auth-client';
import { errorMessage } from '../../shared/formatters';
import { useAuth } from '../stores/auth';
export function useAccount() {
  const auth = useAuth(),
    router = useRouter(),
    currentPassword = ref(''),
    newPassword = ref(''),
    confirmation = ref(''),
    busy = ref(false),
    error = ref(''),
    success = ref('');
  async function change() {
    error.value = '';
    success.value = '';
    if (newPassword.value !== confirmation.value) {
      error.value = 'La confirmación no coincide con la nueva contraseña.';
      return;
    }
    busy.value = true;
    try {
      const r = await authClient.changePassword({
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
        revokeOtherSessions: true,
      });
      if (r.error)
        throw new Error('No se pudo cambiar la contraseña. Revisa la contraseña actual.');
      currentPassword.value = '';
      newPassword.value = '';
      confirmation.value = '';
      await auth.load();
      success.value = 'Contraseña actualizada.';
      router.replace(auth.user?.role === 'preparacion' ? '/comandas' : '/dashboard');
    } catch (e) {
      error.value = errorMessage(e);
    } finally {
      busy.value = false;
    }
  }
  return { auth, currentPassword, newPassword, confirmation, busy, error, success, change };
}
