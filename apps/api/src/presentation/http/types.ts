import type { SessionUser } from '@briochett/contracts';
import type { Bindings } from '../../config/bindings';
import type { Authentication, Services } from '../../composition';
export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    user: SessionUser;
    authentication: Authentication;
    services: Services;
    requestId: string;
  };
};
