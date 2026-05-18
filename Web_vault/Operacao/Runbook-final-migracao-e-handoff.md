# Runbook final de migracao e handoff

Task ClickUp: `86e136cma` (`[S5-04] Runbook, documentacao e vault final da migracao`).

Data: 2026-05-17.

Este runbook consolida o caminho operacional para migrar a operacao do legado Java `network_management_system` para o app canonico `DMS_NextJS_MGM`. Ele nao executa cutover por si so; ele define preflight, evidencias, comandos, stop conditions, rollback e handoff para uma janela controlada.

Regra Tony: nao executar `git push` durante o loop Tony. Push, deploy real e cutover de producao exigem comando humano explicito fora deste loop.

## Escopo

Inclui:

- Confirmar que S5-02, S5-03 e S5-07 estao aprovadas antes do cutover.
- Rodar validacoes locais, staging e release candidate.
- Aplicar migrations Prisma com backup verificavel.
- Reproduzir UAT integrado S5-02 em staging ou ambiente equivalente.
- Congelar writes do Java e transferir operacao para o Next.
- Definir rollback, suporte e pacote de evidencias.

Fora de escopo:

- Apagar historico Git do repo Java.
- Reescrever endpoints para compatibilidade 1:1 que a matriz S5-07 classificou como `substituir` ou `retirar`.
- Criar dual-write entre Java e Next.
- Rodar seed UAT em banco de producao.

## Repositorios

| Papel | Caminho |
| --- | --- |
| Legado Java, somente leitura | `/Users/cammis/Repositorio/UNB/DMS/Web/network_management_system` |
| App canonico Next | `/Users/cammis/Repositorio/UNB/DMS/Web/DMS_NextJS_MGM` |
| Vault operacional | `Web_vault` |

## Pre-requisitos de release

| Gate | Evidencia minima | Stop condition |
| --- | --- | --- |
| S5-02 QA integrado aprovado | [[Operacao/UAT-S5-02]] e `scripts/run-s5-02-uat.mjs` | UAT nao reproduzivel em staging |
| S5-03 seguranca/performance/concorrencia aprovado | [[Operacao/Revisao-S5-03-seguranca-performance-concorrencia]] | Vulnerabilidade ou corrida sem mitigacao |
| S5-07 paridade/deprecacao aprovado | [[Operacao/Deprecacao-network-management-system]] | Endpoint Java ativo sem decisao de substituicao |
| S5-04 runbook aprovado | Este documento, QA PASS, commit local e ClickUp `Completo e aprovado` | Runbook incompleto, QA sem commit ou status final nao confirmado |
| Owner de janela definido | Responsavel por release, banco, suporte e rollback | Sem responsavel para restauracao ou comunicacao |
| Integracoes externas reconciliadas | Lista de consumidores Java validada contra a matriz S5-07 | Consumidor ainda chamando rota Java retirada |

## Variaveis e segredos

| Variavel | Obrigatoria no cutover | Observacao |
| --- | --- | --- |
| `DATABASE_URL` | Sim | URL Prisma do banco alvo; usar usuario de app com permissoes esperadas. |
| `PG_TOOLS_URL` | Sim | URL sem `?schema=public` para `pg_dump`/`pg_restore`. |
| `RESTORE_CHECK_URL` | Sim | Banco descartavel para validar restore do backup antes de migrar producao. |
| `JWT_SECRET` | Sim | 32+ caracteres em producao. |
| `DMS_JOB_SECRET` ou `CRON_SECRET` | Sim se jobs ativos | 32+ caracteres; usado por jobs internos. |
| `DMS_FEATURE_COLLECTIVE_SALES` | Nao como kill switch global | Flag de migracao lida por `src/lib/jobs/config.ts`; nao bloqueia sozinha todas as rotas/UI coletivas atuais. |
| `DMS_FEATURE_NOTICES` | Nao como kill switch global | Flag de migracao lida por `src/lib/jobs/config.ts`; nao substitui RBAC, deploy controlado ou smoke da rota `/notices`. |
| `DMS_FEATURE_REPORTS` | Nao como kill switch global | Flag de migracao lida por `src/lib/jobs/config.ts`; reports atuais precisam ser validados por smoke real. |
| `DMS_FEATURE_GAMIFICATION` | Jobs/runtime | Flag server-side de jobs/runtime; exposicao UI de gamificacao usa `NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION*` e APIs atuais continuam protegidas por auth/RBAC. |
| `DMS_DEBUG_ENDPOINTS_ENABLED` | Nao por padrao | Usar em producao somente com aprovacao operacional. |
| `DMS_ALLOW_REMOTE_UAT_SEED` | Nao em producao | Permitido apenas em preview/staging descartavel. |

## Preflight local do branch de release

Executar a partir de `DMS_NextJS_MGM`:

```bash
npm run quality
npm audit --audit-level=high --json
npm audit --omit=dev --audit-level=high --json
npx --yes @google/design.md lint .tony/design.md
npx tsx --test tests/deprecation-parity-s507.test.ts tests/security-performance-concurrency-s503.test.ts tests/uat-s502-evidence.test.ts
```

Resultado esperado:

- `npm run quality` passa com lint, typecheck, testes, Prisma validate, contrato visual, build e whitespace.
- Audits retornam 0 vulnerabilidades high/critical.
- Contrato visual passa.
- Suites S5-02, S5-03 e S5-07 passam.

Se qualquer comando falhar, parar o cutover e registrar `BLOCKED: validation_environment_missing` ou `FAIL`, conforme a causa.

## Dry-run em staging descartavel

1. Configurar `DATABASE_URL`, `PG_TOOLS_URL`, `RESTORE_CHECK_URL`, `JWT_SECRET` e flags em ambiente descartavel.
2. Aplicar migrations:

```bash
npx prisma migrate deploy
npx prisma migrate status
npm run prisma:validate
```

3. Popular dados UAT apenas se o banco for descartavel:

```bash
npm run db:seed:uat
```

4. Rodar smoke de contagens:

```bash
node -e 'const {PrismaClient}=require("@prisma/client"); const p=new PrismaClient(); Promise.all([p.cooperative.count(), p.materials.count(), p.sales.count(), p.collectiveSale.count(), p.collectiveSaleContribution.count(), p.noticeBoard.count(), p.levelDefinition.count(), p.achievementDefinition.count(), p.leaderboardEntry.count(), p.stock.count()]).then(console.log).finally(()=>p.$disconnect())'
```

5. Subir app em porta isolada e reproduzir UAT S5-02:

```bash
npm run dev -- --port 3106
NODE_PATH=/tmp/codex-playwright-s505/node_modules DMS_UAT_BASE_URL=http://localhost:3106 node scripts/run-s5-02-uat.mjs
```

Importante: o runner S5-02 intercepta `**/api/**` com mocks para validar regressao visual, navegacao, estados de UI e contratos sinteticos. Ele nao prova que o banco/API real de staging esta saudavel sozinho.

6. Rodar smoke nao mockado contra staging ou ambiente equivalente:

```bash
export DMS_UAT_BASE_URL='https://staging.example.internal'
curl -fsS -c /tmp/dms-cookie.jar -H 'Content-Type: application/json' \
  -d '{"cpf":"00000000002","password":"uat-manager-123"}' \
  "$DMS_UAT_BASE_URL/api/auth/login"
curl -fsS -b /tmp/dms-cookie.jar "$DMS_UAT_BASE_URL/api/auth/session"
curl -fsS -b /tmp/dms-cookie.jar "$DMS_UAT_BASE_URL/api/stock"
curl -fsS -b /tmp/dms-cookie.jar "$DMS_UAT_BASE_URL/api/cooperative/materials"
curl -fsS -b /tmp/dms-cookie.jar "$DMS_UAT_BASE_URL/api/sales?status=ACTIVE"
curl -fsS -b /tmp/dms-cookie.jar "$DMS_UAT_BASE_URL/api/collective-sales?status=ACTIVE"
curl -fsS -b /tmp/dms-cookie.jar "$DMS_UAT_BASE_URL/api/reports/sales/collective/201"
curl -fsSI -b /tmp/dms-cookie.jar "$DMS_UAT_BASE_URL/api/reports/pdf/collective-sale/201"
```

Se os IDs `201` ou fixtures UAT nao existirem no staging escolhido, substituir por uma venda coletiva real de teste e registrar o ID usado no pacote de evidencias. Nao aceitar apenas UAT mockado como prova de cutover de banco.

7. Anexar evidencia:

- `output/playwright/s5-02/s5-02-uat-evidence.json`
- screenshots desktop/mobile geradas pelo runner
- log dos comandos de migration/status
- log do smoke nao mockado de APIs reais
- resultado de `npm run quality`

## Backup e restore check

Antes de qualquer migration em producao, gerar backup e validar restore em banco descartavel:

```bash
pg_dump "$PG_TOOLS_URL" --schema=public --format=custom --file backup-before-dms-cutover.dump
pg_restore --single-transaction --exit-on-error --dbname="$RESTORE_CHECK_URL" --clean --if-exists backup-before-dms-cutover.dump
```

Validar restore:

```bash
RESTORE_DATABASE_URL="$RESTORE_CHECK_URL" node -e 'const {PrismaClient}=require("@prisma/client"); const p=new PrismaClient({datasources:{db:{url:process.env.RESTORE_DATABASE_URL}}}); Promise.all([p.cooperative.count(), p.materials.count(), p.users.count(), p.workers.count(), p.stock.count()]).then(console.log).finally(()=>p.$disconnect())'
```

Stop conditions imediatas:

- `pg_dump` falha.
- `pg_restore` falha.
- Restore nao abre com Prisma.
- Contagens essenciais retornam erro ou divergencia inexplicada.

## Cutover de producao

1. Comunicar janela e congelar writes no legado Java.
2. Confirmar que nenhum consumidor externo ainda depende das rotas Java classificadas como `retirar` ou `substituir`.
3. Capturar versao/commit de referencia do Java e do Next.
4. Executar backup e restore check.
5. Aplicar migrations no banco alvo:

```bash
npx prisma migrate deploy
npx prisma migrate status
npm run prisma:validate
```

6. Subir o app Next com as variaveis finais.
7. Manter `DMS_DEBUG_ENDPOINTS_ENABLED=false`, salvo aprovacao registrada.
8. Registrar flags e gates efetivamente implementados antes de liberar trafego:

```bash
DMS_FEATURE_GAMIFICATION=true
NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION=true
NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION_UI=true
```

As flags `DMS_FEATURE_COLLECTIVE_SALES`, `DMS_FEATURE_NOTICES`, `DMS_FEATURE_REPORTS` e `DMS_FEATURE_GAMIFICATION` nao sao kill switches globais das rotas no codigo atual. Se um dominio precisar ficar fora do rollout, usar controle de trafego/deploy, remover navegacao publica quando existir flag UI, ou implementar e testar um gate explicito antes do cutover.

9. Rodar smoke manual e nao mockado minimo:

| Superficie | Verificacao |
| --- | --- |
| Login | Admin e manager autenticam; worker web fixture continua negado. |
| Dashboard | `/` carrega sem erro e respeita escopo de cooperativa. |
| Materiais/estoque | `/materials` mostra estoque e permite fluxo previsto para gerente. |
| Vendas | `/sales` lista normal/coletiva e reports continuam disponiveis. |
| Usuarios | `/manage-workers` nao expor PII em listagem. |
| Notices | `/notices` filtra prioridade e respeita permissoes. |
| Jobs | Endpoints internos exigem segredo e flags. |

10. Redirecionar trafego operacional para o Next.
11. Manter o Java em modo somente leitura para auditoria e rollback durante a janela acordada.

## Rollback

Acionar rollback se qualquer criterio abaixo ocorrer:

- `npx prisma migrate status` aponta drift ou migration pendente inesperada.
- UAT S5-02 falha em rota critica de UI ou o smoke nao mockado falha em login, dashboard, vendas, materiais, usuarios, reports ou RBAC.
- Auditoria high/critical aparece em `npm audit`.
- Erro de integridade em estoque/vendas/coletivas.
- Consumidor externo essencial ainda depende de endpoint Java retirado.

Procedimento:

1. Parar novas writes no Next.
2. Preservar logs, request ids, backup e dumps de evidencia.
3. Desabilitar flags do lote afetado ou remover trafego do Next.
4. Se ainda nao houve writes aceitas no Next apos o backup, restaurar backup validado:

```bash
pg_restore --single-transaction --exit-on-error --dbname="$PG_TOOLS_URL" --clean --if-exists backup-before-dms-cutover.dump
```

5. Se houve writes aceitas no Next, nao restaurar cegamente. Abrir incidente, comparar ledger de estoque/vendas e decidir entre forward fix ou reconciliacao manual.
6. Reativar Java somente como contingencia controlada se os dados ainda estiverem coerentes e a janela de freeze permitir.
7. Registrar follow-up no ClickUp e no improvement log.

## Handoff operacional

Pacote minimo para suporte:

- Link para este runbook e para [[Operacao/Deprecacao-network-management-system]].
- Commit Next usado no cutover.
- Hash/tag de referencia do Java congelado.
- Output de `npm run quality`.
- Output dos audits high.
- Output de `npx prisma migrate status`.
- Evidencia de backup e restore check.
- Evidencia UAT S5-02 e smoke nao mockado de APIs reais.
- Lista de flags habilitadas.
- Lista de gates reais implementados, diferenciando flags de jobs/runtime, flags UI e controle de trafego/deploy.
- Lista de integracoes externas reconciliadas.
- Responsaveis por banco, app, suporte e rollback.

Sinais de acompanhamento nas primeiras 24 horas:

- Taxa de login rejeitado.
- Erros 4xx/5xx por rota.
- Logs `auth.rejected`, jobs e writes de estoque.
- Divergencias de `Stock.currentStockKg`, `totalCollectedKg`, `totalSoldKg` e `reservedStockKg`.
- Falhas em PDF/report.
- Chamadas remanescentes para rotas Java.

## Decisao de deprecacao

Com este runbook aprovado, o legado Java pode sair do papel de sistema ativo e permanecer como referencia historica congelada. Desligamento definitivo de runtime, credenciais e acesso de usuarios so deve ocorrer depois de uma janela com:

- Backup restauravel confirmado.
- Migrations aplicadas sem drift.
- UAT S5-02 reproduzido em staging ou equivalente com smoke nao mockado complementar.
- Monitoramento inicial sem incidentes criticos.
- Confirmacao de que nenhuma integracao essencial chama rotas Java retiradas.
