# Deprecacao do network_management_system

Task ClickUp: `86e1c9ezk` (`[S5-07] Checklist de deprecacao do network_management_system e paridade final`).

Data: 2026-05-17.

Repositorios:

- Legado Java, somente leitura para esta task: `/Users/cammis/Repositorio/UNB/DMS/Web/network_management_system`
- App canonico Next: `/Users/cammis/Repositorio/UNB/DMS/Web/DMS_NextJS_MGM`

## Resultado executivo

O `DMS_NextJS_MGM` e o alvo canonico para operacao. O `network_management_system` deve ser tratado como referencia historica e congelado, nao como fonte ativa de novas alteracoes.

Status de deprecacao: **GO condicional para freeze operacional, NO-GO para desligamento definitivo ate S5-03 e S5-04**.

Motivo:

- S5-02 ja validou UAT integrado, regressao visual e contratos RBAC/report por `scripts/run-s5-02-uat.mjs`.
- S5-07 fecha a matriz de paridade funcional e a checklist de deprecacao.
- S5-03 ainda precisa revisar seguranca, performance e concorrencia antes de executar desligamento real do legado.
- S5-04 ainda precisa consolidar runbook final de migracao, operacao e handoff.

Regra operacional: nao apagar, arquivar ou reescrever o repo Java nesta task. A acao segura agora e congelar writes e documentar o caminho de desligamento.

## Fontes verificadas

| Fonte | Evidencia |
| --- | --- |
| API legada | `../network_management_system/Managers_vault/API/API Reference.md` e controllers `src/main/java/dk/aau/network_management_system/**/*Controller.java` |
| Gaps legados | `../network_management_system/Managers_vault/Planning/Known Gaps and Follow-ups.md` |
| Inventario original | `Web_vault/Planejamento/Inventario-portabilidade-java-next.md` |
| Schema e migrations Next | `prisma/schema.prisma`, `prisma/migrations/*` |
| Rotas Next | `src/app/api/**/route.ts` |
| Jornadas browser | `Web_vault/Operacao/UAT-S5-02.md`, `output/playwright/s5-02/s5-02-uat-evidence.json` |
| Contratos automatizados | `tests/**/*.test.ts`, especialmente auth/RBAC, estoque, vendas, coletivas, reports, notices, gamificacao e UAT |

## Matriz de paridade final

| Dominio legado | Status Next | Evidencia Next | Decisao de deprecacao |
| --- | --- | --- | --- |
| Auth/RBAC `POST /api/auth/login`, roles `A/M/W` e escopo por cooperativa | Portado e endurecido | `src/app/api/auth/login/route.ts`, `src/proxy.ts`, `src/lib/auth/*`, `tests/auth-rbac.test.ts` | Usar Next. Rejeitar token via query string legado; aceitar cookie `auth_token`/server session e matriz RBAC. |
| Cooperativas e compradores | Portado/adaptado | `src/app/api/cooperatives/route.ts`, `src/app/api/buyers/route.ts`, alias `src/app/api/sales/buyers/route.ts`, `tests/buyers-materials-api.test.ts` | Usar `/api/buyers` como rota canonica; manter alias de vendas enquanto UI exigir. |
| Analytics e dashboard | Portado/adaptado | `/api/revenue`, `/api/cooperative/materials`, `/api/cooperative/lastsales`, `/api/stock`, `/api/worker-productivity`, `tests/analytics-parity.test.ts`, `tests/dashboard-s501-ui.test.ts` | Usar contratos Next com vendas `SOLD` como fonte de receita e estoque escopado por cooperativa. |
| Pesagem, bag state e estoque manual | Portado com melhoria de concorrencia | `src/app/api/insertMaterial/route.ts`, `src/app/api/stock/route.ts`, `src/lib/stock/ledger.ts`, `tests/material-stock-api.test.ts`, `tests/stock-ledger.test.ts` | Usar Next. `POST /api/insertMaterial` preserva contrato operacional worker/dispositivo; `POST /api/stock` e incremento manual auditavel por logs. |
| Venda normal lifecycle | Portado | `src/app/api/sales/route.ts`, `src/app/api/sales/[id]/complete/route.ts`, `src/app/api/sales/[id]/cancel/route.ts`, `tests/sale-lifecycle.test.ts` | Usar Next. `POST /api/sales` cria `ACTIVE`; `PATCH /complete` baixa estoque; `PATCH /cancel` cancela; `DELETE` destrutivo retorna `405`. |
| Venda coletiva | Portado com plural canonico | `src/app/api/collective-sales/**/route.ts`, `src/app/collective-sales/page.tsx`, `tests/collective-sales-*.test.ts` | Usar `/api/collective-sales`. O singular Java `/api/collective-sale` fica apenas como referencia historica. |
| Completion coletiva existente no Java | Portado/adaptado | Java: `PATCH /api/collective-sale/{saleId}/complete`; Next: `POST /api/collective-sales/[id]/complete`, `tests/collective-sales-s303-api.test.ts` | Usar contrato Next plural. Ele preserva a conclusao coletiva e explicita resposta, idempotencia, locks de estoque e `revenue_share`. |
| Reports JSON/PDF | Portado | `src/app/api/reports/sales/**`, `src/app/api/reports/pdf/**`, `src/lib/reports/pdf.tsx`, `tests/reports-sales-s304-api.test.ts`, `tests/reports-sales-s305-api.test.ts` | Usar Next. PDF deve manter `application/pdf`, `%PDF` e `Cache-Control: no-store`. |
| Notices | Portado com sanitizacao server-side | `src/app/api/notices/**`, `src/app/notices/page.tsx`, `src/lib/notices/sanitize.ts`, `tests/notices-s401-api.test.ts`, `tests/notices-s402-ui.test.ts` | Usar Next. Conteudo HTML limitado e filtrado; escopo global/cooperativa mantido. |
| Multipliers e random multiplier | Portado | `src/app/api/multipliers/**`, `src/app/api/jobs/random-multiplier/route.ts`, `tests/multipliers.test.ts`, `tests/jobs-runtime.test.ts` | Usar Next atras de `DMS_FEATURE_GAMIFICATION` e job secret. |
| Achievements, levels e leaderboard | Portado | `src/app/api/achievements/**`, `src/app/api/levels/**`, `src/app/api/leaderboard/**`, `src/app/api/jobs/achievement-evaluation/route.ts`, `src/app/api/jobs/leaderboard-snapshot-*`, `tests/achievements-s403-api.test.ts`, `tests/levels-s404-api.test.ts`, `tests/leaderboard-s405-api.test.ts`, `tests/gamification-s406-ui.test.ts` | Usar Next atras de feature flag; jobs externos curtos conforme ADR-0004. |
| Browser routes Java `/frontend`, `/normal-sale`, `/collective-sale` | Substituido | `/`, `/sales`, `/collective-sales`, `/materials`, `/manage-workers`, `/worker-productivity`, `/profile`, `/notices`, `/gamification`, S5-02 screenshots | Usar App Router Next; nenhuma rota Thymeleaf deve ser mantida como destino de usuario. |
| Banco e migrations | Portado/aditivo | `prisma/migrations/00000000000000_baseline`, S1-01, S1-02, S1-03; `Web_vault/ADR/ADR-0001-*` | Usar Prisma Migrate. Nao criar dual-write nem renomear tabelas legadas nesta reforma. |
| Observabilidade e debug | Portado com guard | `src/lib/observability/logger.ts`, `src/lib/debug-routes.ts`, `tests/observability.test.ts` | Debug em producao permanece bloqueado salvo `DMS_DEBUG_ENDPOINTS_ENABLED=true` e aprovacao operacional. |

## Classificacao de endpoints Java

Antes do freeze, qualquer cliente externo do legado deve ser reconciliado contra esta tabela. Rotas marcadas como **substituir** ou **retirar** nao devem ser assumidas como compativeis por path/metodo.

| Java legado | Decisao Next | Observacao de compatibilidade |
| --- | --- | --- |
| `POST /api/auth/login` | manter em `POST /api/auth/login` | Payload autenticado por CPF/senha; Next rejeita JWT via query string. |
| `GET /api/cooperatives` | manter em `GET /api/cooperatives` | Manager recebe apenas a propria cooperativa. |
| `GET /api/buyers` | manter em `GET /api/buyers` | `/api/sales/buyers` permanece alias legado interno. |
| `GET /api/performance` | substituir por dashboard Next | Usar combinacao de `/api/stock`, `/api/worker-collections`, `/api/revenue` e cards da rota `/`. Integracao externa 1:1 exige adapter antes do desligamento. |
| `GET /api/productivity` | substituir por `/api/worker-productivity` e `/api/worker-collections` | Drill-down por trabalhador fica em `/api/worker-productivity`; agregado gerencial fica em `/api/worker-collections`. |
| `GET /api/revenue` | manter em `GET /api/revenue` | Contrato Next usa vendas `SOLD` e escopo por cooperativa. |
| `GET /api/cooperative/materials` | manter em `GET /api/cooperative/materials` | Next adiciona metadados de paginacao/truncamento para a UX de materiais. |
| `GET /api/cooperative/lastsales/all` | retirar/substituir | Usar `/api/cooperative/lastsales` com escopo explicito por cooperativa, ou analytics do dashboard. |
| `GET /api/cooperative/lastsales` | manter em `GET /api/cooperative/lastsales` | Admin informa cooperativa; manager fica limitado a propria cooperativa. |
| `GET /api/getLast5Sales` | retirar | Substituido por `/api/cooperative/lastsales`; nao preservar endpoint raw sem escopo. |
| `GET /api/stock` | manter em `GET /api/stock` | Escopo por cooperativa no servidor. |
| `POST /api/stock` | manter em `POST /api/stock` | Incremento manual positivo; ajustes negativos/absolutos ficam fora do contrato atual. |
| `POST /api/insertMaterial` | manter em `POST /api/insertMaterial` | Preserva pesagem acumulada com `material_bag_state`. |
| `GET /api/sales/history` | substituir | Usar `GET /api/sales?status=HISTORY` para normal e `GET /api/collective-sales?status=SOLD` ou `CANCELLED` para coletiva. |
| `GET /api/sales/active` | substituir | Usar `GET /api/sales?status=ACTIVE` e `GET /api/collective-sales?status=ACTIVE`. |
| `GET /api/sales` | manter/adaptar em `GET /api/sales` | Status `HISTORY` no Next representa vendas normais `SOLD`. |
| `POST /api/sales` | manter em `POST /api/sales` | Cria `ACTIVE`; baixa estoque apenas em `/complete`. |
| `PUT /api/sales/{saleId}` | manter em `PUT /api/sales/[id]` | Apenas vendas `ACTIVE`; material imutavel. |
| `PATCH /api/sales/{saleId}/complete` | manter em `PATCH /api/sales/[id]/complete` | Idempotente para `SOLD`. |
| `PATCH /api/sales/{saleId}/cancel` | manter em `PATCH /api/sales/[id]/cancel` | Idempotente para `CANCELLED`. |
| `GET /api/collective-sale` | substituir por `GET /api/collective-sales` | Path plural canonico no Next. |
| `GET /api/collective-sale/invitations` | substituir por `GET /api/collective-sales/invitations` | Path plural canonico no Next. |
| `POST /api/collective-sale` | substituir por `POST /api/collective-sales` | Path plural canonico no Next. |
| `POST /api/collective-sale/{saleId}/invite` | substituir por `POST /api/collective-sales/[id]/invite` | Path plural canonico no Next. |
| `POST /api/collective-sale/{saleId}/join` | substituir por `POST /api/collective-sales/[id]/join` | Path plural canonico no Next. |
| `PUT /api/collective-sale/{saleId}/contribution` | substituir por `PATCH /api/collective-sales/[id]/contribution` | Metodo mudou de `PUT` para `PATCH`. |
| `PUT /api/collective-sale/{saleId}/material` | substituir por `PATCH /api/collective-sales/[id]` | Material/preco compartilham rota de patch no Next. |
| `PUT /api/collective-sale/{saleId}/price` | substituir por `PATCH /api/collective-sales/[id]` | Material/preco compartilham rota de patch no Next. |
| `DELETE /api/collective-sale/{saleId}/leave` | substituir por `POST /api/collective-sales/[id]/leave` | Metodo mudou para evitar semantica destrutiva ambigua. |
| `GET /api/collective-sale/my` | substituir por `GET /api/collective-sales?status=...` | A listagem Next ja filtra creator/participante para manager. |
| `DELETE /api/collective-sale/{saleId}` | substituir por `POST /api/collective-sales/[id]/cancel` | Cancelamento explicito, sem DELETE destrutivo. |
| `PATCH /api/collective-sale/{saleId}/complete` | substituir por `POST /api/collective-sales/[id]/complete` | Completion existia no Java; Next adapta path/metodo e resposta. |
| `GET /api/reports/sales/normal/{saleId}` | manter em `/api/reports/sales/normal/[saleId]` | Escopo por cooperativa mantido. |
| `GET /api/reports/sales/collective/{saleId}` | manter em `/api/reports/sales/collective/[saleId]` | Manager precisa ser creator ou participante aceito. |
| `GET /api/reports/pdf/normal-sale/{saleId}` | manter em `/api/reports/pdf/normal-sale/[saleId]` | PDF Next usa headers e filename sanitizados. |
| `GET /api/reports/pdf/collective-sale/{saleId}` | manter em `/api/reports/pdf/collective-sale/[saleId]` | PDF Next usa headers e filename sanitizados. |
| `GET /api/notices` | manter em `GET /api/notices` | Sanitizacao server-side aplicada em writes. |
| `GET /api/notices/global` | manter em `GET /api/notices/global` | Admin only. |
| `GET /api/notices/{noticeId}` | manter em `GET /api/notices/[id]` | Escopo global/cooperativa/admin. |
| `GET /api/notices/filter` | manter em `GET /api/notices/filter` | Filtro por prioridade. |
| `POST /api/notices` | manter em `POST /api/notices` | Sanitiza titulo/conteudo. |
| `PUT /api/notices/{noticeId}` | substituir por `PATCH /api/notices/[id]` | Metodo Next aceita update parcial. |
| `DELETE /api/notices/{noticeId}` | manter em `DELETE /api/notices/[id]` | Escopo de escrita preservado. |
| `POST /api/multipliers` | manter em `POST /api/multipliers` | Atras de feature flag quando aplicavel. |
| `GET /api/multipliers` | manter em `GET /api/multipliers` | Default `1.0` quando ausente. |
| `GET /api/multipliers/single` | manter em `GET /api/multipliers/single` | Busca por cooperativa/material. |
| `GET /api/achievements` | manter em `GET /api/achievements` | XP efetivo com override por cooperativa. |
| `PATCH /api/achievements/{achievementId}/xp` | manter em `PATCH /api/achievements/[achievementId]/xp` | Manager/admin. |
| `GET /api/achievements/workers/{workerId}/month` | manter em `GET /api/achievements/workers/[workerId]/month` | Worker forced self. |
| `GET /api/achievements/workers/{workerId}/top-month` | manter em `GET /api/achievements/workers/[workerId]/top-month` | Worker forced self. |
| `GET /api/achievements/workers/{workerId}/top-day` | manter em `GET /api/achievements/workers/[workerId]/top-day` | Worker forced self. |
| `GET /api/levels` | manter em `GET /api/levels` | Definicoes seedadas. |
| `GET /api/levels/worker/{workerId}` | manter em `GET /api/levels/worker/[workerId]` | Worker forced self. |
| `GET /api/leaderboard` | manter em `GET /api/leaderboard` | Snapshot atual por cooperativa. |
| `GET /api/leaderboard/history` | manter em `GET /api/leaderboard/history` | `yearMonth` e `weekNumber` obrigatorios. |

## Diferencas aceitas

| Diferenca | Decisao |
| --- | --- |
| Java aceitava JWT via `?token=` | Rejeitado por seguranca. Query tokens vazam em historico/log/referrer. |
| Java usava singular `/api/collective-sale` | Next usa plural `/api/collective-sales`, alinhado ao App Router e a tela `/collective-sales`. |
| Java usava `PATCH /api/collective-sale/{saleId}/complete` para completion coletiva | Next preserva a capacidade em `POST /api/collective-sales/[id]/complete`, com path plural, resposta estruturada e idempotencia explicita. |
| Java possuia frontend Thymeleaf/static tester | Substituido por telas Next versionadas e UAT Playwright. |
| Java continha secrets/config em `application.properties` | Next exige env e guards de segredo; S5-03 ainda revisa superficie final. |
| Nomes fisicos mistos no banco | Aceito pela ADR-0001 para evitar migracao destrutiva; limpeza de casing e epic futuro. |
| S5-02 usou API mockada no browser | Aceito para regressao UI; contratos backend reais foram rodados por testes. Banco real de cutover ainda exige S5-04. |

## Checklist de freeze do legado

| Item | Status S5-07 | Evidencia/acao |
| --- | --- | --- |
| Branch Next da task criada | Feito | `codex/86e1c9ezk-s5-07-deprecation-parity` |
| Repo Java mantido somente leitura | Feito | Nenhuma edicao deve ser feita em `../network_management_system` |
| Matriz Java -> Next revisada | Feito | Este documento e `tests/deprecation-parity-s507.test.ts` |
| Rotas coletivas Next documentadas como canonicas | Feito | `Web_vault/API/Vendas-e-estoque.md`, `Web_vault/API/Rotas.md` |
| UAT integrado disponivel | Feito | `Web_vault/Operacao/UAT-S5-02.md` |
| Security/performance/concurrency sweep | Pendente | S5-03 e blocker para desligamento definitivo |
| Runbook final de operacao/cutover | Pendente | S5-04 e blocker para handoff final |
| Status ClickUp final desta task | Pendente ate QA | So mudar para `Completo e aprovado` apos peer review, QA PASS, commit local e releitura do ClickUp |

## Checklist de desligamento futuro

Executar apenas depois de S5-03 e S5-04:

1. Confirmar que `npm run quality` passa no branch de release.
2. Confirmar `npx tsx --test tests/deprecation-parity-s507.test.ts` passa.
3. Rodar `npm audit --audit-level=high --json` e registrar 0 high/critical.
4. Rodar `npx @google/design.md lint .tony/design.md`.
5. Em staging descartavel, aplicar:

```bash
npx prisma migrate deploy
npx prisma migrate status
npm run db:seed:uat
```

6. Restaurar backup antes de tocar producao:

```bash
pg_dump "$PG_TOOLS_URL" --schema=public --format=custom --file backup-before-java-deprecation.dump
pg_restore --dbname="$RESTORE_CHECK_URL" --clean --if-exists backup-before-java-deprecation.dump
```

7. Rodar UAT integrado:

```bash
npm run dev -- --port 3106
NODE_PATH=/tmp/codex-playwright-s505/node_modules DMS_UAT_BASE_URL=http://localhost:3106 node scripts/run-s5-02-uat.mjs
```

8. Congelar deploys do Java e remover credenciais ativas do runtime legado.
9. Confirmar que nenhuma integracao externa ainda chama endpoints Java retirados/substituidos, incluindo `/api/collective-sale`, `/api/sales/history`, `/api/sales/active`, `/api/performance`, `/api/productivity`, `/api/cooperative/lastsales/all`, `/api/getLast5Sales`, `/frontend`, `/normal-sale`, `/collective-sale` ou templates Java.
10. Manter backup e tag/commit de referencia do Java por auditoria; nao apagar historico.

Regra Tony: nao executar `git push` durante este loop.

## Stop conditions

Nao concluir deprecacao definitiva se qualquer item abaixo ocorrer:

- S5-03 encontrar vulnerabilidade, degradacao de performance ou risco de concorrencia sem mitigacao.
- S5-04 nao tiver runbook aprovado para cutover, rollback e suporte.
- `npm run quality` falhar.
- S5-02 UAT nao puder ser reproduzido em staging ou equivalente.
- `npx prisma migrate status` indicar drift ou migrations pendentes nao explicadas.
- Integracao externa ainda depender de rotas Java sem proxy/compatibilidade planejada.
