import { read, set_cptable, utils } from 'xlsx';
import * as codepages from 'xlsx/dist/cpexcel.full';
import {
  importClientRow,
  importPriceRow,
  type ImportClientRow,
  type ImportPriceRow,
} from '@briochett/contracts';

export type DocumentIssue = { line: number; text: string };
export type CatalogWorkbook = { issues: DocumentIssue[] } & (
  { kind: 'clients'; rows: ImportClientRow[] } | { kind: 'prices'; rows: ImportPriceRow[] }
);
const MAX_CELLS = 60_000;
export const maximumExcelBytes = 2 * 1024 * 1024;
const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const header = (value: unknown) =>
  text(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ');

function price(value: unknown) {
  if (typeof value === 'number')
    return Number.isFinite(value) && value > 0 ? value.toFixed(6).replace(/\.?0+$/, '') : '';
  const v = text(value).replace(/\s/g, '');
  if (/^\d+(?:[.,]\d{1,6})?$/.test(v)) return v.replace(',', '.');
  if (/^\d{1,3}(?:\.\d{3})+,\d{1,6}$/.test(v)) return v.replaceAll('.', '').replace(',', '.');
  if (/^\d{1,3}(?:,\d{3})+\.\d{1,6}$/.test(v)) return v.replaceAll(',', '');
  return '';
}
function priceReport(
  rows: unknown[][],
  start: number,
  priceColumn: number,
  end: number,
): CatalogWorkbook {
  const found: ImportPriceRow[] = [];
  const issues: DocumentIssue[] = [];
  for (let i = start + 1; i < rows.length; i++) {
    const r = rows[i];
    const code = text(r[0]),
      name = text(r[1]);
    if (
      !code ||
      (header(code) === 'codigo' && header(name) === 'descripcion') ||
      header(code).startsWith('total registros')
    )
      continue;
    const cells = r.slice(priceColumn, end).filter((cell) => text(cell));
    const parsed = importPriceRow.safeParse({
      line: i + 1,
      code,
      name,
      price: cells.length === 1 ? price(cells[0]) : '',
    });
    if (parsed.success) found.push(parsed.data);
    else issues.push({ line: i + 1, text: 'Código, descripción o importe de Precio 1 inválido.' });
  }
  return { kind: 'prices', rows: found, issues };
}

function clientReport(rows: unknown[][], start: number): CatalogWorkbook {
  const found: ImportClientRow[] = [];
  const issues: DocumentIssue[] = [];
  let active:
    | {
        line: number;
        code: string;
        name: string;
        address: string;
        active: boolean;
        rif: string;
        phone: string;
      }
    | undefined;
  function flush() {
    if (!active) return;
    const parsed = importClientRow.safeParse(active);
    if (parsed.success) found.push(parsed.data);
    else
      issues.push({
        line: active.line,
        text:
          active.name.length === 1
            ? 'Si se indica una descripción, debe tener al menos dos caracteres.'
            : 'La ficha tiene campos inválidos o excede los límites permitidos.',
      });
    active = undefined;
  }
  for (let i = start + 2; i < rows.length; i++) {
    const r = rows[i];
    const code = text(r[0]),
      flag = header(r[2]);
    if (code) {
      flush();
      if (
        (header(code) === 'codigo' && header(r[1]) === 'descripcion') ||
        header(code).startsWith('total registros')
      )
        continue;
      if (flag !== 'si' && flag !== 'no') {
        issues.push({ line: i + 1, text: 'Estado Activo inválido o ausente.' });
        continue;
      }
      active = {
        line: i + 1,
        code,
        name: text(r[1]),
        address: text(r[3]),
        active: flag === 'si',
        rif: '',
        phone: '',
      };
    } else if (active) {
      if (header(r[1]) === 'telefono' && header(r[2]) === 'rif') continue;
      active.phone ||= text(r[1]);
      active.rif ||= text(r[2]);
    }
  }
  flush();
  return { kind: 'clients', rows: found, issues };
}

export function parseCatalogWorkbook(data: ArrayBuffer | Uint8Array): CatalogWorkbook {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  const biff = bytes[0] === 0x09 && [0, 2, 4, 8].includes(bytes[1]);
  const xlsx = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
  if (bytes.byteLength > maximumExcelBytes || (!ole && !biff && !xlsx))
    throw new Error('Selecciona un archivo Excel válido de hasta 2 MB.');
  set_cptable(codepages);
  const book = read(bytes, {
    type: 'array',
    codepage: 1252,
    sheetRows: 10000,
    cellFormula: false,
    cellHTML: false,
  });
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet?.['!ref']) continue;
    const range = utils.decode_range(sheet['!fullref'] ?? sheet['!ref']);
    if ((range.e.r + 1) * (range.e.c + 1) > MAX_CELLS || range.e.r >= 10000) continue;
    const rows = utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: '',
      blankrows: true,
      range: { s: { r: 0, c: 0 }, e: range.e },
    });
    for (let start = 0; start < Math.min(rows.length, 60); start++) {
      const row = rows[start].map(header);
      if (row[0] !== 'codigo' || row[1] !== 'descripcion') continue;
      const priceColumn = row.indexOf('precio 1');
      const totalColumn = row.indexOf('existencia');
      const result =
        priceColumn > 1 && totalColumn > priceColumn
          ? priceReport(rows, start, priceColumn, totalColumn)
          : row[2] === 'activo' &&
              row[3] === 'direccion' &&
              header(rows[start + 1]?.[1]) === 'telefono' &&
              header(rows[start + 1]?.[2]) === 'rif'
            ? clientReport(rows, start)
            : null;
      if (result) {
        if (!result.rows.length)
          throw new Error('El reporte no contiene filas válidas para revisar.');
        if (result.rows.length > 1200)
          throw new Error('El archivo supera el máximo de 1200 registros por carga.');
        return result;
      }
    }
  }
  throw new Error('No se reconoció el formato de Lista de Precios o General de Clientes.');
}
