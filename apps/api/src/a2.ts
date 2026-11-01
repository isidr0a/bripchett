export interface A2Gateway {
  importClients():Promise<unknown>;
  pushClient(clientId:string):Promise<unknown>;
  pushOrder(orderId:string):Promise<unknown>;
  getAccountStatement(clientId:string):Promise<unknown>;
}
export class A2NotConfigured extends Error {constructor(){super('La conexión con a2 está pendiente de confirmar su versión y configurar el conector local.');}}
export class DisabledA2Gateway implements A2Gateway {
  async importClients():Promise<never>{throw new A2NotConfigured();}
  async pushClient(_id:string):Promise<never>{throw new A2NotConfigured();}
  async pushOrder(_id:string):Promise<never>{throw new A2NotConfigured();}
  async getAccountStatement(_id:string):Promise<never>{throw new A2NotConfigured();}
}
