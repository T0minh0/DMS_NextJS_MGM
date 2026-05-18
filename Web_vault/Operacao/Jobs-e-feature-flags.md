# Jobs e feature flags

Referencia: [[ADR/ADR-0004-job-runner-cron-feature-flags]].

## Variaveis

| Variavel | Default | Uso |
| --- | --- | --- |
| `DMS_JOB_RUNNER` | `disabled` | `railway-cron`, `http-cron`, `manual` ou `disabled` |
| `DMS_JOB_SECRET` | ausente | Segredo bearer para endpoints internos de job |
| `CRON_SECRET` | ausente | Fallback compativel com Vercel Cron |
| `DMS_FEATURE_COLLECTIVE_SALES` | `false` | Flag de migracao lida por `src/lib/jobs/config.ts`; nao e kill switch global de rotas/UI coletivas atuais |
| `DMS_FEATURE_GAMIFICATION` | `false` | Liga runtime/jobs de gamificacao; UI usa tambem `NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION*` |
| `DMS_FEATURE_NOTICES` | `false` | Flag de migracao lida por `src/lib/jobs/config.ts`; nao substitui RBAC nem deploy controlado de `/notices` |
| `DMS_FEATURE_REPORTS` | `false` | Flag de migracao lida por `src/lib/jobs/config.ts`; reports atuais devem ser validados por smoke real |

Em producao, `DMS_JOB_SECRET` ou `CRON_SECRET` precisa ter 32+ caracteres quando endpoints ou jobs internos forem ativados.

## Schedules Railway

Railway avalia cron em UTC. Os horarios abaixo preservam a intencao dos schedulers Java em horario de Brasilia.

| Job | Cron UTC | Quando |
| --- | --- | --- |
| `monthly-random-multiplier` | `5 3 1 * *` | primeiro dia do mes |
| `achievement-evaluation` | `10 5 * * *` | diariamente |
| `leaderboard-snapshot-weekly` | `15 6 7,14,21,28 * *` | dias 7, 14, 21 e 28 |
| `leaderboard-snapshot-monthly` | `30 6 1 * *` | dia 1 para o mes anterior |

Cada cron service deve executar um comando curto e encerrar. Nao manter conexoes Prisma abertas ao final.

## Endpoint interno

Quando houver fallback HTTP, chamar com:

```bash
curl -X POST "$APP_URL/api/internal/jobs/<job>" \
  -H "Authorization: Bearer $DMS_JOB_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"periodKey":"2026-04","cooperativeId":"42"}'
```

Regras:

- nao usar cookie de usuario para job;
- nao logar segredo;
- usar `runtime = 'nodejs'`;
- bloquear concorrencia por ledger/constraint;
- repetir a mesma chave deve ser no-op ou recomputacao transacional sem duplicatas.

## Feature flags local

Exemplo `.env.local` para testar gamificacao sem ligar outros dominios:

```bash
DMS_JOB_RUNNER=manual
DMS_JOB_SECRET='use-um-segredo-de-job-com-32-ou-mais-caracteres'
DMS_FEATURE_GAMIFICATION=true
DMS_FEATURE_COLLECTIVE_SALES=false
DMS_FEATURE_NOTICES=false
DMS_FEATURE_REPORTS=false
```

## Validacao local

```bash
npm test
npm run quality
```

Testes atuais cobrem:

- flags opt-in e valores invalidos;
- fallback `CRON_SECRET`;
- rejeicao de segredo fraco em producao;
- bearer token de job;
- reexecucao idempotente por periodo/cooperativa.

Observacao operacional: estas flags nao bloqueiam automaticamente todas as rotas de cada dominio. Antes de usar uma flag como controle de rollout, confirmar no codigo se a superficie especifica consulta a flag; caso contrario, usar controle de trafego/deploy ou implementar gate explicito com teste.
