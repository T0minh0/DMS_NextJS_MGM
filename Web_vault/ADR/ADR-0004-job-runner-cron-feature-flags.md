# ADR-0004: Job runner, cron e feature flags de migracao

Status: aceito para execucao da reforma.

Data: 2026-04-27.

Task ClickUp: `86e136bv7` (`[S0-07] ADR job runner, cron e feature flags de migracao`).

## Contexto

O repo Java usa `@Scheduled` para tres familias de jobs:

- random multiplier mensal por cooperativa;
- avaliacao diaria de achievements e recalculo de levels;
- snapshots semanais/mensais de leaderboard.

O app principal agora e Next.js App Router com Prisma. Next nao agenda jobs sozinho e o deploy observado usa Nixpacks, com `nixpacks.toml` executando build/start do app Node. Sem uma decisao explicita, jobs poderiam virar `node-cron` dentro do processo web, endpoints publicos inseguros, ou scripts manuais sem idempotencia.

Referencias oficiais usadas nesta decisao:

- Railway Cron Jobs: https://docs.railway.com/cron-jobs
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- Next.js route segment runtime: https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#runtime

## Decisao

Adotar um modelo hibrido, com prioridade para cron externo ao processo web:

1. **Runner primario: Railway Cron service separado por familia de job.** Como o projeto ja usa Nixpacks, cada job deve ser um servico curto que executa um comando Node/tsx e encerra. O processo web nao deve conter scheduler em memoria.
2. **Fallback suportado: endpoint HTTP interno protegido.** Se o deploy migrar para Vercel ou outro provider que chame route handlers, usar `POST /api/internal/jobs/<job>` com `Authorization: Bearer <secret>`, `runtime = 'nodejs'` e mesma camada de idempotencia.
3. **Feature flags opt-in.** Modulos migrados entram desligados por padrao e so ligam por env/config explicita.
4. **Idempotencia por chave de dominio.** Cada execucao deve ter chave deterministica por `jobName`, periodo e cooperativa quando aplicavel.
5. **Observabilidade estruturada.** Jobs devem logar evento, job, periodo, cooperativa, status, duracao e correlation id sem CPF, senha, token, PIS, RG ou payload sensivel.
6. **Reexecucao manual segura.** Retentar a mesma chave nao pode duplicar multiplier, achievement, level ou snapshot. Rerun deve ser no-op quando a chave ja esta concluida, ou recomputar por upsert/delete-insert transacional quando a task de dominio exigir.

## Runner primario

Railway Cron Jobs rodam por expressao crontab e esperam que o processo encerre ao fim. Essa propriedade combina melhor com Prisma e tarefas pontuais do que manter `node-cron` dentro do servidor Next.

Comandos alvo para as tasks futuras:

```bash
npm run job:monthly-random-multiplier
npm run job:achievement-evaluation
npm run job:leaderboard-snapshot-weekly
npm run job:leaderboard-snapshot-monthly
```

Esses scripts ainda serao implementados nas tasks de dominio. Eles devem:

1. carregar `DATABASE_URL`;
2. validar `DMS_JOB_RUNNER`;
3. executar apenas se a feature flag do dominio estiver ativa;
4. abrir Prisma Client;
5. processar cooperativas em transacao curta por chave;
6. fechar conexoes e encerrar o processo.

## Schedules

Railway usa crontab em UTC. Para preservar a intencao do Java em `America/Sao_Paulo`, os horarios abaixo usam UTC equivalente aproximado ao horario de Brasilia sem DST.

| Job | Java | Railway cron UTC | Period key | Cooperative key |
| --- | --- | --- | --- | --- |
| `monthly-random-multiplier` | `0 0 0 1 * *` | `5 3 1 * *` | `YYYY-MM` | sim |
| `achievement-evaluation` | `0 0 2 * * *` | `10 5 * * *` | dia de execucao `YYYY-MM-DD` | sim |
| `leaderboard-snapshot-weekly` | `0 0 3 7,14,21,28 * *` | `15 6 7,14,21,28 * *` | `YYYY-MM-W<1-4>` | sim |
| `leaderboard-snapshot-monthly` | `0 0 3 1 * *` | `30 6 1 * *` | mes anterior `YYYY-MM` | sim |

Os jobs devem calcular datas de negocio com timezone `America/Sao_Paulo`, mesmo quando disparados em UTC.

`achievement-evaluation` usa chave diaria para permitir que o scheduler rode todos os dias. A deduplicacao mensal de `worker_achievement` deve continuar acontecendo no dominio por unique/upsert em `(worker_id, achievement_id, cooperative_id, year_month)`.

`leaderboard-snapshot-weekly` e `leaderboard-snapshot-monthly` usam nomes de job separados para evitar colisao entre o snapshot W4 do dia 28 e o fechamento final do mes anterior no dia 1.

## Fallback HTTP

Para providers como Vercel, os jobs podem ser chamados por route handlers. Regras:

- Metodo `POST`.
- `export const runtime = 'nodejs'`.
- Segredo em `DMS_JOB_SECRET` ou `CRON_SECRET`.
- Header obrigatorio: `Authorization: Bearer <secret>`.
- Segredo com 32+ caracteres em producao.
- Nao aceitar sessao de usuario comum como autenticacao de job.
- Logs nunca imprimem o segredo nem o header completo.
- Concurrency deve ser bloqueada por ledger/lock transacional, porque providers HTTP podem entregar eventos duplicados ou concorrentes.

## Feature flags

Flags definidas em `src/lib/jobs/config.ts`:

| Flag | Env | Default | Libera |
| --- | --- | --- | --- |
| `collectiveSales` | `DMS_FEATURE_COLLECTIVE_SALES` | `false` | APIs/UI/jobs de venda coletiva |
| `gamification` | `DMS_FEATURE_GAMIFICATION` | `false` | multipliers, achievements, levels e leaderboard |
| `notices` | `DMS_FEATURE_NOTICES` | `false` | mural de avisos |
| `reports` | `DMS_FEATURE_REPORTS` | `false` | reports JSON/PDF novos |

Valores aceitos: `true/false`, `1/0`, `on/off`, `yes/no`, `enabled/disabled`.

`DMS_JOB_RUNNER` aceita:

- `disabled`: default seguro;
- `railway-cron`: cron service curto;
- `http-cron`: route handler protegido;
- `manual`: execucao local/staging sob demanda.

## Idempotencia

Contrato implementado em `src/lib/jobs/idempotency.ts`.

Chave canonica:

```text
<jobName>:<periodKey>:<cooperative|global>
```

Exemplos:

```text
monthly-random-multiplier:2026-04:cooperative-42
achievement-evaluation:2026-04-27:cooperative-42
leaderboard-snapshot-weekly:2026-04-W2:cooperative-42
leaderboard-snapshot-monthly:2026-04:cooperative-42
```

Cada task de dominio deve persistir a idempotencia no banco, preferencialmente com uma tabela `job_run` ou constraints unicas do proprio dominio:

```sql
UNIQUE (job_name, period_key, cooperative_id)
```

Regras:

- `completed` bloqueia nova execucao com a mesma chave.
- `running` bloqueia concorrencia.
- `failed` permite retry.
- retry de dominio deve usar upsert ou transicao de estado, nunca insert cego.
- snapshots de leaderboard devem substituir entries dentro da mesma transacao quando a task futura optar por recomputacao forcada.

## Reexecucao manual

Fluxo seguro:

1. Identificar `jobName`, `periodKey` e `cooperativeId`.
2. Confirmar feature flag ativa no ambiente alvo.
3. Executar comando manual em staging primeiro.
4. Conferir logs estruturados e contadores de linhas afetadas.
5. Reexecutar a mesma chave e confirmar no-op ou recomputacao transacional sem duplicatas.
6. Somente depois repetir em producao.

Uma reexecucao manual nunca deve exigir alterar dados diretamente por SQL fora de incident response.

## Alternativas rejeitadas

| Alternativa | Motivo da rejeicao |
| --- | --- |
| `node-cron` dentro do processo Next | Exige processo web sempre ativo, duplica execucoes em scale-out e falha silenciosamente em deploy/serverless. |
| Apenas Vercel Cron | O projeto atual indica Nixpacks, nao Vercel. Manter Vercel como fallback evita acoplamento prematuro. |
| GitHub Actions acessando banco de producao | Aumenta superficie de segredo e rede, dificulta conexao privada e observabilidade de runtime. |
| Jobs manuais sem ledger | Nao atende idempotencia nem reexecucao segura. |
| Triggers SQL para regras de gamificacao | Esconde regra de negocio fora do app, dificulta testes e divergiria do service-layer Java. |

## Implicacoes para tasks futuras

- S1 migrations devem criar constraints unicas suficientes para `cooperative_random_multiplier`, `worker_achievement` e `leaderboard_snapshot`.
- S2/S4 jobs devem usar `runIdempotentJob` ou adapter equivalente com Prisma.
- S4 leaderboard deve manter chaves distintas para snapshot semanal e fechamento mensal; rerun completo deve ser no-op ou recompute force transacional, sem duplicar entries.
- S0-09 observabilidade deve incluir eventos de `job.started`, `job.completed`, `job.skipped`, `job.failed`.
- Endpoints internos de job, quando criados, devem ficar fora da navegacao e nao depender de cookie de usuario.

## Evidencias desta ADR

- `nixpacks.toml` usa Nixpacks para build/start do app.
- O repo Java documenta `MonthlyRandomMultiplier`, `AchievementEvaluationScheduler` e `LeaderboardScheduler`.
- `src/lib/jobs/config.ts` implementa feature flags e runtime config.
- `src/lib/jobs/auth.ts` valida bearer token de jobs com comparacao segura.
- `src/lib/jobs/idempotency.ts` implementa contrato de ledger e helper idempotente.
- `tests/jobs-runtime.test.ts` cobre flags, segredo, auth e reexecucao sem duplicar job por periodo/cooperativa.
