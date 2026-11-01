export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 503;

export class ApplicationError extends Error {
  constructor(
    public readonly status: ErrorStatus,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

export function fail(status: ErrorStatus, code: string, message: string, details?: unknown): never {
  throw new ApplicationError(status, code, message, details);
}

export class A2NotConfigured extends ApplicationError {
  constructor() {
    super(
      503,
      'A2_NOT_CONFIGURED',
      'La conexión con a2 está pendiente de confirmar su versión y configurar el conector local.',
    );
  }
}
