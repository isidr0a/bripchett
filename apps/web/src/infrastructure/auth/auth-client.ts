import { createAuthClient } from 'better-auth/vue';
import { usernameClient } from 'better-auth/client/plugins';
import { apiOrigin } from '../config';
export const authClient = createAuthClient({
  baseURL: apiOrigin,
  plugins: [usernameClient()],
  fetchOptions: { credentials: 'include' },
});
