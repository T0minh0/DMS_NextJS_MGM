import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ONBOARDING_COLUMNS,
  TEMPLATE_EXAMPLE_NOTE,
  TEMPLATE_EXAMPLE_WORKER,
  UTF8_BOM,
  buildReferenceCsv,
  buildTemplateCsv,
} from '../src/lib/onboarding/contract';
import { parseCsv } from '../src/lib/onboarding/csv';

test('template CSV opens correctly in pt-BR Excel and cannot be imported by accident', () => {
  const template = buildTemplateCsv();
  assert.equal(template.charCodeAt(0), 0xfeff);
  assert.ok(template.startsWith(`${UTF8_BOM}sep=;\r\n`));

  const parsed = parseCsv(template);
  assert.deepEqual(parsed.headers, ONBOARDING_COLUMNS.map((column) => column.key));
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].cells[1], TEMPLATE_EXAMPLE_WORKER);
  assert.equal(parsed.rows[0].cells[5], TEMPLATE_EXAMPLE_NOTE);
  assert.equal(TEMPLATE_EXAMPLE_WORKER, 'WP000');
});

test('reference CSV lists collectors and materials without personal documents', () => {
  const csv = buildReferenceCsv(
    [
      { wastepickerId: 'WP005', name: 'Ana; Lima', exitDate: null },
      { wastepickerId: 'WP006', name: 'Bia', exitDate: new Date('2023-12-31T00:00:00.000Z') },
    ],
    [{ materialId: '7', name: 'Papelão', groupName: 'Papel' }, { materialId: '8', name: 'PET', groupName: null }],
  );
  const parsed = parseCsv(csv);

  assert.deepEqual(parsed.headers, ['tipo', 'id', 'nome', 'detalhe']);
  assert.deepEqual(parsed.rows.map((row) => row.cells), [
    ['coletor', 'WP005', 'Ana; Lima', 'ativo'],
    ['coletor', 'WP006', 'Bia', 'desligado em 31/12/2023'],
    ['material', '7', 'Papelão', 'Papel'],
    ['material', '8', 'PET', 'sem grupo'],
  ]);
  assert.doesNotMatch(csv, /cpf|rg|pis|email|phone/i);
});
