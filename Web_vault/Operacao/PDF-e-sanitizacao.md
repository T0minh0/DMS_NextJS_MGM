# PDF e sanitizacao

Referencia: [[ADR/ADR-0005-pdf-sanitizacao-notices]].

## PDF

Engine escolhida: `@react-pdf/renderer`.

Regras para endpoints futuros:

- usar App Router route handler com `runtime = 'nodejs'`;
- validar sessao/RBAC antes de renderizar;
- usar `renderReportPdfBuffer` ou wrapper equivalente;
- retornar `Content-Type: application/pdf`;
- retornar `Content-Disposition` com `filename` e `filename*`;
- sanitizar nomes de arquivo antes de montar headers de download;
- retornar `Cache-Control: no-store`;
- formatar datas em `pt-BR` e timezone `America/Sao_Paulo`;
- formatar peso como kg e dinheiro como BRL.

POC:

- `src/lib/reports/pdf.tsx`
- `tests/reports-notices.test.ts`

## Sanitizacao de notices

Helpers:

- `sanitizeNoticeTitle`: texto puro, sem HTML.
- `sanitizeNoticeContent`: allowlist curta de formatting/blocks.

Tags permitidas no conteudo:

```text
p, br, strong, em, b, i, u, ul, ol, li, blockquote
```

Nenhum atributo e permitido.

Tags perigosas e form-related (`script`, `style`, `textarea`, `option`) sao descartadas com conteudo. Isso evita tambem o vetor corrigido em `sanitize-html` 2.17.3.

## Testes

```bash
npm test
```

Casos cobertos:

- XSS com `script`;
- XSS por atributo `onerror`;
- URL `javascript:`;
- `svg onload` independente;
- `style`, `class`, `onclick`, `onerror`, `onload` em tag permitida;
- breakout via entidades dentro de `option` e `textarea`;
- POC PDF com bytes iniciando em `%PDF-`;
- headers de download PDF, incluindo sanitizacao de nome de arquivo.

## Dependencias

- `@react-pdf/renderer`
- `sanitize-html`
- `@types/sanitize-html`

Manter `sanitize-html` em `2.17.3` ou superior por causa de GHSA-9mrh-v2v3-xpfm / CVE-2026-40186.

## Relatorios do periodo (consolidado e comprovante do catador)

- Rotas: `GET /api/reports/pdf/period` (consolidado da cooperativa; ignora `worker_id`) e `GET /api/reports/pdf/worker/[workerId]` (comprovante individual). Ambas com `runtime = 'nodejs'`, `buildPdfDownloadHeaders` (`attachment`, `filename*`, `Cache-Control: no-store`) e os mesmos params de `GET /api/reports/period`.
- Documentos em `src/lib/reports/pdf.tsx` (`PeriodReportPdfDocument`, `WorkerReceiptPdfDocument`) com paleta clara para impressao usando apenas cores do contrato (`#F5F8FF`, `#0A0E1A`, `#65708D`, `#C15079`, `#7A1C44`, `#F8EEF1`, `#94A3C7`); tabelas com header fixo (`fixed`), zebra, numeros a direita e rodape "Pagina X de Y".
- Nomes: `relatorio-<slug-da-cooperativa>-<AAAA-MM>.pdf` ou `...-<AAAA-MM-DD>-a-<AAAA-MM-DD>.pdf`; `comprovante-<wp-id>-<periodo>.pdf`. `slugifyForFilename` remove acentos antes de `sanitizePdfFilename`.
- Datas-so (`DATE`) formatadas em UTC (`formatReportDateOnly`); timestamps em America/Sao_Paulo (`formatReportDateTime`).
- O comprovante nunca inclui CPF/RG/PIS/telefone: apenas `WP` id e nome.
- Testes: `tests/reports-period-pdf.test.ts` (magic bytes `%PDF-`, paginacao com 80 catadores, nomes de arquivo), `tests/reports-period-builder.test.ts`, `tests/reports-period-api.test.ts`.
