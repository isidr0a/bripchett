import type { ReportInput, SessionUser, UserInput, UserUpdateInput } from '@briochett/contracts';
import type { AccountGateway, ManagementRepository, Pagination } from '../ports';
import { fail } from '../../domain/errors';

export class ManagementService {
  constructor(
    private readonly repository: ManagementRepository,
    private readonly accounts: AccountGateway,
    private readonly actor: SessionUser,
  ) {}
  users(pagination: Pagination) {
    return this.repository.listUsers(pagination);
  }
  async sellers() {
    return { items: await this.repository.listSellers() };
  }
  async createUser(input: UserInput) {
    const user = await this.accounts.createUser(input);
    await this.repository.recordUserCreation(user.id);
    return { id: user.id, name: input.name, username: input.username, role: input.role };
  }
  async updateUser(id: string, input: UserUpdateInput) {
    const previous = await this.repository.findUser(id);
    if (!previous) fail(404, 'USER_NOT_FOUND', 'Usuario no encontrado.');
    if (id === this.actor.id && (!input.active || input.role !== 'administracion'))
      fail(422, 'SELF_CHANGE', 'No puedes desactivar tu cuenta ni quitarte el rol administrativo.');
    await this.repository.updateUser(id, input, previous.role);
    return { id, ...input };
  }
  async resetPassword(id: string, password: string) {
    await this.accounts.setPassword(id, password);
    await this.repository.requirePasswordChange(id);
    return { ok: true };
  }
  dashboard() {
    return this.repository.dashboard(this.actor.role === 'vendedor' ? this.actor.id : undefined);
  }
  report(input: ReportInput) {
    if (input.from > input.to)
      fail(422, 'REPORT_DATES', 'La fecha inicial debe ser anterior a la final.');
    const start = new Date(input.from + 'T00:00:00-04:00').toISOString();
    const end = new Date(+new Date(input.to + 'T00:00:00-04:00') + 86400000).toISOString();
    return this.repository.report({ ...input, start, end });
  }
  async audit(pagination: Pagination) {
    return {
      items: await this.repository.listAudit(pagination),
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
