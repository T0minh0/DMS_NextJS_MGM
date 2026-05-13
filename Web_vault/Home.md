# DMS Web

Vault operacional do projeto DMS Web. Esta documentacao reflete o codigo observado no repositorio em 2026-04-27 e deve ser usada como fonte primaria de contexto para onboarding, manutencao e execucao dos agentes Tony.

## Mapa rapido

- [[Arquitetura/Visao-geral]]: visao de sistema, stack e limites.
- [[Arquitetura/Mapa-do-codigo]]: inventario de arquivos, responsabilidades e pontos de entrada.
- [[Arquitetura/Frontend-e-UI]]: telas, layout, navegacao, design tokens e dados consumidos.
- [[Arquitetura/Autenticacao-e-seguranca]]: login, cookie JWT, proxy, RBAC e riscos de seguranca.
- [[Dominio/Modelo-de-dados]]: modelos Prisma, tabelas SQL, relacionamentos e campos.
- [[Modelos/Prisma]]: referencia rapida dos modelos Prisma e tabelas SQL.
- [[Dominio/Regras-de-negocio]]: regras observadas em vendas, estoque, usuarios, produtividade e contribuicoes.
- [[Dominio/Fluxos-operacionais]]: fluxos ponta a ponta do produto.
- [[API/Rotas]]: indice completo de endpoints.
- [[API/Autenticacao]]: endpoints de login/logout e proxy.
- [[API/Usuarios]]: endpoints de perfil, usuarios e catadores.
- [[API/Materiais-e-cooperativas]]: endpoints de materiais, grupos e cooperativas.
- [[API/Vendas-e-estoque]]: endpoints de vendas, compradores e estoque.
- [[API/Dashboard-e-analytics]]: endpoints usados pelos graficos e produtividade.
- [[API/Debug-e-operacao]]: endpoints debug e recalc.
- [[Operacao/Setup-local]]: setup local e variaveis.
- [[Operacao/Comandos-e-validacao]]: comandos verificados, build, lint e audit.
- [[Operacao/Jobs-e-feature-flags]]: cron, runner, secrets e flags de migracao.
- [[Operacao/PDF-e-sanitizacao]]: engine PDF, headers, locale e sanitizacao server-side de notices.
- [[Operacao/Seed-e-dados-locais]]: seed Prisma, contas de teste e dados criados.
- [[Operacao/Qualidade-e-riscos]]: riscos tecnicos observados.
- [[Planejamento/Tony]]: configuracao ClickUp, agentes e runtime.
- [[Planejamento/Jornadas-gerenciais-IA]]: papeis de produto, jornadas gerenciais, IA alvo e evidencias browser para UI.
- [[Planejamento/Backlog-tecnico]]: proximas melhorias recomendadas.
- [[Planejamento/Inventario-portabilidade-java-next]]: mapa de paridade para portar o repo Java para Next/Prisma.
- [[ADR/ADR-0001-schema-prisma-baseline-rollback]]: decisao de schema Prisma, baseline migration e rollback.
- [[ADR/ADR-0002-lifecycle-vendas-estoque-decimal]]: lifecycle de vendas, estoque, Decimal e rateio.
- [[ADR/ADR-0003-contrato-visual-web]]: contrato visual Web dark/neon derivado de `.tony/design.md`.
- [[ADR/ADR-0004-job-runner-cron-feature-flags]]: runner de jobs, cron, secrets, idempotencia e feature flags.
- [[ADR/ADR-0005-pdf-sanitizacao-notices]]: engine PDF, templates server-side e sanitizacao de notices.
- [[Melhorias/Log]]: espelho do improvement log.

## Estado atual

- Aplicacao: dashboard DMS para gestao de coletas, estoque, vendas, materiais, usuarios e produtividade.
- Stack observada: Next.js App Router, TypeScript, React, Tailwind CSS, Prisma, PostgreSQL, JWT, bcrypt, Chart.js e react-icons.
- Banco canonico: `prisma/schema.prisma`.
- Config Prisma: `prisma.config.ts`.
- Baseline migration: `prisma/migrations/00000000000000_baseline/migration.sql`.
- Variaveis obrigatorias: `DATABASE_URL` e `JWT_SECRET`.
- Vault: `Web_vault`.
- Runtime Tony: `.tony/config.json`.
- CI: `.github/workflows/quality.yml`.
- Jobs: runner externo definido por ADR, feature flags opt-in e helper idempotente em `src/lib/jobs`.
- PDF e notices: POC PDF em `src/lib/reports/pdf.tsx` e sanitizacao em `src/lib/notices/sanitize.ts`.
- ClickUp: `Pessoal -> DMS web`.

## Alertas de contexto

- `DOCUMENTATION.md` e partes do texto antigo ainda citam MongoDB/Mongoose, mas o codigo atual usa Prisma/PostgreSQL.
- `npm run quality` passa e agrega lint, typecheck, testes, Prisma validate, contrato visual, build e whitespace.
- `npm run build` passa usando `src/proxy.ts`, sem alerta de convencao antiga do Next.
- `npm run lint` usa `eslint .` e passa.
- `npm audit` e `npm audit --omit=dev` retornam 0 vulnerabilidades.
