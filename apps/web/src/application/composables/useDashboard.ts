import type { Dashboard } from '@briochett/contracts';
import { ref, onMounted } from 'vue';
import { api } from '../../infrastructure/http/api-client';
import { errorMessage } from '../../shared/formatters';
import { useAuth } from '../stores/auth';
export function useDashboard() {
  const auth = useAuth(),
    data = ref<Dashboard | null>(null),
    error = ref('');
  async function load() {
    try {
      data.value = await api<Dashboard>('/dashboard');
      error.value = '';
    } catch (e) {
      error.value = errorMessage(e);
    }
  }
  onMounted(load);
  return { auth, data, error, load };
}
