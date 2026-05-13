# Setup local

## Pre-requisitos

- Node.js compatível com Next.js 16.
- npm.
- PostgreSQL acessivel via `DATABASE_URL`.
- Variavel `JWT_SECRET` definida; em producao ela e obrigatoria e o app falha se estiver ausente.

## Instalacao

1. Instalar dependencias:

```bash
npm install
```

2. Criar `.env.local` com base em `env.example`.

3. Garantir que o banco PostgreSQL tenha o schema compativel com `prisma/schema.prisma`.

4. Opcionalmente popular dados locais com o seed:

```bash
npx prisma db seed
```

## Variaveis

| Variavel | Obrigatoria | Uso |
| --- | --- | --- |
| `DATABASE_URL` | Sim | String de conexao PostgreSQL usada pelo Prisma |
| `JWT_SECRET` | Sim | Assinatura/verificacao de JWT; em producao precisa ter 32+ caracteres |
| `DMS_JOB_RUNNER` | Nao | Runner de jobs: `disabled`, `railway-cron`, `http-cron` ou `manual` |
| `DMS_JOB_SECRET` | Nao | Segredo bearer para endpoints/jobs internos; 32+ caracteres em producao |
| `CRON_SECRET` | Nao | Fallback de segredo para providers como Vercel Cron |
| `DMS_FEATURE_COLLECTIVE_SALES` | Nao | Flag opt-in para vendas coletivas |
| `DMS_FEATURE_GAMIFICATION` | Nao | Flag opt-in para multipliers, achievements, levels e leaderboard |
| `DMS_FEATURE_NOTICES` | Nao | Flag opt-in para mural de avisos |
| `DMS_FEATURE_REPORTS` | Nao | Flag opt-in para reports novos |
| `MONGODB_URI` | Nao | Comentada como legado no `env.example` |
| `MONGODB_DB` | Nao | Comentada como legado no `env.example` |
| `NODE_ENV` | Nao | Controla cookie `secure` e bloqueia debug create-test-user em producao |

## Comandos do projeto

| Comando | Estado observado | Observacao |
| --- | --- | --- |
| `npm run dev` | Nao executado nesta documentacao | Executa `next dev --turbopack` |
| `npm run build` | OK | Compila e gera 36 paginas/rotas; mostra aviso de middleware deprecated |
| `npm run start` | Nao executado nesta documentacao | Requer build previo |
| `npm run lint` | OK | Usa `eslint .` |
| `npm run typecheck` | OK | Usa `tsc --noEmit --incremental false` |
| `npm test` | OK | Descobre `tests/**/*.test.ts(x)` e executa via Node/tsx |
| `npm run prisma:validate` | OK | Valida schema Prisma com `DATABASE_URL` real ou placeholder |
| `npm run check:whitespace` | OK | Varre arquivos de texto tracked e untracked |
| `npm run quality` | OK | Gate completo local |
| `npm audit --json` | Falha por vulnerabilidades | 12 vulnerabilidades: 3 moderadas, 9 altas |

## Banco

- ORM: Prisma Client.
- Schema: `prisma/schema.prisma`.
- Config: `prisma.config.ts`.
- SQL de referencia: `New_db_schema.sql`.
- Seed: `prisma/seed.ts`.
- O seed usa `TRUNCATE ... RESTART IDENTITY CASCADE`, entao apaga dados existentes.

## Login local com seed

Contas criadas pelo seed:

| Perfil | CPF | Senha | Tipo |
| --- | --- | --- | --- |
| Gerente | `12345678901` | `manager123` | `0` |
| Catador | `98765432100` | `worker123` | `1` |

Somente gerentes acessam o dashboard pelo login atual.
