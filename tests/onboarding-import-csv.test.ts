import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectDelimiter,
  detectMojibake,
  normalizeLookupText,
  normalizeWeightText,
  parseBagState,
  parseCollectionDate,
  parseCsv,
  parseMaterialReference,
  parseWeightKg,
  parseWorkerReference,
  sha256Hex,
} from '../src/lib/onboarding/csv';
import { UTF8_BOM } from '../src/lib/onboarding/contract';

const today = new Date('2026-09-09T12:00:00Z');

test('parseCsv handles BOM, sep line, delimiters, quotes, CRLF and blank lines', () => {
  const text = `${UTF8_BOM}sep=;\r\ndata_coleta;coletor;material;peso_kg;estado_sacola;observacao\r\n15/03/2024;WP005;"Papel;ão";"12,50";cheia;"obs ""x"""\r\n\r\n16/03/2024;WP006;PET;3;vazia;\r\n`;
  const parsed = parseCsv(text);

  assert.equal(parsed.delimiter, ';');
  assert.deepEqual(parsed.headers, ['data_coleta', 'coletor', 'material', 'peso_kg', 'estado_sacola', 'observacao']);
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows[0].cells, ['15/03/2024', 'WP005', 'Papel;ão', '12,50', 'cheia', 'obs "x"']);
  assert.equal(parsed.rows[0].line, 3);
  assert.equal(parsed.rows[1].line, 5);
  assert.deepEqual(parsed.rows[1].cells, ['16/03/2024', 'WP006', 'PET', '3', 'vazia', '']);

  const comma = parseCsv('data_coleta,coletor,material,peso_kg,estado_sacola\n2024-03-15,5,7,12.5,sim\n');
  assert.equal(comma.delimiter, ',');
  assert.equal(comma.rows[0].cells[3], '12.5');

  const tab = parseCsv('data_coleta\tcoletor\tmaterial\tpeso_kg\testado_sacola\n2024-03-15\t5\t7\t12.5\tsim\n');
  assert.equal(tab.delimiter, '\t');

  assert.equal(detectDelimiter('a;b;c,d'), ';');
  assert.throws(() => parseCsv('data_coleta;coletor\n"aberta'), /Aspas não fechadas/);
  assert.throws(() => parseCsv('\n\n'), /Arquivo vazio/);
});

test('parseCollectionDate accepts pt-BR and ISO dates and rejects impossible ones', () => {
  assert.equal(parseCollectionDate('15/03/2024', today).ok && parseCollectionDate('15/03/2024', today).ok ? (parseCollectionDate('15/03/2024', today) as { dateKey: string }).dateKey : null, '2024-03-15');
  assert.equal((parseCollectionDate('5/3/2024', today) as { dateKey: string }).dateKey, '2024-03-05');
  assert.equal((parseCollectionDate('2024-03-15', today) as { dateKey: string }).dateKey, '2024-03-15');
  assert.equal((parseCollectionDate('2024-03-15', today) as { date: Date }).date.toISOString(), '2024-03-15T00:00:00.000Z');

  const cases: Array<[string, string]> = [
    ['', 'MISSING_REQUIRED'],
    ['15/03/24', 'INVALID_DATE'],
    ['31/02/2024', 'INVALID_DATE'],
    ['10/09/2026', 'DATE_IN_FUTURE'],
    ['31/12/1999', 'DATE_TOO_OLD'],
  ];
  for (const [raw, code] of cases) {
    const result = parseCollectionDate(raw, today);
    assert.equal(result.ok, false, raw);
    assert.equal(result.ok ? null : result.issue.code, code, raw);
  }
});

test('parseWeightKg normalizes pt-BR and en-US separators and rejects bad values', () => {
  assert.equal(normalizeWeightText('1.234,56'), '1234.56');
  assert.equal(normalizeWeightText('1,234.56'), '1234.56');
  assert.equal(normalizeWeightText('12,5 kg'), '12.5');

  for (const [raw, expected] of [['12,5', '12.50'], ['12.5', '12.50'], ['1.234,56', '1234.56'], ['1,234.56', '1234.56'], ['3', '3.00']]) {
    const result = parseWeightKg(raw);
    assert.equal(result.ok, true, raw);
    assert.equal(result.ok ? result.weightKg.toFixed(2) : null, expected, raw);
  }

  for (const [raw, code] of [['', 'MISSING_REQUIRED'], ['0', 'INVALID_WEIGHT'], ['-1', 'INVALID_WEIGHT'], ['1.234', 'INVALID_WEIGHT'], ['abc', 'INVALID_WEIGHT']]) {
    const result = parseWeightKg(raw);
    assert.equal(result.ok, false, raw);
    assert.equal(result.ok ? null : result.issue.code, code, raw);
  }
});

test('parseBagState, worker and material references are tolerant but unambiguous', () => {
  assert.deepEqual(parseBagState('cheia'), { ok: true, bagFilled: true });
  assert.deepEqual(parseBagState('Sim'), { ok: true, bagFilled: true });
  assert.deepEqual(parseBagState('1'), { ok: true, bagFilled: true });
  assert.deepEqual(parseBagState('vazia'), { ok: true, bagFilled: false });
  assert.deepEqual(parseBagState('não'), { ok: true, bagFilled: false });
  assert.deepEqual(parseBagState('0'), { ok: true, bagFilled: false });
  assert.equal(parseBagState('meio').ok, false);
  assert.equal(parseBagState('').ok, false);

  assert.deepEqual(parseWorkerReference('WP005'), { kind: 'id', workerId: BigInt(5) });
  assert.deepEqual(parseWorkerReference('wp5'), { kind: 'id', workerId: BigInt(5) });
  assert.deepEqual(parseWorkerReference('5'), { kind: 'id', workerId: BigInt(5) });
  assert.deepEqual(parseWorkerReference('  Maria  José '), { kind: 'name', normalized: 'maria jose' });
  assert.deepEqual(parseWorkerReference(''), { kind: 'empty' });

  assert.deepEqual(parseMaterialReference('7'), { kind: 'id', materialId: BigInt(7) });
  assert.deepEqual(parseMaterialReference('Papelão'), { kind: 'name', normalized: 'papelao' });
  assert.equal(normalizeLookupText('  PAPELÃO  Ondulado '), 'papelao ondulado');
});

test('detectMojibake flags cp1252 files read as UTF-8 and sha256Hex is stable', () => {
  assert.equal(detectMojibake('PapelÃ£o'), true);
  assert.equal(detectMojibake('Papel�o'), true);
  assert.equal(detectMojibake('Papelão'), false);
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
