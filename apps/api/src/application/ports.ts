import type {
  AuditEntry,
  Client,
  ClientInput,
  Command,
  CommandStatus,
  CompletionInput,
  Currency,
  Dashboard,
  NamedUser,
  Order,
  OrderInput,
  Page,
  Product,
  ProductInput,
  Quote,
  Rate,
  RateInput,
  Report,
  Route,
  RouteInput,
  SessionUser,
  UserInput,
  UserUpdateInput,
  Visit,
  VisitResultInput,
} from '@briochett/contracts';

export type Pagination = { page: number; pageSize: number; offset: number };
export type ClientSearch = Pagination & { sellerId?: string; active: boolean; search?: string };
export type ProductSearch = Pagination & { active: boolean };
export type IdempotentOrder = { id: string; requestHash: string };
export type OrderRecord = Order & { clientSnapshot: Client };
export type CommandRecord = {
  id: string;
  orderId: string;
  status: CommandStatus;
  orderStatus: Order['status'];
};
export type OrderRegistration = {
  id: string;
  input: OrderInput;
  quote: Quote;
  client: Client;
  authorId: string;
  key: string;
  requestHash: string;
  at: string;
};
export type PlannedStop = {
  id: string;
  clientId: string;
  sellerId: string;
  scheduledAt: string;
  position: number;
};
export type RouteRegistration = {
  id: string;
  input: RouteInput;
  seriesId: string | null;
  recurrence: Route['recurrence'];
  stops: PlannedStop[];
  at: string;
};
export type VisitRegistration = {
  id: string;
  clientId: string;
  sellerId: string;
  scheduledAt: string;
  at: string;
};
export type VisitCompletion = {
  visit: Visit;
  input: VisitResultInput;
  at: string;
  followUp?: VisitRegistration;
};
export type ReportRange = {
  from: string;
  to: string;
  start: string;
  end: string;
  sellerId?: string;
};

export interface CatalogRepository {
  findClient(id: string): Promise<Client | null>;
  listClients(query: ClientSearch): Promise<Page<Client>>;
  sellerExists(id: string): Promise<boolean>;
  createClient(id: string, code: string, input: ClientInput, at: string): Promise<void>;
  updateClient(
    id: string,
    input: ClientInput,
    geoUpdatedBy: string | null,
    at: string,
  ): Promise<void>;
  completeClient(
    id: string,
    input: CompletionInput,
    sellerId: string | undefined,
    at: string,
  ): Promise<boolean>;
  listProducts(query: ProductSearch): Promise<Page<Product>>;
  findProducts(ids: string[]): Promise<Product[]>;
  createProduct(id: string, input: ProductInput, at: string): Promise<void>;
  updateProduct(id: string, input: ProductInput, at: string): Promise<boolean>;
  listRates(): Promise<Rate[]>;
  latestRate(currency: Currency): Promise<Pick<Rate, 'id' | 'rate'> | null>;
  createRate(id: string, input: RateInput, at: string): Promise<void>;
}

export interface OrderRepository {
  list(pagination: Pagination, authorId?: string): Promise<Page<Order>>;
  find(id: string): Promise<OrderRecord | null>;
  findAttempt(authorId: string, key: string): Promise<IdempotentOrder | null>;
  register(order: OrderRegistration): Promise<void>;
  validate(id: string, commandId: string, at: string): Promise<void>;
  cancel(id: string, at: string): Promise<boolean>;
  listCommands(pagination: Pagination): Promise<Page<Command>>;
  findCommand(id: string): Promise<CommandRecord | null>;
  advanceCommand(command: CommandRecord, next: CommandStatus, at: string): Promise<boolean>;
}

export interface PlanningRepository {
  listRoutes(pagination: Pagination, sellerId?: string): Promise<Page<Route>>;
  findRoute(id: string): Promise<Route | null>;
  saveRoutes(routes: RouteRegistration[], editingId?: string): Promise<void>;
  listVisits(pagination: Pagination, sellerId?: string): Promise<Page<Visit>>;
  findVisit(id: string): Promise<Visit | null>;
  createVisit(visit: VisitRegistration): Promise<void>;
  completeVisit(completion: VisitCompletion): Promise<void>;
}

export interface ManagementRepository {
  listUsers(pagination: Pagination): Promise<Page<SessionUser>>;
  listSellers(): Promise<NamedUser[]>;
  findUser(id: string): Promise<SessionUser | null>;
  recordUserCreation(id: string): Promise<void>;
  updateUser(id: string, input: UserUpdateInput, previousRole: string): Promise<void>;
  requirePasswordChange(id: string): Promise<void>;
  dashboard(sellerId?: string): Promise<Dashboard>;
  report(range: ReportRange): Promise<Report>;
  listAudit(pagination: Pagination): Promise<AuditEntry[]>;
}

export interface AccountGateway {
  createUser(input: UserInput): Promise<{ id: string }>;
  setPassword(id: string, password: string): Promise<void>;
}

export interface A2Gateway {
  importClients(): Promise<unknown>;
  pushClient(clientId: string): Promise<unknown>;
  pushOrder(orderId: string): Promise<unknown>;
  getAccountStatement(clientId: string): Promise<unknown>;
}
