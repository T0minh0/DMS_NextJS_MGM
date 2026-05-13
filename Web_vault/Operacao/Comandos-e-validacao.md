# Comandos e validacao

## Scripts npm

| Script | Comando | Estado observado |
| --- | --- | --- |
| `dev` | `next dev --turbopack` | Declarado; nao executado nesta rodada |
| `build` | `next build` | Executado com sucesso |
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
- Mostrou aviso: a convencao `middleware` esta deprecated e deve usar `proxy`.

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

- 22 testes passaram.
- Cobre assinatura/verificacao JWT server-side.
- Cobre rejeicao de token adulterado e expirado no verificador Edge usado pelo middleware.
- Cobre ausencia de fallback e rejeicao de `JWT_SECRET` fraco em producao.
- Cobre matriz RBAC e bloqueios de escopo admin/manager/worker.
- Cobre checker de whitespace em CRLF e arquivos limpos.
- Cobre feature flags, segredo de job, bearer token interno e idempotencia de reexecucao.
- Cobre POC PDF com bytes `%PDF-`, headers de download, sanitizacao de filename e sanitizacao de notices contra XSS, incluindo `svg onload` e atributos perigosos em tag permitida.

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
npx prisma db seed
node -e 'const {PrismaClient}=require("@prisma/client"); const p=new PrismaClient(); Promise.all([p.cooperative.count(), p.materials.count(), p.sales.count(), p.stock.count()]).then(console.log).finally(()=>p.$disconnect())'
```

## Audit

Comando:

```bash
npm audit --json
```

Resultado observado:

| Severidade | Quantidade |
| --- | --- |
| Moderada | 3 |
| Alta | 9 |
| Total | 12 |

Dependencias diretas afetadas:

- `next`
- `prisma`

Dependencias transientes afetadas incluem:

- `@prisma/config`
- `effect`
- `defu`
- `flatted`
- `minimatch`
- `picomatch`
- `postcss`
- `tar`
- `brace-expansion`
- `ajv`

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
