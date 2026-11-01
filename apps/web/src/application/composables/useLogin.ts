import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { authClient } from '../../infrastructure/auth/auth-client';
import { errorMessage } from '../../shared/formatters';
import { useAuth } from '../stores/auth';
export function useLogin() {
  const username = ref(''),
    password = ref(''),
    busy = ref(false),
    error = ref(''),
    router = useRouter(),
    auth = useAuth();
  async function login() {
    error.value = '';
    busy.value = true;
    try {
      const result = await authClient.signIn.username({
        username: username.value,
        password: password.value,
      });
      if (result.error)
        throw new Error(
          result.error.status === 429
            ? 'Demasiados intentos. Espera un minuto y vuelve a intentar.'
            : 'No se pudo iniciar sesión. Revisa tus credenciales y el estado de tu cuenta.',
        );
      await auth.load();
      if (!auth.user) throw new Error('No se pudo recuperar la sesión. Revisa la conexión.');
      password.value = '';
      router.replace(
        auth.user.mustChangePassword
          ? '/cuenta'
          : auth.user.role === 'preparacion'
            ? '/comandas'
            : '/dashboard',
      );
    } catch (e) {
      error.value = errorMessage(e);
    } finally {
      busy.value = false;
    }
  }
  return { username, password, busy, error, login };
}
