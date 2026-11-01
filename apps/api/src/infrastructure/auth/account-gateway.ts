import type { UserInput } from '@briochett/contracts';
import type { AccountGateway } from '../../application/ports';
import type { createAuth } from './better-auth';

export class BetterAuthAccountGateway implements AccountGateway {
  constructor(
    private readonly auth: ReturnType<typeof createAuth>,
    private readonly headers: Headers,
  ) {}
  async createUser(input: UserInput) {
    const result = await this.auth.api.createUser({
      body: {
        name: input.name,
        email: input.email,
        password: input.password,
        role: input.role,
        data: {
          username: input.username.toLowerCase(),
          displayUsername: input.username,
          active: true,
          mustChangePassword: true,
        },
      },
    });
    return { id: result.user.id };
  }
  async setPassword(id: string, password: string) {
    await this.auth.api.setUserPassword({
      body: { userId: id, newPassword: password },
      headers: this.headers,
    });
  }
}
