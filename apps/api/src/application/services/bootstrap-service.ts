import type { UserInput } from '@briochett/contracts';
import type { AccountGateway } from '../ports';
import { fail } from '../../domain/errors';

export interface BootstrapRepository {
  initialized(): Promise<boolean>;
  lockBootstrap(): Promise<void>;
  releaseFailedBootstrap(): Promise<void>;
}
export class BootstrapService {
  constructor(
    private readonly repository: BootstrapRepository,
    private readonly accounts: AccountGateway,
  ) {}
  async initialize(input: UserInput) {
    if (input.role !== 'administracion')
      fail(422, 'ADMIN_REQUIRED', 'La cuenta inicial debe ser administrativa.');
    if (await this.repository.initialized())
      fail(409, 'BOOTSTRAPPED', 'La cuenta inicial ya existe.');
    await this.repository.lockBootstrap();
    try {
      const user = await this.accounts.createUser(input);
      return { id: user.id, username: input.username };
    } catch (error) {
      await this.repository.releaseFailedBootstrap();
      throw error;
    }
  }
}
