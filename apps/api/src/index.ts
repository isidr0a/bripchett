import app from './presentation/http/app';
import { cleanupPhotos } from './composition';
import type { Bindings } from './config/bindings';

export default Object.assign(app, {
  scheduled(_event: ScheduledController, env: Bindings, context: ExecutionContext) {
    context.waitUntil(cleanupPhotos(env));
  },
});
