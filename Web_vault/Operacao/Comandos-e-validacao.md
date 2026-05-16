# Comandos e validacao

## Scripts npm

| Script | Comando | Estado observado |
| --- | --- | --- |
| `dev` | `next dev --turbopack` | Declarado; nao executado nesta rodada |
| `build` | `next build` | Executado com sucesso |
| `db:seed:uat` | `tsx prisma/seed.ts` | Seed UAT local/preview descartavel com guard contra producao |
| `start` | `next start` | Declarado; requer build previo |
| `check:visual-contract` | `node scripts/check-visual-contract.mjs` | Executado com sucesso |
| `check:whitespace` | `node scripts/check-whitespace.mjs` | Executado com sucesso |
| `lint` | `eslint .` | Executado com sucesso |
| `prisma:validate` | `node scripts/prisma-validate.mjs` | Executado com sucesso |
| `quality` | `node scripts/check-quality.mjs` | Executado com sucesso |
| `typecheck` | `tsc --noEmit --incremental false` | Executado com sucesso |
| `test` | `node scripts/run-tests.mjs` | Executado com sucesso |

## Build

Comando:

```bash
npm run build
```

Resultado observado:

- Compilou com sucesso.
- Rodou TypeScript.
- Gerou paginas estaticas.
- Listou 36 rotas/paginas.
- Usa `src/proxy.ts` no padrao Next 16, sem alerta de convencao antiga.

Rotas estaticas observadas no build:

- `/`
- `/login`
- `/manage-workers`
- `/materials`
- `/profile`
- `/sales`
- `/worker-productivity`

Rotas dinamicas/server-rendered observadas:

- Todas as rotas em `/api/*`.

## Lint

Comando:

```bash
npm run lint
```

Resultado observado:

- Executou `eslint .`.
- Sem erros.
- Sem warnings.

Nota historica: o script antigo usava `next lint`, que nao funciona no Next 16.1.4 deste projeto.

## Gate completo

Comando:

```bash
npm run quality
```

Executa, em ordem:

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run prisma:validate`
5. `npm run check:visual-contract`
6. `npm run build`
7. `npm run check:whitespace`

O checker de whitespace varre arquivos de texto versionados e arquivos novos ainda nao rastreados, evitando o falso positivo de sucesso de `git diff --check` em CI limpo.

O mesmo gate esta definido em `.github/workflows/quality.yml` para `push` em `main` e pull requests.

## Typecheck

Ha script dedicado para evitar cache incremental no worktree.

Comando:

```bash
npm run typecheck
```

## Testes

Comando:

```bash
npm test
```

Resultado observado:

- 83 testes passaram.
- Cobre assinatura/verificacao JWT server-side.
- Cobre rejeicao de token adulterado e expirado no verificador Edge usado pelo proxy.
- Cobre que rotas `/api/*.json` continuam protegidas e nao sao tratadas como assets publicos.
- Cobre ausencia de fallback e rejeicao de `JWT_SECRET` fraco em producao.
- Cobre matriz RBAC e bloqueios de escopo admin/manager/worker.
- Cobre bloqueio de endpoints debug em producao sem `DMS_DEBUG_ENDPOINTS_ENABLED=true`.
- Cobre redacao de logs estruturados, contrato de erro API, `auth.rejected` com request id, guard de login anti-enumeracao/rate limit, mascara de documentos pessoais e eventos de lifecycle de jobs.
- Cobre checker de whitespace em CRLF e arquivos limpos.
- Cobre feature flags, segredo de job, bearer token interno e idempotencia de reexecucao.
- Cobre POC PDF com bytes `%PDF-`, headers de download, sanitizacao de filename e sanitizacao de notices contra XSS, incluindo `svg onload` e atributos perigosos em tag permitida.
- Cobre contratos S1-01 de schema/migration: lifecycle de `Sales`, unique/checks de `Stock`, `material_bag_state`, preflights de backfill e FKs para tabelas fisicas atuais.
- Cobre contratos S1-02 de schema/migration: `collective_sale`, `collective_sale_contribution`, FKs para tabelas fisicas atuais, checks de lifecycle/decimal/status, seed coletivo e bloqueio de exclusao de material usado por venda coletiva.
- Cobre contratos S1-03 de schema/migration: `notice_board`, multipliers, achievements, levels, leaderboard, FKs para tabelas fisicas atuais, FKs compostas de tenant, unique/check constraints, seeds idempotentes e fixtures UAT persistidas.
- Cobre helpers de lifecycle para bloquear mutacoes legadas de estoque em vendas `ACTIVE`/`CANCELLED`, analytics apenas sobre vendas `SOLD` e escopo direto por `Sales.cooperative_id`.
- Cobre S1-05: parser/RBAC de `/api/insertMaterial`, delta e reset de `material_bag_state`, rejeicao de leitura regressiva sem reset, JSON invalido como `400`, rejeicao de device fora de escopo, `STOCK_MISSING`, `POST /api/stock` criando/incrementando com `ON CONFLICT`, e contrato de `FOR UPDATE`.
- Cobre bloqueio de transferencia de cooperativa para usuarios com vendas, medicoes ou contribuicoes associadas.
- Cobre matriz de fixtures UAT gerenciais, documentos sinteticos, jornadas -> dados, estados de venda, vendas coletivas persistidas e guard contra seed em banco de producao/remoto por padrao.

## Prisma migrations

ADR vigente: [[ADR/ADR-0001-schema-prisma-baseline-rollback]].

Validar schema:

```bash
npm run prisma:validate
```

O script usa `DATABASE_URL` real quando definida. Sem env local, injeta uma URL placeholder para permitir `prisma validate` sem conexao com o banco. A configuracao do Prisma vive em `prisma.config.ts`, evitando o antigo `package.json#prisma`.

Aplicar migrations em banco limpo ou ambiente alvo:

```bash
export DATABASE_URL='postgresql://...'
npx prisma migrate deploy
npx prisma migrate status
```

Deploy Nixpacks tambem usa `npx prisma migrate deploy` antes de `npm start`.

Banco existente que ja possui o schema legado deve receber a baseline como aplicada antes das proximas migrations:

```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/dms-baseline-drift.sql
```

Gate executavel antes do `resolve`:

```bash
DRIFT_CONTENT="$(sed '/^$/d' /tmp/dms-baseline-drift.sql)"
if [ -n "$DRIFT_CONTENT" ] && [ "$DRIFT_CONTENT" != "-- This is an empty migration." ]; then
  echo "Drift detectado. Revisar /tmp/dms-baseline-drift.sql antes de marcar baseline."
  exit 1
fi
npx prisma migrate resolve --applied 00000000000000_baseline
```

O `migrate resolve` so deve rodar se esse gate passar ou se cada divergencia tiver sido revisada e aceita por escrito.

Backup/cutover deve usar URL de ferramentas PostgreSQL sem `?schema=public`:

```bash
export PG_TOOLS_URL='postgresql://app_user:secret@db-host:5432/dms'
pg_dump "$PG_TOOLS_URL" --schema=public --format=custom --file backup-before-dms-portability.dump
pg_restore --dbname="$RESTORE_CHECK_URL" --clean --if-exists backup-before-dms-portability.dump
```

Smoke minimo apos migration:

```bash
npm run db:seed:uat
node -e 'const {PrismaClient}=require("@prisma/client"); const p=new PrismaClient(); Promise.all([p.cooperative.count(), p.materials.count(), p.sales.count(), p.collectiveSale.count(), p.collectiveSaleContribution.count(), p.noticeBoard.count(), p.levelDefinition.count(), p.achievementDefinition.count(), p.leaderboardEntry.count(), p.stock.count()]).then(console.log).finally(()=>p.$disconnect())'
```

Migration S1-01 (`20260513224000_s1_01_core_sales_stock_bag_state`) e aditiva com backfill guardado. Antes de alterar o schema ela roda em transacao explicita, bloqueia writes em `Sales`, `Stock` e `Workers`, e aborta se encontrar duplicidade em `Stock` por cooperativa/material, totais negativos, vendas com peso/preco nao positivos, responsavel invalido ou vendas legadas sem representacao em `Stock.total_sold_kg`.

Runbook operacional S1-01: pausar writes da aplicacao durante `npx prisma migrate deploy`, aplicar a migration, rodar `npx prisma migrate status`, `npm run prisma:validate`, smoke de contagem e entao reabrir writes. Se a migration falhar depois de adquirir lock, manter writes pausados e usar restore completo ou forward rollback conforme [[ADR/ADR-0001-schema-prisma-baseline-rollback]].

Migration S1-02 (`20260513233000_s1_02_collective_sales`) e aditiva e cria `collective_sale` e `collective_sale_contribution`. Ela aborta se encontrar tabelas coletivas preexistentes, preserva as tabelas fisicas atuais como alvo de FK e adiciona checks de estado terminal, preco positivo, peso positivo, status permitido, convite sem peso/receita e receita apenas com peso positivo.

Runbook operacional S1-02: aplicar apos S1-01, rodar `npx prisma migrate deploy`, `npx prisma migrate status`, `npm run prisma:validate`, `npx prisma generate`, `npm test` e smoke de contagem incluindo `collectiveSale` e `collectiveSaleContribution`. APIs de contribuicao/reserva devem manter writes pausados ou feature flag desligada ate S3 portar as transacoes.

Validacao descartavel S1-02 observada em Postgres local `dms_uat`: `npx prisma migrate deploy` aplicou baseline, S1-01 e S1-02; `npm run db:seed:uat` concluiu; smoke Prisma retornou `cooperatives=3`, `collectiveSales=2`, `collectiveContributions=6`, com 3 contribuicoes por venda coletiva.

Migration S1-03 (`20260514001500_s1_03_notices_multipliers_gamification`) e aditiva e cria `notice_board`, `cooperative_material_multiplier`, `cooperative_random_multiplier`, `achievement_definition`, `achievement_xp_override`, `worker_achievement`, `leaderboard_snapshot`, `leaderboard_entry`, `level_definition` e `worker_level`. Ela aborta se encontrar tabelas alvo preexistentes, usa `pgcrypto` para UUIDs, preserva FKs para tabelas fisicas atuais (`Cooperative`, `Workers`, `Materials`), adiciona a superchave `Workers(Worker_id, Cooperative)` e usa FKs compostas para bloquear registros cross-coop em notice author, XP override updater, worker achievements e leaderboard entries. Tambem adiciona checks de prioridade, ranges de multipliers, categorias/dificuldades, `YYYY-MM`, semana/ranking, XP/progresso nao negativo e texto obrigatorio.

Runbook operacional S1-03: aplicar apos S1-02, rodar `npx prisma migrate deploy`, `npx prisma migrate status`, `npm run prisma:validate`, `npx prisma generate`, `npm run typecheck`, `npm test`, `npm run db:seed:uat` duas vezes no banco descartavel e smoke de contagens incluindo notices/gamificacao. Executar tambem inserts negativos cross-coop para `worker_achievement`, `leaderboard_entry`, `notice_board` e `achievement_xp_override`; todos devem falhar por FK composta. APIs/jobs/UI devem permanecer atras de feature flags ate S4/S5 portar as regras de dominio.

Validacao descartavel S1-03 observada em Postgres local `dms_uat` na porta `55433`: `npx prisma migrate deploy` aplicou baseline, S1-01, S1-02 e S1-03; `npm run db:seed:uat` concluiu duas vezes; smoke Prisma retornou `cooperatives=3`, `notices=3`, `levelDefinition=10`, `achievementDefinition=14`, `cooperativeMaterialMultiplier=3`, `cooperativeRandomMultiplier=3`, `achievementXpOverride=1`, `workerAchievement=2`, `workerLevel=2`, `leaderboardSnapshot=1`, `leaderboardEntry=2`; consulta de constraints confirmou `Workers_worker_cooperative_key`, `notice_board_created_by_cooperative_fkey`, `achievement_xp_override_updated_by_cooperative_fkey`, `worker_achievement_worker_cooperative_fkey`, `leaderboard_snapshot_snapshot_cooperative_key`, `leaderboard_entry_snapshot_cooperative_fkey` e `leaderboard_entry_worker_cooperative_fkey`. Inserts negativos cross-coop foram bloqueados por essas FKs compostas, incluindo worker achievement, leaderboard worker, leaderboard snapshot, notice author e XP override updater.

Runbook operacional S1-04: para helpers de estoque, rodar `npm run prisma:validate`, `npx prisma generate`, `npm run typecheck`, `npm test`, `npm run quality` e, quando houver Postgres local, um smoke descartavel aplicando migrations e exercitando `addToStock`, `recordSale` e `adjustStock` contra banco real.

Validacao descartavel S1-04 observada em Postgres local na porta `56554`: `npx prisma migrate deploy` aplicou baseline, S1-01, S1-02 e S1-03; smoke Prisma dos helpers retornou `added=10.00`, `soldCurrent=6.00`, `reservedCurrent=4.00`, `releasedCurrent=5.00`, `finalCurrent=5.00`, `finalSold=4.00`, `insufficient=true`, `overRelease=true`; smoke de `ON CONFLICT` em `addToStock` retornou `count=1`, `collected=3.75`, `current=3.75`.

Runbook operacional S1-05: para APIs de pesagem e estoque manual, rodar `npm run typecheck`, `npm test`, `npm run prisma:validate`, `npx prisma generate`, `npm run quality` e, quando houver Postgres local, smoke descartavel aplicando migrations e exercitando duas pesagens concorrentes no mesmo `material_bag_state` mais `addManualStock` criando linha ausente.

Validacao descartavel S1-05 observada em Postgres temporario na porta `56555`: `npx prisma migrate deploy` aplicou baseline, S1-01, S1-02 e S1-03; duas chamadas concorrentes de `recordMaterialWeighing` retornaram deltas `["0.00","2.00"]`; leitura regressiva sem reset foi rejeitada (`regressiveRejected=true`) sem alterar estado; `Stock.currentStockKg=12.00`, `Stock.totalCollectedKg=12.00`, `material_bag_state.currentKg=6.00`, medicoes `["2.00","0.00"]`; `addManualStock` criou linha ausente com `currentStockKg=3.75`.

## Audit

Comando:

```bash
npm audit --json
```

Resultado observado:

- `npm audit`: 0 vulnerabilidades.
- `npm audit --omit=dev`: 0 vulnerabilidades.

Observacao: o lockfile foi atualizado e `postcss` fica fixado via `overrides` para evitar uma dependencia transitiva vulneravel.

## Design contract

Comando:

```bash
npx --yes @google/design.md lint .tony/design.md
```

Resultado observado:

- Sem erros.
- Sem warnings.
- Apenas info: 15 cores, 5 escalas tipograficas, 5 raios, 7 espacamentos e 15 componentes.

## Contrato visual Web

Comando:

```bash
npm run check:visual-contract
```

Resultado observado:

- Passou nos arquivos frontend alterados.
- Passou na superficie canonica do contrato e nos arquivos frontend alterados.
- Bloqueia paleta vinho/verde legada, classes Tailwind cruas fora do contrato, letter-spacing local, gradientes radiais decorativos e sombras inline sem token.
- Ignora arquivos cujo diff tracked seja apenas whitespace, para permitir limpezas mecanicas sem exigir migracao visual de telas legadas inteiras.

## TOML de agentes

Comando usado:

```bash
npx --yes @taplo/cli check .codex/config.toml .codex/agents/*.toml
```

Resultado observado: OK.

## JSON Tony

Comando usado:

```bash
node -e "JSON.parse(require('fs').readFileSync('.tony/config.json','utf8'))"
```

Resultado observado: OK.
