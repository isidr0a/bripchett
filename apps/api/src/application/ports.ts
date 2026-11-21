import type {
  AuditEntry,
  CatalogImportKind,
  CatalogImportSummary,
  Client,
  ClientInput,
  Command,
  CommandStatus,
  CompletionInput,
  Currency,
  Dashboard,
  DeletionScope,
  NamedUser,
  Order,
  OrderInput,
  Page,
  Product,
  ProductInput,
  ProductionFilters,
  ProductionOption,
  ProductionOptionsQuery,
  ProductionReport,
  Quote,
  Rate,
  RateInput,
  Report,
  Route,
  RouteInput,
  SessionUser,
  UserInput,
  UserUpdateInput,
  TrashType,
  TrashEntry,
  Visit,
  VisitResultInput,
  Zone,
  ZoneInput,
  ZoneImpact,
} from '@briochett/contracts';

export type Pagination = { page: number; pageSize: number; offset: number };
export type ClientSearch = Pagination & {
  sellerId?: string;
  zoneId?: string;
  active: boolean;
  search?: string;
};
export type PendingZoneStop = ZoneImpact['stops'][number] & {
  routeZoneId: string;
  sellerId: string;
};
export type ProductSearch = Pagination & { active: boolean };
export type IdempotentOrder = { id: string; requestHash: string; deletedAt: string | null };
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
type ProductionIssueRange = { start?: string; end?: string };
export type ProductionReportRange = ProductionFilters & ProductionIssueRange;
export interface ProductionReportRepository {
  totals(filters: ProductionReportRange): Promise<ProductionReport>;
  options(
    query: ProductionOptionsQuery & ProductionIssueRange,
    pagination: Pagination,
  ): Promise<Page<ProductionOption>>;
}

export interface CatalogRepository {
  findClient(id: string): Promise<Client | null>;
  listClients(query: ClientSearch): Promise<Page<Client>>;
  sellerExists(id: string): Promise<boolean>;
  zoneImpact(id: string, zoneId: string): Promise<PendingZoneStop[]>;
  createClient(id: string, code: string, input: ClientInput, at: string): Promise<void>;
  updateClient(
    id: string,
    input: ClientInput,
    geoUpdatedBy: string | null,
    at: string,
    expected: { updatedAt: string; pending: PendingZoneStop[] },
  ): Promise<boolean>;
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

export type RestoreVisit = Pick<Visit, 'id' | 'clientId' | 'sellerId' | 'scheduledAt'>;
export interface TrashRepository {
  list(pagination: Pagination, type?: TrashType): Promise<Page<TrashEntry>>;
  remove(type: TrashType, id: string, scope: DeletionScope, at: string): Promise<number | null>;
  restoreVisits(type: 'routes' | 'visits', id: string): Promise<RestoreVisit[]>;
  restore(type: TrashType, id: string, clientVersions: Record<string, string>): Promise<boolean>;
}

export interface ZoneRepository {
  list(pagination: Pagination, active: boolean, search: string): Promise<Page<Zone>>;
  find(id: string): Promise<Zone | null>;
  save(id: string, data: ZoneInput, key: string, at: string, editing: boolean): Promise<boolean>;
}

export type CatalogImportKey = { code: string; rif?: string };
export type CatalogImportRecord = {
  id: string;
  code: string;
  importCode: string | null;
  name: string;
  rif: string;
  phone: string;
  address: string;
  priceUsd: string;
  updatedAt: string;
  deletedAt: string | null;
};
export type CatalogImportChange = {
  id: string;
  previousId: string | null;
  previousAt: string | null;
  code: string;
  name: string;
  rif?: string;
  matchRif?: string;
  phone?: string;
  address?: string;
  active?: boolean;
  priceUsd?: string;
  zoneId?: string;
  zoneName?: string;
};
export type ImportZone = Pick<Zone, 'id' | 'name'>;
export interface ImportZoneClassifier {
  classify(
    addresses: string[],
    zones: ImportZone[],
  ): Promise<{ matches: Map<string, string>; warning?: string }>;
}
export interface CatalogImportRepository {
  find(kind: CatalogImportKind, keys: CatalogImportKey[]): Promise<CatalogImportRecord[]>;
  zone(id: string): Promise<ImportZone | null>;
  activeZones(): Promise<(ImportZone & { nameKey: string })[]>;
  latestRate(currency: 'COP' | 'VES'): Promise<{ id: string; rate: string } | null>;
  apply(input: {
    kind: CatalogImportKind;
    changes: CatalogImportChange[];
    zoneId?: string;
    rateId?: string;
    currency?: 'USD' | 'COP' | 'VES';
    at: string;
    date: string;
    summary: CatalogImportSummary;
  }): Promise<boolean>;
}
