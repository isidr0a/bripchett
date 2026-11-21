import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../apps/api/migrations/0011_prices_cop.sql', import.meta.url),
  'utf8',
);
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE products (id TEXT PRIMARY KEY, price_usd TEXT, active INTEGER, deleted_at TEXT);
    CREATE TABLE exchange_rates (id TEXT PRIMARY KEY, currency TEXT, rate TEXT, deleted_at TEXT, created_at TEXT);
    CREATE TABLE orders (id TEXT, client_id TEXT, author_id TEXT, currency TEXT, rate_id TEXT);
    CREATE TABLE order_items (id TEXT, product_id TEXT, price_usd TEXT);
    CREATE TABLE clients (id TEXT, deleted_at TEXT);
    CREATE TABLE user (id TEXT, deleted_at TEXT);
    CREATE TRIGGER order_product_guard BEFORE INSERT ON order_items BEGIN SELECT 1; END;
    CREATE TRIGGER order_trash_dependencies BEFORE INSERT ON orders BEGIN SELECT 1; END;
  `);
  return db;
}
describe('migración de precios a COP', () => {
  it('rechaza una migración con productos si no existe tasa COP', () => {
    const db = database();
    db.exec("INSERT INTO products VALUES('p','1.00',1,NULL)");
    expect(() => db.exec(migration)).toThrow();
    db.close();
  });
  it('usa la tasa vigente y redondeo decimal conservando USD histórico', () => {
    const db = database();
    db.exec(
      "INSERT INTO products VALUES('p','0.55',1,NULL),('q','0.01',1,NULL); INSERT INTO exchange_rates VALUES('old','COP','4000',NULL,'2026-01-01'),('new','COP','4200.123456',NULL,'2026-02-01');",
    );
    db.exec(migration);
    expect(
      db.prepare('SELECT price_usd,price_cop FROM products WHERE id=?').get('p'),
    ).toMatchObject({ price_usd: '0.55', price_cop: '2310.07' });
    expect(db.prepare('SELECT price_cop FROM products WHERE id=?').get('q')).toMatchObject({
      price_cop: '42.00',
    });
    expect(db.prepare('SELECT rate_id FROM price_conversion_migration').get()).toMatchObject({
      rate_id: 'new',
    });
    db.close();
  });
});
