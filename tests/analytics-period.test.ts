import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentYearMonth,
  dateRangeUtc,
  formatDateKey,
  formatDateOnly,
  formatDateRangeLabel,
  getDateRange,
  lastInclusiveDay,
  monthRangeUtc,
  parseIsoDateOnly,
  parseYearMonth,
  rangeLengthDays,
  resolveMaterialIds,
  type MaterialLookupClient,
} from '../src/lib/analytics/period';

test('currentYearMonth follows America/Sao_Paulo at month boundaries', () => {
  assert.equal(currentYearMonth(new Date('2026-09-01T01:00:00Z')), '2026-08');
  assert.equal(currentYearMonth(new Date('2026-09-01T04:00:00Z')), '2026-09');
  assert.equal(currentYearMonth(new Date('2026-01-01T00:30:00Z')), '2025-12');
});

test('parseYearMonth validates the YYYY-MM format', () => {
  assert.deepEqual(parseYearMonth('2026-02'), { year: 2026, monthIndex: 1 });
  assert.equal(parseYearMonth('2026-13'), null);
  assert.equal(parseYearMonth('2026-9'), null);
  assert.equal(parseYearMonth('26-09'), null);
  assert.equal(parseYearMonth(''), null);
  assert.equal(parseYearMonth(null), null);
});

test('monthRangeUtc builds UTC midnight bounds and a pt-BR label', () => {
  const range = monthRangeUtc('2026-02');
  assert.ok(range);
  assert.equal(range.from.toISOString(), '2026-02-01T00:00:00.000Z');
  assert.equal(range.toExclusive.toISOString(), '2026-03-01T00:00:00.000Z');
  assert.match(range.label, /fevereiro/);
  assert.match(range.label, /2026/);
  assert.equal(monthRangeUtc('2026-00'), null);
});

test('parseIsoDateOnly rejects impossible calendar dates', () => {
  assert.equal(parseIsoDateOnly('2026-02-28')?.toISOString(), '2026-02-28T00:00:00.000Z');
  assert.equal(parseIsoDateOnly('2026-02-30'), null);
  assert.equal(parseIsoDateOnly('2026-2-3'), null);
  assert.equal(parseIsoDateOnly('15/03/2026'), null);
});

test('dateRangeUtc treats the end date as inclusive', () => {
  const from = parseIsoDateOnly('2026-09-01')!;
  const to = parseIsoDateOnly('2026-09-15')!;
  const range = dateRangeUtc(from, to);

  assert.equal(range.toExclusive.toISOString(), '2026-09-16T00:00:00.000Z');
  assert.equal(rangeLengthDays(range), 15);
  assert.equal(formatDateKey(lastInclusiveDay(range)), '2026-09-15');
  assert.equal(formatDateOnly(from), '01/09/2026');
  assert.equal(formatDateRangeLabel(range), '01/09/2026 a 15/09/2026');
});

test('getDateRange keeps the legacy server-local dashboard buckets', () => {
  const now = new Date(2026, 8, 9, 15, 30); // Wednesday 2026-09-09 local time
  const weekly = getDateRange('weekly', now);
  assert.equal(weekly.start.getDay(), 0);
  assert.equal(weekly.start.getHours(), 0);
  assert.equal(weekly.end.getDay(), 6);
  assert.equal(weekly.end.getHours(), 23);

  const monthly = getDateRange('monthly', now);
  assert.equal(monthly.start.getDate(), 1);
  assert.equal(monthly.start.getMonth(), 8);
  assert.equal(monthly.end.getDate(), 30);

  const yearly = getDateRange('yearly', now);
  assert.equal(yearly.start.getMonth(), 0);
  assert.equal(yearly.end.getMonth(), 11);
  assert.equal(yearly.end.getDate(), 31);
});

function createFakeMaterialsClient(rows: Array<{ materialId: bigint }>) {
  const calls: unknown[] = [];
  const client = {
    materials: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return rows;
      },
    },
  } as unknown as MaterialLookupClient;

  return { client, calls };
}

test('resolveMaterialIds handles ids, case-insensitive groups, empty groups and invalid input', async () => {
  const { client, calls } = createFakeMaterialsClient([{ materialId: BigInt(3) }, { materialId: BigInt(4) }]);

  const all = await resolveMaterialIds(client, null);
  assert.equal(all.kind, 'all');

  const single = await resolveMaterialIds(client, '7');
  assert.equal(single.kind, 'ids');
  assert.deepEqual(single.ids, [BigInt(7)]);

  const group = await resolveMaterialIds(client, 'group_Papel');
  assert.equal(group.kind, 'ids');
  assert.deepEqual(group.ids, [BigInt(3), BigInt(4)]);
  assert.equal(group.label, 'Grupo Papel');
  const where = (calls[0] as { where: { group: { groupName: { equals: string; mode: string } } } }).where;
  assert.equal(where.group.groupName.equals, 'Papel');
  assert.equal(where.group.groupName.mode, 'insensitive');

  const invalid = await resolveMaterialIds(client, 'abc');
  assert.equal(invalid.kind, 'invalid');

  const emptyClient = createFakeMaterialsClient([]);
  const empty = await resolveMaterialIds(emptyClient.client, 'group_Vidro');
  assert.equal(empty.kind, 'empty_group');
  assert.equal(empty.kind === 'empty_group' ? empty.groupName : null, 'Vidro');
});
