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
npm run db:seed:uat
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
| `DMS_DEBUG_ENDPOINTS_ENABLED` | Nao | Habilita `/api/debug/*` em producao somente para admin; nao habilita `create-test-user` |
| `DMS_TRUST_PROXY_HEADERS` | Nao | Quando `true`, login usa `cf-connecting-ip`, `x-real-ip` ou `x-forwarded-for` para bucket de rate limit; habilitar apenas atras de proxy confiavel que sobrescreva esses headers |
| `DMS_ALLOW_REMOTE_UAT_SEED` | Nao | Permite seed UAT em banco remoto descartavel; por padrao o seed roda apenas em hosts locais |
| `MONGODB_URI` | Nao | Comentada como legado no `env.example` |
| `MONGODB_DB` | Nao | Comentada como legado no `env.example` |
| `NODE_ENV` | Nao | Controla cookie `secure` e bloqueia endpoints debug em producao sem flag |

## Comandos do projeto

| Comando | Estado observado | Observacao |
| --- | --- | --- |
| `npm run dev` | Nao executado nesta documentacao | Executa `next dev --turbopack` |
| `npm run build` | OK | Compila e gera 36 paginas/rotas; usa `src/proxy.ts` no padrao Next 16 |
| `npm run start` | Nao executado nesta documentacao | Requer build previo |
| `npm run lint` | OK | Usa `eslint .` |
| `npm run typecheck` | OK | Usa `tsc --noEmit --incremental false` |
| `npm test` | OK | Descobre `tests/**/*.test.ts(x)` e executa via Node/tsx |
| `npm run db:seed:uat` | Nao executado nesta documentacao | Popula dados sinteticos em banco descartavel local/preview |
| `npm run prisma:validate` | OK | Valida schema Prisma com `DATABASE_URL` real ou placeholder |
| `npm run check:whitespace` | OK | Varre arquivos de texto tracked e untracked |
| `npm run quality` | OK | Gate completo local |
| `npm audit` | OK | 0 vulnerabilidades apos atualizacao de lockfile e override de `postcss` |

## Logs locais

`npm run dev` escreve logs estruturados no terminal. Para correlacionar uma chamada manual, envie `x-request-id` ou `x-correlation-id` e busque esse valor na saida. O formato detalhado esta em [[Operacao/Observabilidade-e-logs]].

## Banco

- ORM: Prisma Client.
- Schema: `prisma/schema.prisma`.
- Config: `prisma.config.ts`.
- SQL de referencia: `New_db_schema.sql`.
- Seed: `prisma/seed.ts`.
- O seed usa `TRUNCATE ... RESTART IDENTITY CASCADE`, entao apaga dados existentes.
- O seed recusa URLs com aparencia de producao, URLs sem marcador descartavel no usuario ou banco (`uat`, `dev`, `test`, `local`, `preview`, `sandbox`, `tmp`, `scratch` ou `seed`) e, por padrao, tambem recusa hosts remotos. Use `DMS_ALLOW_REMOTE_UAT_SEED=true` somente em preview descartavel.

## Login local com seed

Contas criadas pelo seed:

| Perfil | CPF | Senha | Tipo |
| --- | --- | --- | --- |
| Admin | `00000000001` | `uat-admin-123` | `A` |
| Gerente Horizonte | `00000000002` | `uat-manager-123` | `M` |
| Operador persona Horizonte | `00000000003` | `uat-operator-123` | `0` |
| Visualizador persona Horizonte | `00000000004` | `uat-viewer-123` | `0` |
| Gerente Leste | `00000000022` | `uat-manager-123` | `M` |
| Worker web-denied | `00000000011` | `uat-worker-123` | `1` |

Admin e gerentes/personas de gestao acessam a web pelo login atual. Worker continua como fixture negativa: login web deve retornar `WEB_ROLE_DENIED`.
