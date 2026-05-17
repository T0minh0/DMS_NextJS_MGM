# ADR-0001: Schema Prisma, baseline migration e rollback

Status: aceito para execucao da reforma.

Data: 2026-04-27.

Task ClickUp: `86e136bqw` (`[S0-02] ADR schema Prisma, baseline migration e rollback`).

## Contexto

O `DMS_NextJS_MGM` usa Next.js App Router, Prisma e PostgreSQL. O schema atual do Prisma mapeia tabelas fisicas legadas com nomes capitalizados e colunas mistas:

- `"Cooperative"`, `"Devices"`, `"Groups"`, `"Materials"`, `"Buyers"`, `"Sales"`, `"Workers"`, `"Measurments"`, `"Stock"` e `"Worker_contributions"`.
- Campos Prisma em camelCase mapeiam para nomes SQL por `@map`/`@@map`.
- `WorkerContributions.period` depende de `daterange` PostgreSQL e fica como `Unsupported("daterange")`.
- Nao havia pasta `prisma/migrations` versionada antes desta ADR.

O repo Java `network_management_system` introduz `public.*` lower-case e novas tabelas: `notice_board`, `collective_sale`, `collective_sale_contribution`, `material_bag_state`, multipliers, achievements, leaderboard e levels. Ele tambem altera o lifecycle de `sales` para `created_at`, `sold_at`, `cancelled_at`, `cooperative_id` e `expected_sale_date`.

Sem uma decisao de schema, cada API nova poderia criar objetos contra um nome fisico diferente e gerar duplicacao de dados.

## Decisao

Adotar uma estrategia hibrida e incremental:

1. **Baselinear o schema atual como legado canonico.** A migration `prisma/migrations/00000000000000_baseline/migration.sql` representa o estado fisico atual esperado pelo app Next.
2. **Nao renomear tabelas existentes nesta reforma.** Os modelos atuais continuam usando os `@@map` existentes para preservar dados, seeds, queries e telas.
3. **Evoluir tabelas existentes por alteracoes aditivas.** Campos Java que pertencem a entidades ja existentes entram nas tabelas atuais com colunas novas em snake_case quando possivel, por exemplo `"Sales"."created_at"`, `"Sales"."sold_at"`, `"Sales"."cooperative_id"` e `"Sales"."expected_sale_date"`.
4. **Criar tabelas novas em lower-case snake_case.** Tabelas sem equivalente atual devem seguir a convencao Java/PostgreSQL sem quoted identifiers, por exemplo `collective_sale`, `notice_board`, `material_bag_state`, `leaderboard_snapshot`.
5. **Mapear tudo pelo Prisma, nao por SQL ad hoc.** Cada objeto novo deve ter modelo Prisma com `@@map`/`@map` explicito e relacoes apontando para as tabelas fisicas realmente existentes.
6. **Deploy deve usar Prisma Migrate.** `nixpacks.toml` passa a executar `npx prisma migrate deploy`, nao `npx prisma db push`.
7. **Views de compatibilidade ficam fora do caminho padrao.** Criar views lower-case para entidades antigas so se houver consumidor externo que precise do contrato Java SQL, nao para o app Next.

Essa decisao aceita um periodo de nomes fisicos mistos para evitar uma migracao destrutiva agora. A limpeza de casing pode virar um epic posterior, com janela de manutencao propria.

## Alternativas rejeitadas

| Alternativa | Motivo da rejeicao |
| --- | --- |
| Renomear tudo para lower-case agora | Alto risco de downtime, quebra de queries existentes, seeds, relacoes e rollback complexo sem ganho funcional imediato. |
| Duplicar tabelas atuais em lower-case | Criaria dual-write, divergencia de dados e relatorios inconsistentes. |
| Usar apenas `prisma db push` em producao | Nao gera historico revisavel, rollback concreto nem trilha de auditoria. |
| Criar views lower-case para todo objeto legado por padrao | Aumenta superficie de manutencao sem consumidor confirmado; pode mascarar divergencias de schema. |
| Migrar para um schema Prisma totalmente novo antes das APIs | Bloqueia a reforma inteira e mistura refactor estrutural com portabilidade funcional. |

## Impacto nas queries existentes

- `prisma.cooperative`, `prisma.workers`, `prisma.sales`, `prisma.stock`, `prisma.materials`, `prisma.buyers`, `prisma.measurments` e `prisma.workerContributions` continuam apontando para as mesmas tabelas.
- Raw SQL existente que cita tabelas capitalizadas, como `prisma/seed.ts` e `src/app/api/recalculate-contributions/route.ts`, continua valido.
- Novas APIs devem evitar assumir que `public.sales` lower-case existe. O alvo fisico de venda normal continua `"Sales"` ate uma ADR futura aprovar renomeacao.
- Novas tabelas lower-case devem ser sempre acessadas por modelos Prisma, com `@@map("nome_lower_case")`, para que o casing fisico nao vaze para componentes e rotas.

## Baseline migration

Arquivo criado:

```text
prisma/migrations/00000000000000_baseline/migration.sql
```

Comando usado para gerar a base:

```bash
DATABASE_URL='postgresql://user:pass@localhost:5432/dms?schema=public' \
  npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

Fluxo reproduzivel para banco limpo:

```bash
export DATABASE_URL='postgresql://dms_test:dms_test@localhost:55432/dms_schema_s0_02?schema=public'
npx prisma validate
npx prisma migrate deploy
npx prisma db seed
```

Fluxo para checar estado de migrations:

```bash
export DATABASE_URL='postgresql://...'
npx prisma migrate status
```

Resultado esperado apos `migrate deploy` em banco limpo: a migration baseline aparece aplicada em `_prisma_migrations` e as 10 tabelas legadas existem.

## Cutover

1. Congelar deploys que alterem schema.
2. Fazer backup logico do banco atual:

```bash
export DATABASE_URL='postgresql://app_user:secret@db-host:5432/dms?schema=public'
export PG_TOOLS_URL='postgresql://app_user:secret@db-host:5432/dms'
pg_dump "$PG_TOOLS_URL" --schema=public --format=custom --file backup-before-dms-portability.dump
```

`DATABASE_URL` do Prisma pode usar `?schema=public`; ferramentas libpq como `pg_dump` devem usar uma URL sem esse query param e receber `--schema=public` explicitamente.

3. Validar que o backup restaura em banco descartavel antes de tocar o alvo:

```bash
createdb "$RESTORE_CHECK_DB"
pg_restore --single-transaction --exit-on-error --dbname="$RESTORE_CHECK_URL" --clean --if-exists backup-before-dms-portability.dump
```

4. Executar `npx prisma migrate status` no ambiente alvo.
5. Antes de marcar a baseline, provar que o banco existente corresponde ao `schema.prisma` atual:

```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/dms-baseline-drift.sql
```

O arquivo `/tmp/dms-baseline-drift.sql` deve estar vazio, ou conter apenas o marcador Prisma `-- This is an empty migration.`, ou conter apenas diferencas revisadas e aceitas por escrito. Divergencias de tipo, constraint, FK, tabela ou coluna abortam o cutover ate virarem migration corretiva.

6. Se o banco ja contem o schema legado validado, marcar a baseline como aplicada sem recriar tabelas:

```bash
npx prisma migrate resolve --applied 00000000000000_baseline
```

7. Aplicar migrations aditivas futuras com:

```bash
npx prisma migrate deploy
```

8. Rodar `npx prisma migrate status` e smoke tests de leitura/escrita dos modelos core.
9. Liberar as APIs por feature flag ou deploy controlado.

## Rollback

Rollback de baseline:

- Em banco limpo de teste, descartar o banco e recriar.
- Em banco existente, nao desfazer a baseline manualmente; ela representa o estado anterior do app. Se ela foi marcada por engano, remover a linha correspondente de `_prisma_migrations` somente em banco descartavel.

Rollback de migrations aditivas futuras:

1. Pausar writes da aplicacao.
2. Fazer backup do estado com problema.
3. Reverter deploy de codigo.
4. Escolher uma das duas rotas suportadas:
   - **Restore completo:** restaurar o backup validado anterior ao deploy quando a migration causou corrupcao ou perda de dados.
   - **Forward rollback:** criar uma nova migration Prisma que desfaz semanticamente a mudanca e aplicar com `npx prisma migrate deploy`.
5. SQL emergencial manual so e permitido para incident response curto. Ele deve ser seguido por uma migration de reconciliacao ou por restore completo antes de reabrir writes.
6. Rodar `npx prisma migrate status`, `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script` e smoke tests antes de reabrir writes.

Regra: toda migration depois da baseline precisa declarar se e `additive-only`, `backfill`, `contract`, ou `destructive`. Migrations destrutivas exigem plano de rollback separado antes de peer review.

## Compatibilidade de dados

- IDs seguem `BigInt`.
- Pesos e valores financeiros seguem `Decimal` no Prisma e `numeric` no PostgreSQL.
- PII (`CPF`, `PIS`, `RG`, `Password`) continua como `bytea` ate ADR especifica de auth/RBAC.
- `Measurments` mantem a grafia legada no schema fisico e no modelo Prisma para nao quebrar o app atual.
- S1-01 adicionou unique `(Cooperative, Material)` em `Stock` antes das APIs transacionais de estoque.
- S1-01 adicionou lifecycle aditivo em `Sales`; S2-01 deve mudar a semantica de create/complete/cancel.

## Validacao de `material_bag_state`

O SQL Java assume FKs para `public.cooperative` e `public.materials`; no schema escolhido essas tabelas fisicas nao existem. A migration S1-01 corrige as FKs para os objetos atuais:

```sql
CREATE TABLE public.material_bag_state (
  bag_state_id BIGSERIAL PRIMARY KEY,
  cooperative_id BIGINT NOT NULL REFERENCES "Cooperative"(cooperative_id),
  material_id BIGINT NOT NULL REFERENCES "Materials"("Material_id"),
  is_begun BOOLEAN NOT NULL DEFAULT false,
  current_kg NUMERIC(10, 2) NOT NULL DEFAULT 0,
  last_updated TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (cooperative_id, material_id),
  CHECK (current_kg >= 0),
  CHECK (is_begun OR current_kg = 0)
);
```

Modelo Prisma esperado:

```prisma
model MaterialBagState {
  bagStateId   BigInt   @id @default(autoincrement()) @map("bag_state_id")
  cooperativeId BigInt  @map("cooperative_id")
  materialId    BigInt  @map("material_id")
  isBegun       Boolean @default(false) @map("is_begun")
  currentKg     Decimal @default(0) @map("current_kg") @db.Decimal(10, 2)
  lastUpdated   DateTime @default(now()) @map("last_updated")
  cooperative   Cooperative @relation(fields: [cooperativeId], references: [cooperativeId])
  material      Materials   @relation(fields: [materialId], references: [materialId])

  @@unique([cooperativeId, materialId])
  @@map("material_bag_state")
}
```

## Criterios para proximas migrations

- Usar `npx prisma migrate dev --name <nome>` em banco local descartavel para gerar SQL.
- Revisar SQL gerado antes de commit.
- Rodar `npx prisma validate`, `npx prisma migrate deploy` em banco limpo e smoke de modelos tocados.
- Documentar rollback quando houver backfill ou alteracao destrutiva.
- Atualizar o vault quando o schema mudar.

## Evidencias desta ADR

- `npx prisma validate` passou com `DATABASE_URL` descartavel.
- `prisma/migrations/00000000000000_baseline/migration.sql` foi gerado a partir do schema Prisma atual.
- Em PostgreSQL descartavel local na porta `56543`, `npx prisma migrate deploy` aplicou `00000000000000_baseline`.
- `npx prisma migrate status` retornou `Database schema is up to date!`.
- `npx prisma db seed` executou com sucesso.
- Smoke Prisma confirmou `coops=2`, `materials=3`, `sales=2`, `stock=2` e create/delete de `Buyers`.
- Preflight `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script` contra banco migrado retornou apenas `-- This is an empty migration.`.
- `pg_dump "$PG_TOOLS_URL" --schema=public --format=custom` e `pg_restore` em banco descartavel foram validados com URL libpq sem `?schema=public`.
- Aviso nao bloqueante observado: `package.json#prisma` esta deprecated para Prisma 7 e deve virar `prisma.config.ts` em task de tooling.
