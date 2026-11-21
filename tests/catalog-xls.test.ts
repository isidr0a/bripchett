import { expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import { parseCatalogWorkbook } from '../apps/web/src/infrastructure/imports/catalog-xls';

function excel(rows: unknown[][]) {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet(rows), 'Exportación');
  return write(book, { type: 'array', bookType: 'biff8' }) as ArrayBuffer;
}

it('reconoce un XLS antiguo de precios y lee el importe a la derecha de su encabezado', () => {
  const result = parseCatalogWorkbook(
    excel([
      ['Briochett'],
      ['Lista de Precios'],
      ['Código', 'Descripción', 'Precio 1', '', '', 'Existencia', ''],
      ['0017', 'Pan de prueba', '', '', 2700, '', -46],
      ['PRUEBA', 'Importe inválido', '', '', 0, '', 144],
    ]),
  );
  expect(result).toEqual({
    kind: 'prices',
    rows: [{ line: 4, code: '0017', name: 'Pan de prueba', price: '2700' }],
    issues: [{ line: 5, text: expect.any(String) }],
  });
});

it('une las filas de una ficha de cliente sin confundir teléfono y RIF con registros nuevos', () => {
  const result = parseCatalogWorkbook(
    excel([
      ['General de Clientes'],
      ['Código', 'Descripción', 'Activo', 'Dirección'],
      ['', 'Teléfono', 'RIF', 'NIT', '', 'E-Mail'],
      ['005', 'Cliente de prueba', 'Sí', 'Dirección ficticia'],
      [],
      ['', '0424-0000000', 'J-889988991', '', '', 'prueba@example.invalid'],
      ['006', 'Otro cliente', 'No', ''],
      ['', '', 'N/A'],
    ]),
  );
  expect(result).toEqual({
    kind: 'clients',
    issues: [],
    rows: [
      {
        line: 4,
        code: '005',
        name: 'Cliente de prueba',
        active: true,
        address: 'Dirección ficticia',
        phone: '0424-0000000',
        rif: 'J889988991',
      },
      {
        line: 7,
        code: '006',
        name: 'Otro cliente',
        active: false,
        address: '',
        phone: '',
        rif: '',
      },
    ],
  });
});

it('lee fichas con la descripción del cliente vacía', () => {
  const result = parseCatalogWorkbook(
    excel([
      ['Código', 'Descripción', 'Activo', 'Dirección'],
      ['', 'Teléfono', 'RIF'],
      ['007', undefined, 'Sí', 'Dirección ficticia'],
      ['', '0424-0000000', 'J-889988991'],
      ['008', '  ', 'No'],
    ]),
  );
  expect(result).toEqual({
    kind: 'clients',
    issues: [],
    rows: [
      {
        line: 3,
        code: '007',
        name: '',
        active: true,
        address: 'Dirección ficticia',
        phone: '0424-0000000',
        rif: 'J889988991',
      },
      { line: 5, code: '008', name: '', active: false, address: '', phone: '', rif: '' },
    ],
  });
});

it('rechaza archivos ajenos al formato esperado', () => {
  expect(() => parseCatalogWorkbook(excel([['Reporte desconocido']]))).toThrow('No se reconoció');
});
