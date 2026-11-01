import { betterAuth } from 'better-auth';
import { admin, username } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import { APIError } from 'better-auth/api';
import type { Bindings } from '../../config/bindings';

export function createAuth(env: Bindings) {
  return betterAuth({
    appName: 'Briochett',
    database: env.DB,
    baseURL: env.API_ORIGIN,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.FRONTEND_ORIGIN],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
    },
    user: {
      additionalFields: {
        active: { type: 'boolean', defaultValue: true, input: false },
        mustChangePassword: { type: 'boolean', defaultValue: true, input: false },
      },
    },
    session: { expiresIn: 60 * 60 * 8, updateAge: 60 * 60, cookieCache: { enabled: false } },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 40,
        usernameValidator: (v) => /^[a-zA-Z0-9_.-]+$/.test(v),
      }),
      admin({
        defaultRole: 'vendedor',
        adminRoles: ['administracion'],
        roles: {
          administracion: adminAc,
          vendedor: userAc,
          preparacion: userAc,
          supervision: userAc,
        },
      }),
    ],
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/username': { window: 60, max: 5 },
        '/change-password': { window: 60, max: 5 },
      },
    },
    advanced: {
      database: { generateId: 'uuid' },
      useSecureCookies: env.API_ORIGIN.startsWith('https:'),
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.API_ORIGIN.startsWith('https:'),
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const u = await env.DB.prepare('SELECT active,banned FROM user WHERE id=?')
              .bind(session.userId)
              .first<{ active: number; banned: number }>();
            if (!u?.active || u.banned)
              throw new APIError('FORBIDDEN', { message: 'La cuenta está desactivada.' });
            return { data: session };
          },
        },
      },
    },
  });
}
