ALTER TABLE clients ADD COLUMN import_code TEXT;
CREATE UNIQUE INDEX clients_import_code ON clients(import_code) WHERE import_code IS NOT NULL;
