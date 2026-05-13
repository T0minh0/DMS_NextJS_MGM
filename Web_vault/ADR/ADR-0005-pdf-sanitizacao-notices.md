# ADR-0005: Engine PDF e sanitizacao de notices

Status: aceito para execucao da reforma.

Data: 2026-04-27.

Task ClickUp: `86e136bvr` (`[S0-08] ADR engine PDF e politica de sanitizacao de notices`).

## Contexto

O repo Java gera PDFs com Thymeleaf + OpenHTMLToPDF e sanitiza notices com OWASP Java HTML Sanitizer (`FORMATTING` + `BLOCKS`). No Next, precisamos de alternativas server-side que funcionem com App Router, Prisma e deploy Node/Nixpacks sem depender de browser client-side.

Referencias consultadas:

- React-pdf v4 Node API: https://react-pdf.org/node
- Next.js route segment runtime: https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#runtime
- sanitize-html README: https://github.com/apostrophecms/sanitize-html
- GitHub Advisory GHSA-9mrh-v2v3-xpfm / CVE-2026-40186: https://github.com/advisories/GHSA-9mrh-v2v3-xpfm

## Decisao PDF

Adotar `@react-pdf/renderer` para reports PDF.

Motivos:

- Tem Node API oficial (`renderToBuffer`, `renderToStream`, `renderToFile`) para gerar PDF no servidor.
- Reaproveita o modelo mental React/TSX do app Next.
- Evita browser headless pesado no deploy Nixpacks.
- Permite templates versionados em TypeScript, com dados tipados e sem HTML arbitrario.

Rotas futuras de PDF devem:

- usar `runtime = 'nodejs'`;
- chamar os mesmos services/DTOs dos reports JSON;
- gerar PDF por `renderToBuffer` ou `renderToStream`;
- responder `Content-Type: application/pdf`;
- responder `Content-Disposition` com `filename` e `filename*`;
- sanitizar nomes de arquivo antes de montar headers de download;
- usar `Cache-Control: no-store`, porque reports podem conter dados operacionais;
- exigir auth/RBAC de `reports:read` e escopo de cooperativa antes de renderizar;
- nunca renderizar HTML de usuario dentro do PDF sem sanitizacao previa.

POC implementada em `src/lib/reports/pdf.tsx`.

## Templates, fonte e locale

Templates PDF ficam em componentes TSX server-side, inicialmente em `src/lib/reports`.

Padroes:

- Locale: `pt-BR`.
- Timezone: `America/Sao_Paulo`.
- Moeda: `BRL`.
- Peso: kg com 2 casas decimais.
- Fonte: `Helvetica` built-in do renderer para a POC.

Quando houver identidade visual definitiva para reports, a task de PDF deve registrar fonte local com `Font.register` e incluir smoke test para renderizacao.

## Alternativas PDF rejeitadas

| Alternativa | Motivo da rejeicao |
| --- | --- |
| Puppeteer/Playwright para imprimir HTML | Runtime pesado, maior superficie de deploy, frio em serverless/cron e exige browser headless. |
| Portar OpenHTMLToPDF | Biblioteca Java nao se aplica ao runtime Node/Next. |
| PDFKit puro | Robusto, mas baixo nivel demais para templates de reports com layout consistente. |
| HTML string + conversor sem renderer mantido | Risco de XSS/layout inconsistente e menor aderencia ao stack React. |

## Decisao de sanitizacao

Adotar `sanitize-html` server-side, travado em versao patchada `^2.17.3` ou superior.

Politica:

- Titulo de notice e **texto puro**: nenhum HTML permitido.
- Conteudo de notice permite somente formatting/blocks simples:
  - `p`, `br`, `strong`, `em`, `b`, `i`, `u`, `ul`, `ol`, `li`, `blockquote`.
- Nenhum atributo e permitido.
- Nao permitir `a`, `img`, `svg`, `style`, `script`, `iframe`, `object`, `embed`, `form`, `input`, `select`, `option` ou `textarea`.
- `script`, `style`, `textarea` e `option` sao tratados como `nonTextTags` para descartar conteudo inteiro.
- Sanitizacao acontece no servidor em create/update; UI nao deve confiar em sanitizacao client-side.

POC implementada em `src/lib/notices/sanitize.ts`.

## Advisory sanitize-html

Em abril de 2026, `sanitize-html` publicou fix para GHSA-9mrh-v2v3-xpfm / CVE-2026-40186. A falha afetava `>= 2.17.2, < 2.17.3` quando `option` ou `textarea` estavam em `allowedTags`.

Mitigacoes adotadas:

- depender de `sanitize-html@^2.17.3`;
- nao incluir `option` ou `textarea` na allowlist;
- testar payload com entidades dentro de `option` e `textarea`.

## Casos XSS obrigatorios para notices

As tasks de API/UI de notices devem manter testes para:

- `<script>alert(document.cookie)</script>`;
- `<img src=x onerror=alert(1)>`;
- `<a href="javascript:alert(1)">`;
- `<svg onload=alert(1)>`;
- payload entity-decoded dentro de `option` e `textarea`;
- tentativa de atributo `style`, `class`, `onclick`, `onerror`, `onload`.

## Implicacoes para tasks futuras

- S4-01 deve usar `sanitizeNoticeTitle` e `sanitizeNoticeContent` em create/update antes de persistir.
- S4-02 so pode usar `dangerouslySetInnerHTML` com conteudo vindo da sanitizacao server-side e coberto por teste; renderizar como texto continua permitido e mais seguro.
- S3-05 deve usar `renderReportPdfBuffer` ou wrapper equivalente e aplicar auth/RBAC antes de montar o report.
- S3-05 deve validar que o PDF gerado com dados de venda normal/coletiva inicia com `%PDF-` e retorna headers corretos.
- S3-05 deve usar `buildReportPdfFilename` e `buildPdfDownloadHeaders` para evitar nomes de arquivo inseguros em `Content-Disposition`.
- Reports PDF devem usar valores persistidos de `revenue_share`, `sold_at`, `cancelled_at`, kg e BRL conforme [[ADR/ADR-0002-lifecycle-vendas-estoque-decimal]].

## Evidencias desta ADR

- `@react-pdf/renderer` instalado e POC de PDF em `src/lib/reports/pdf.tsx`.
- `sanitize-html@^2.17.3` instalado e politica em `src/lib/notices/sanitize.ts`.
- `tests/reports-notices.test.ts` valida POC PDF, headers de download, sanitizacao de filename e payloads XSS, incluindo `svg onload`, atributos perigosos em tag permitida e o vetor `option`/`textarea`.
- `npm test` passou com 22 testes.
