export type Bindings = {
  DB: D1Database;
  PHOTOS?: R2Bucket;
  IMAGES?: ImagesBinding;
  BETTER_AUTH_SECRET: string;
  BOOTSTRAP_TOKEN?: string;
  API_ORIGIN: string;
  FRONTEND_ORIGIN: string;
  ENVIRONMENT: string;
};
