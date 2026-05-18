# UAT integrado S5-02

Task ClickUp: `86e136ckr` (`[S5-02] QA integrado, UAT Playwright e regressão visual`).

Runner: `scripts/run-s5-02-uat.mjs`.
Evidencia JSON: `output/playwright/s5-02/s5-02-uat-evidence.json`.
Screenshots: `output/playwright/s5-02/*.png`.

## Objetivo

Executar uma varredura browser-first das jornadas gerenciais migradas para o Next.js, cobrindo login, painel, vendas, materiais/estoque, equipe, produtividade, perfil, avisos, venda coletiva e superficies de relatorio. A base usada pelo runner e mockada no navegador com allowlist estrita de metodo + path para isolar regressao visual/interativa de indisponibilidade local de banco; qualquer endpoint ou metodo nao previsto falha com `UNHANDLED_MOCKED_API_REQUEST`.

## Comandos

Servidor local:

```bash
npm run dev -- --port 3106
```

UAT Playwright:

```bash
NODE_PATH=/tmp/codex-playwright-s505/node_modules DMS_UAT_BASE_URL=http://localhost:3106 node scripts/run-s5-02-uat.mjs
```

Qualidade complementar:

```bash
npx tsx --test tests/uat-s502-evidence.test.ts
npx tsx --test tests/auth-rbac.test.ts tests/reports-sales-s304-api.test.ts tests/reports-sales-s305-api.test.ts
npm run quality
```

## Matriz de jornadas

| Jornada | Rota | Evidencia |
| --- | --- | --- |
| Login gerencial | `/login` | Login com CPF `00000000002`, senha `uat-manager-123`, redirecionamento para `/`. |
| Visao geral | `/` | Cards e filtros operacionais carregados com material, estoque, equipe, avisos e vendas. |
| Vendas | `/sales` | Listagem de venda ativa e abertura do modal `Nova Venda`. |
| Materiais | `/materials` | Estoque por cooperativa, status operacional e revisao de impacto de ajuste de saldo. |
| Equipe | `/manage-workers` | Busca por integrante e leitura de documentos mascarados. |
| Produtividade | `/worker-productivity` | Selecao de trabalhador e carga de contribuicao semanal. |
| Perfil | `/profile` | Dados do gerente lidos via `/api/user` escopada. |
| Avisos | `/notices` | Filtro de prioridade `P3` sobre aviso de cooperativa. |
| Venda coletiva | `/collective-sales` | Listagem de coletiva e disponibilidade de relatorios JSON/PDF. |

## Negativos

| Cenario | Alvo | Resultado esperado |
| --- | --- | --- |
| `worker-web-login-denied` | Worker acessando `/materials` | Redirect para `/login?reason=web-role-denied` e cookie limpo pelo proxy. |
| Sessao ausente | Visitante acessando `/materials` | Redirect para `/login`. |
| `manager-horizonte-worker-leste-denied` | Gerente Horizonte lendo trabalhador fora da cooperativa | Validado por `tests/auth-rbac.test.ts` e contratos `determineTargetWorker`/`determineTargetCooperative`, sem mock de endpoint. |

## Regressao visual

O runner captura desktop `1366x900` e mobile `390x844` para todas as rotas da matriz. A validacao falha quando encontra:

- corpo vazio;
- overflow horizontal;
- erro ou warning no console;
- request com falha;
- resposta HTTP `>=400` inesperada nas rotas mockadas;
- negativo ou relatorio fora do status esperado.

## Sweep de invariantes

Escopo: `task_cluster` S5-02, cobrindo rotas gerenciais migradas, RBAC/proxy, relatorios, generated files e paridade local.

| Eixo | Invariante | Evidencia | Resultado |
| --- | --- | --- | --- |
| Scoping e isolamento | Jornada gerencial nao deve revelar dados fora da cooperativa. | `tests/auth-rbac.test.ts` cobre `determineTargetWorker`, `determineTargetCooperative` e bloqueios proxy sem depender de resposta mockada. | PASS |
| RBAC e paginas | Worker nao deve acessar paginas gerenciais. | `src/proxy.ts` mantem `MANAGER_PAGE_PATHS`; runner exige `/login?reason=web-role-denied`; `tests/auth-rbac.test.ts` cobre todas as paginas gerenciais. | PASS |
| Schema/API types | Rotas usadas pelo frontend continuam tipadas/buildaveis. | `npm run quality` passou typecheck, unit tests, Prisma validate e build. | PASS |
| Browser/regressao visual | Rotas desktop/mobile nao devem gerar console inesperado, falha de rede, HTTP inesperado, corpo vazio ou overflow horizontal. | `s5-02-uat-evidence.json` registra 18 rotas sem console/network/http/overflow/body vazio. | PASS |
| Relatorios | Links JSON/PDF de venda coletiva devem responder em superficie gerencial e contratos reais devem preservar RBAC/scoping. | Runner valida JSON `200`, PDF `200 application/pdf` com magic bytes `%PDF`; `tests/reports-sales-s304-api.test.ts` e `tests/reports-sales-s305-api.test.ts` validam rotas reais por contrato. | PASS |
| Generated files | Dev server nao deve deixar `next-env.d.ts` em modo `.next/dev`. | Arquivo restaurado para `import "./.next/types/routes.d.ts";` apos o UAT. | PASS |
| Warnings e debt operacional | Warnings conhecidos nao devem bloquear a entrega, mas precisam ficar visiveis. | `npm run quality` passou com 4 warnings ESLint preexistentes fora do escopo S5-02. | ACCEPTED RISK |

## Resultado

Executado em `2026-05-17` contra `http://localhost:3106`.

Resumo do arquivo `output/playwright/s5-02/s5-02-uat-evidence.json`:

| Metrica | Resultado |
| --- | --- |
| Rotas verificadas | 18 (`9` desktop + `9` mobile) |
| Screenshots | 18 arquivos em `output/playwright/s5-02/` |
| Console inesperado nas rotas | 0 |
| Falhas de rede nas rotas | 0 |
| HTTP inesperado nas rotas | 0 |
| Overflow horizontal | 0 |
| Negativos | PASS: sem sessao -> `/login`; worker -> `/login?reason=web-role-denied`; backend contracts PASS para RBAC/scoping/report routes |
| Relatorios | PASS: JSON `200`; PDF `200 application/pdf`; magic bytes `%PDF` |
| Backend contracts | PASS: `tests/auth-rbac.test.ts`, `tests/reports-sales-s304-api.test.ts`, `tests/reports-sales-s305-api.test.ts` |
| Status final do runner | PASS |

Observacao: o runner nao usa fallback permissivo para APIs. Endpoints ou metodos nao declarados na allowlist geram `599 UNHANDLED_MOCKED_API_REQUEST` e entram em `summary.httpFailures`, derrubando o PASS.
