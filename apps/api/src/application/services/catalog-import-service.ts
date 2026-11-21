import Decimal from 'decimal.js';
import {
  importRif,
  productSchema,
  unclassifiedZoneKey,
  type CatalogImport,
  type CatalogImportSummary,
  type ImportDecision,
  type ImportZoneAssignments,
  type SessionUser,
} from '@briochett/contracts';
import type {
  CatalogImportChange,
  CatalogImportRecord,
  CatalogImportRepository,
  ImportZoneClassifier,
} from '../ports';
import { fail } from '../../domain/errors';
import { now, sign, tokenEquals, uid } from '../../domain/primitives';
import { caracasDate } from '../../domain/scheduling';

function append<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const current = map.get(key);
  if (current) current.push(value);
  else map.set(key, [value]);
}

export class CatalogImportService {
  constructor(
    private readonly repository: CatalogImportRepository,
    private readonly classifier: ImportZoneClassifier,
    private readonly signingSecret: string,
    private readonly actor: SessionUser,
  ) {}

  async run(input: CatalogImport) {
    const applying = input.revision !== undefined;
    const clients = input.kind === 'clients' ? input : undefined;
    const zoneId = clients?.zoneId;
    const automatic = clients?.classifyZones === true;
    const currency = input.kind === 'prices' ? input.currency : undefined;
    const [existing, zone, copRate, vesRate, zones] = await Promise.all([
      this.repository.find(
        input.kind,
        input.rows.map((row) => ({ code: row.code, rif: 'rif' in row ? row.rif : '' })),
      ),
      zoneId ? this.repository.zone(zoneId) : null,
      currency === 'USD' ? this.repository.latestRate('COP') : null,
      currency === 'VES' ? this.repository.latestRate('VES') : null,
      automatic ? this.repository.activeZones() : [],
    ]);
    if (zoneId && !zone) fail(422, 'IMPORT_ZONE', 'Selecciona una zona comercial activa.');
    const fallback = zones.find((item) => item.nameKey === unclassifiedZoneKey);
    if (automatic && !fallback)
      fail(409, 'IMPORT_ZONE', 'La zona predeterminada Sin clasificar no está disponible.');
    if ((currency === 'USD' && !copRate) || (currency === 'VES' && !vesRate))
      fail(422, 'IMPORT_RATE', 'Registra una tasa vigente para la moneda seleccionada.');
    const byCode = new Map<string, CatalogImportRecord[]>();
    const byRif = new Map<string, CatalogImportRecord[]>();
    for (const item of existing) {
      const code = item.code.trim().toUpperCase();
      append(byCode, code, item);
      if (item.importCode && item.importCode !== code) append(byCode, item.importCode, item);
      const rif = importRif(item.rif);
      if (rif) append(byRif, rif, item);
    }
    const keys = new Map<string, number[]>();
    for (const row of input.rows) {
      append(keys, 'C:' + row.code, row.line);
      if ('rif' in row && row.rif) append(keys, 'R:' + row.rif, row.line);
    }
    const matched = new Map<string, number[]>();
    for (const row of input.rows) {
      const all = [
        ...(byCode.get(row.code) ?? []),
        ...('rif' in row && row.rif ? (byRif.get(row.rif) ?? []) : []),
      ];
      for (const id of new Set(all.map((x) => x.id))) append(matched, id, row.line);
    }
    const summary: CatalogImportSummary = { creates: 0, updates: 0, skipped: 0, unchanged: 0 };
    const pending: Omit<CatalogImportChange, 'id'>[] = [];
    const decisions: ImportDecision[] = [];
    for (const row of input.rows) {
      const { line, code } = row;
      let name = row.name;
      const rif = 'rif' in row ? row.rif : '';
      const decision = (action: ImportDecision['action'], note: string) => {
        if (action === 'crear') summary.creates++;
        else if (action === 'actualizar') summary.updates++;
        else if (action === 'omitir') summary.skipped++;
        else summary.unchanged++;
        decisions.push({ line, code, name, action, note });
      };
      if ((keys.get('C:' + code)?.length ?? 0) > 1 || (keys.get('R:' + rif)?.length ?? 0) > 1) {
        decision('omitir', 'Código o RIF repetido en el archivo.');
        continue;
      }
      const possible = new Map(
        [...(byCode.get(code) ?? []), ...(byRif.get(rif) ?? [])].map((item) => [item.id, item]),
      );
      const old = possible.values().next().value;
      if (possible.size > 1 || (old && (matched.get(old.id)?.length ?? 0) > 1)) {
        decision(
          'omitir',
          'La fila coincide con más de un registro o comparte un registro con otra fila.',
        );
        continue;
      }
      if (old?.deletedAt) {
        decision('omitir', 'El registro está en la Papelera.');
        continue;
      }
      if (!name && old) name = old.name;
      const base = {
        previousId: old?.id ?? null,
        previousAt: old?.updatedAt ?? null,
        code,
        name,
      };
      if ('price' in row) {
        const priceCop = new Decimal(row.price)
          .mul(copRate?.rate ?? vesRate?.rate ?? 1)
          .toFixed(2, Decimal.ROUND_HALF_UP);
        if (!productSchema.safeParse({ sku: code, name, priceCop }).success) {
          decision('omitir', 'El precio convertido no está dentro del rango permitido.');
          continue;
        }
        if (old?.name === name && new Decimal(old.priceCop).eq(priceCop)) {
          decision('sin_cambios', 'Nombre y precio ya coinciden.');
          continue;
        }
        pending.push({ ...base, priceCop });
        decision(
          old ? 'actualizar' : 'crear',
          old ? `COP ${old.priceCop} → COP ${priceCop}` : `COP ${priceCop}`,
        );
        continue;
      }
      if (old?.importCode && old.importCode !== code) {
        decision('omitir', 'El RIF coincide con un cliente vinculado a otro código de origen.');
        continue;
      }
      if (old?.rif && rif && importRif(old.rif) !== rif && importRif(old.rif)) {
        decision('omitir', 'El código coincide, pero el RIF difiere del registrado.');
        continue;
      }
      if (!old && !zone && !automatic) {
        decision('omitir', 'Habilita las altas para crear clientes nuevos.');
        continue;
      }
      const data = {
        ...base,
        rif: old?.rif && importRif(old.rif) ? old.rif : rif || old?.rif || '',
        matchRif: rif,
        phone: row.phone || old?.phone || '',
        address: row.address || old?.address || '',
        active: row.active,
        ...(!old && zone ? { zoneId: zone.id, zoneName: zone.name } : {}),
      };
      if (
        old?.importCode === code &&
        old.name === name &&
        old.rif === data.rif &&
        old.phone === data.phone &&
        old.address === data.address
      ) {
        decision('sin_cambios', 'Los datos del cliente ya coinciden.');
        continue;
      }
      pending.push(data);
      decision(
        old ? 'actualizar' : 'crear',
        old ? 'Se conservan la zona, el vendedor y la ficha operativa.' : '',
      );
    }
    const changed = () =>
      fail(409, 'IMPORT_CHANGED', 'Los datos cambiaron. Genera una nueva vista previa.');
    const zoneAssignments: ImportZoneAssignments = [];
    let zoneWarning: string | undefined;
    if (clients) {
      const creations = new Map(pending.filter((item) => !item.previousId).map((c) => [c.code, c]));
      const reviewed = new Map(clients.zoneAssignments);
      const zonesById = new Map(zones.map((item) => [item.id, item]));
      const result =
        automatic && !applying
          ? await this.classifier.classify(
              [...creations.values()].map((item) => item.address ?? ''),
              zones.filter((item) => item.id !== fallback?.id),
            )
          : undefined;
      zoneWarning = result?.warning;
      if (automatic && applying && reviewed.size !== creations.size) changed();
      for (const decision of decisions) {
        const creation = creations.get(decision.code);
        if (!creation || decision.action !== 'crear') continue;
        if (fallback) {
          const selected = applying
            ? zonesById.get(reviewed.get(creation.code) ?? '')
            : (zonesById.get(result?.matches.get(creation.address ?? '') ?? '') ?? fallback);
          if (!selected) return changed();
          creation.zoneId = selected.id;
          creation.zoneName = selected.name;
          zoneAssignments.push([creation.code, selected.id]);
        }
        decision.note = `Zona: ${creation.zoneName}`;
      }
    }
    const revision = await sign(
      [
        'catalog-import',
        this.actor.id,
        input.kind,
        input.rows,
        zone,
        zones,
        currency,
        copRate,
        vesRate,
        pending,
        decisions,
      ],
      this.signingSecret,
    );
    const response = {
      revision,
      decisions,
      summary,
      ...(copRate ? { copRate: copRate.rate } : {}),
      ...(vesRate ? { vesRate: vesRate.rate } : {}),
      ...(automatic ? { zoneAssignments } : {}),
      ...(zoneWarning ? { zoneWarning } : {}),
    };
    if (!applying) return response;
    if (!input.revision || !(await tokenEquals(revision, input.revision))) changed();
    if (
      pending.length &&
      !(await this.repository.apply({
        kind: input.kind,
        changes: pending.map((c) => ({ ...c, id: c.previousId ?? uid() })),
        zoneId,
        currency,
        rateIds: [
          ...(copRate ? [{ currency: 'COP' as const, id: copRate.id }] : []),
          ...(vesRate ? [{ currency: 'VES' as const, id: vesRate.id }] : []),
        ],
        at: now(),
        date: caracasDate(),
        summary,
      }))
    )
      changed();
    return response;
  }
}
