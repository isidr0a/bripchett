import type { ProductionFilters, ProductionOptionsQuery } from '@briochett/contracts';
import type { Pagination, ProductionReportRepository } from '../ports';

function issueRange({ from, to }: ProductionFilters) {
  return {
    start: from ? new Date(from + 'T04:00:00Z').toISOString() : undefined,
    end: to ? new Date(Date.parse(to + 'T04:00:00Z') + 86_400_000).toISOString() : undefined,
  };
}

export class ProductionReportService {
  constructor(private readonly repository: ProductionReportRepository) {}

  totals(filters: ProductionFilters) {
    return this.repository.totals({ ...filters, ...issueRange(filters) });
  }

  options(query: ProductionOptionsQuery, pagination: Pagination) {
    return this.repository.options({ ...query, ...issueRange(query) }, pagination);
  }
}
