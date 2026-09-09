import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { DecimalValidationError, parsePositiveDecimal2 } from '@/lib/decimal';
import { MIN_COLLECTION_DATE, UTF8_BOM, type RowIssue } from './contract';

export type CsvDelimiter = ';' | ',' | '\t';

export interface ParsedCsv {
  delimiter: CsvDelimiter;
  headers: string[];
  rows: Array<{ line: number; cells: string[] }>;
}

export class CsvParseError extends Error {
  readonly code = 'CSV_PARSE_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

export function stripBom(text: string) {
  return text.startsWith(UTF8_BOM) ? text.slice(1) : text;
}

export function detectDelimiter(headerLine: string): CsvDelimiter {
  const counts: Array<[CsvDelimiter, number]> = [
    [';', (headerLine.match(/;/g) ?? []).length],
    [',', (headerLine.match(/,/g) ?? []).length],
    ['\t', (headerLine.match(/\t/g) ?? []).length],
  ];
  counts.sort((left, right) => right[1] - left[1]);
  return counts[0][1] > 0 ? counts[0][0] : ';';
}

/**
 * Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF/LF, BOM, an
 * optional leading `sep=;` line and blank lines. Records keep their 1-based
 * line number for error reporting.
 */
export function parseCsv(input: string): ParsedCsv {
  const text = stripBom(input).replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  let startIndex = 0;

  if (/^sep=(.)\s*$/i.test(lines[0] ?? '')) {
    startIndex = 1;
  }

  const headerLine = lines.slice(startIndex).find((line) => line.trim().length > 0);
  if (headerLine === undefined) {
    throw new CsvParseError('Arquivo vazio: informe o cabeçalho e ao menos uma linha.');
  }

  const delimiter = detectDelimiter(headerLine);
  const records: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let recordStartLine = startIndex + 1;
  let currentLine = startIndex + 1;
  const body = lines.slice(startIndex).join('\n');

  const pushCell = () => {
    cells.push(cell);
    cell = '';
  };
  const pushRecord = () => {
    pushCell();
    const isBlank = cells.every((value) => value.trim() === '');
    if (!isBlank) {
      records.push({ line: recordStartLine, cells: cells.map((value) => value.trim()) });
    }
    cells = [];
    recordStartLine = currentLine + 1;
  };

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];

    if (inQuotes) {
      if (char === '"') {
        if (body[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === '\n') currentLine += 1;
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      pushCell();
      continue;
    }

    if (char === '\n') {
      pushRecord();
      currentLine += 1;
      continue;
    }

    cell += char;
  }

  if (inQuotes) {
    throw new CsvParseError('Aspas não fechadas no arquivo CSV.');
  }

  if (cell.length > 0 || cells.length > 0) {
    pushRecord();
  }

  if (records.length === 0) {
    throw new CsvParseError('Arquivo vazio: informe o cabeçalho e ao menos uma linha.');
  }

  const [header, ...rows] = records;
  return {
    delimiter,
    headers: header.cells.map((value) => value.toLowerCase()),
    rows,
  };
}

export function normalizeLookupText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Excel/Windows "CSV" saved as cp1252 shows up as mojibake (A-tilde + C1 control) or U+FFFD after a UTF-8 read. */
export function detectMojibake(text: string) {
  return /\uFFFD/.test(text) || /\u00C3[\u0080-\u00BF]/.test(text);
}

export function sha256Hex(text: string) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function issue(field: string, code: string, message: string): RowIssue {
  return { field, code, message };
}

export type DateParseResult = { ok: true; date: Date; dateKey: string } | { ok: false; issue: RowIssue };

export function parseCollectionDate(raw: string, today: Date = new Date()): DateParseResult {
  const value = raw.trim();
  if (!value) {
    return { ok: false, issue: issue('data_coleta', 'MISSING_REQUIRED', 'Informe a data da coleta.') };
  }

  let year: number;
  let month: number;
  let day: number;
  const brazilian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (brazilian) {
    day = Number(brazilian[1]);
    month = Number(brazilian[2]);
    year = Number(brazilian[3]);
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    return { ok: false, issue: issue('data_coleta', 'INVALID_DATE', 'Data inválida. Use DD/MM/AAAA com ano de 4 dígitos.') };
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { ok: false, issue: issue('data_coleta', 'INVALID_DATE', 'Data inexistente no calendário.') };
  }

  const todayKey = today.toISOString().slice(0, 10);
  const dateKey = date.toISOString().slice(0, 10);
  if (dateKey > todayKey) {
    return { ok: false, issue: issue('data_coleta', 'DATE_IN_FUTURE', 'A data da coleta não pode estar no futuro.') };
  }

  if (date.getTime() < MIN_COLLECTION_DATE.getTime()) {
    return { ok: false, issue: issue('data_coleta', 'DATE_TOO_OLD', 'A data da coleta deve ser a partir de 01/01/2000.') };
  }

  return { ok: true, date, dateKey };
}

export type WorkerReference =
  | { kind: 'id'; workerId: bigint }
  | { kind: 'name'; normalized: string }
  | { kind: 'empty' };

export function parseWorkerReference(raw: string): WorkerReference {
  const value = raw.trim();
  if (!value) {
    return { kind: 'empty' };
  }

  const match = /^(?:wp)?\s*0*(\d+)$/i.exec(value);
  if (match) {
    return { kind: 'id', workerId: BigInt(match[1]) };
  }

  return { kind: 'name', normalized: normalizeLookupText(value) };
}

export type MaterialReference =
  | { kind: 'id'; materialId: bigint }
  | { kind: 'name'; normalized: string }
  | { kind: 'empty' };

export function parseMaterialReference(raw: string): MaterialReference {
  const value = raw.trim();
  if (!value) {
    return { kind: 'empty' };
  }

  if (/^\d+$/.test(value)) {
    return { kind: 'id', materialId: BigInt(value) };
  }

  return { kind: 'name', normalized: normalizeLookupText(value) };
}

export function normalizeWeightText(raw: string) {
  const value = raw.trim().replace(/\s|kg/gi, '');
  if (!value) {
    return '';
  }

  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');
  if (lastComma === -1 && lastDot === -1) {
    return value;
  }

  const decimalSeparator = lastComma > lastDot ? ',' : '.';
  const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
  return value.split(thousandsSeparator).join('').replace(decimalSeparator, '.');
}

export type WeightParseResult = { ok: true; weightKg: Prisma.Decimal } | { ok: false; issue: RowIssue };

export function parseWeightKg(raw: string): WeightParseResult {
  const normalized = normalizeWeightText(raw);
  if (!normalized) {
    return { ok: false, issue: issue('peso_kg', 'MISSING_REQUIRED', 'Informe o peso em kg.') };
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return { ok: false, issue: issue('peso_kg', 'INVALID_WEIGHT', 'Peso inválido. Use números com até 2 casas decimais.') };
  }

  try {
    return { ok: true, weightKg: parsePositiveDecimal2(normalized, 'peso_kg') };
  } catch (error) {
    if (error instanceof DecimalValidationError) {
      return { ok: false, issue: issue('peso_kg', 'INVALID_WEIGHT', 'Peso deve ser maior que zero e ter no máximo 2 casas decimais.') };
    }
    throw error;
  }
}

export type BagStateParseResult = { ok: true; bagFilled: boolean } | { ok: false; issue: RowIssue };

const BAG_FULL_VALUES = new Set(['cheia', 'cheio', 'sim', 's', 'true', '1', 'fechada', 'fechado']);
const BAG_EMPTY_VALUES = new Set(['vazia', 'vazio', 'nao', 'n', 'false', '0', 'aberta', 'aberto']);

export function parseBagState(raw: string): BagStateParseResult {
  const value = normalizeLookupText(raw);
  if (!value) {
    return { ok: false, issue: issue('estado_sacola', 'MISSING_REQUIRED', 'Informe o estado da sacola (cheia ou vazia).') };
  }

  if (BAG_FULL_VALUES.has(value)) {
    return { ok: true, bagFilled: true };
  }

  if (BAG_EMPTY_VALUES.has(value)) {
    return { ok: true, bagFilled: false };
  }

  return { ok: false, issue: issue('estado_sacola', 'INVALID_BAG_STATE', 'Estado da sacola inválido. Use "cheia" ou "vazia".') };
}
