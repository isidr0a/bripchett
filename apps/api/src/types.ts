import type { SessionUser } from '@briochett/contracts';
import type { createAuth } from './auth';
export type Bindings={DB:D1Database;BETTER_AUTH_SECRET:string;BOOTSTRAP_TOKEN?:string;API_ORIGIN:string;FRONTEND_ORIGIN:string;ENVIRONMENT:string};
export type AppEnv={Bindings:Bindings;Variables:{user:SessionUser;auth:ReturnType<typeof createAuth>;requestId:string}};
