ALTER TABLE routes ADD COLUMN series_id TEXT;
ALTER TABLE routes ADD COLUMN recurrence_json TEXT;
CREATE UNIQUE INDEX route_series_date ON routes(series_id,date) WHERE series_id IS NOT NULL;
