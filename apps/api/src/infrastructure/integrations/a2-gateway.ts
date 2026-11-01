import type { A2Gateway } from '../../application/ports';
import { A2NotConfigured } from '../../domain/errors';
export class DisabledA2Gateway implements A2Gateway {
  async importClients(): Promise<never> {
    throw new A2NotConfigured();
  }
  async pushClient(_id: string): Promise<never> {
    throw new A2NotConfigured();
  }
  async pushOrder(_id: string): Promise<never> {
    throw new A2NotConfigured();
  }
  async getAccountStatement(_id: string): Promise<never> {
    throw new A2NotConfigured();
  }
}
