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
