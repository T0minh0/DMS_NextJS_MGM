# Revisao S5-03: seguranca, performance e concorrencia

Task ClickUp: `86e136ckx` (`[S5-03] Revisao de seguranca, performance e concorrencia`).

Data: 2026-05-17.

## Resultado

Sweep de desenvolvimento concluido e pronto para os gates Tony. A revisao encontrou um risco material de concorrencia ja registrado no improvement log: corrida estreita entre `edit`, `invite`, `join`, `cancel`, `complete`, `leave` e `contribution` de vendas coletivas podia usar uma leitura obsoleta de lifecycle/contribution e devolver, reservar, convidar ou finalizar estoque em intercalacoes raras.

Mitigacao implementada:

- `src/lib/collective-sales/locks.ts` centraliza `lockCollectiveSaleForUpdate` com `SELECT ... FOR UPDATE`.
- `PATCH /api/collective-sales/[id]`, `POST /invite`, `POST /join`, `PATCH /contribution`, `POST /leave`, `POST /cancel` e `POST /complete` agora serializam a linha de `collective_sale` antes de mudar lifecycle, participantes ou estoque.
- `PATCH /api/collective-sales/[id]` re-checa contribuicoes reservadas sob lock antes de trocar `material_id`.
- `POST /cancel` ordena contribuicoes por `cooperativeId`/`contributionId` e re-le a contribution depois de `lockStockAggregateForUpdate` antes de chamar `adjustStock`.
- `POST /complete` revalida cancelamento/conclusao concorrente dentro da transacao antes de snapshot de contribuicoes, rateio e baixa final.

Decisao de performance: a serializacao por venda coletiva reduz paralelismo dentro da mesma venda, mas preserva paralelismo entre vendas diferentes e evita inconsistencia de estoque. A superficie e operacionalmente baixa comparada ao risco de double return/finalization.

## Matriz de auditoria

| Eixo | Superficie | Evidencia | Resultado |
| --- | --- | --- | --- |
| Auth/RBAC | APIs gerenciais, reports, debug, jobs | `tests/auth-rbac.test.ts`, `tests/reports-sales-s304-api.test.ts`, `tests/reports-sales-s305-api.test.ts`, `tests/observability.test.ts`, `src/lib/auth/*` | Sem novo blocker. Reports completos exigem criador/admin/participante aceito. Debug segue admin + bloqueio prod. |
| PII e logs | Login, usuarios, managed workers, observabilidade | `src/lib/observability/logger.ts`, `tests/observability.test.ts`, `Web_vault/Operacao/Observabilidade-e-logs.md` | Redacao central preservada. Riscos residuais de JWT/localStorage permanecem aceitos e planejados. |
| Dependencias | Pacotes npm runtime/dev | `npm audit --audit-level=high --json` e `npm audit --omit=dev --audit-level=high --json` | 0 high/critical observado na validacao local. |
| Concorrencia de estoque | `src/lib/stock/ledger.ts`, vendas normais, pesagem, coletivas | `FOR UPDATE`, updates condicionais, `tests/stock-ledger.test.ts`, `tests/material-stock-api.test.ts`, `tests/sale-lifecycle.test.ts`, `tests/security-performance-concurrency-s503.test.ts` | Mitigacao S5-03 fecha as corridas coletivas conhecidas; helpers atomicos continuam canonicos. |
| Performance operacional | Build, testes, rotas auditadas, locks | `npm run quality`, testes dirigidos S5-03 | Sem degradacao de contrato esperada; lock por venda coletiva e tradeoff deliberado. |
| Jobs/async | Random multiplier, achievements, leaderboard snapshots | `tests/jobs-runtime.test.ts`, `Web_vault/Operacao/Jobs-e-feature-flags.md` | Idempotencia e feature flags preservadas; sem mudanca nesta task. |
| Deprecacao Java | Checklist final do legado | `Web_vault/Operacao/Deprecacao-network-management-system.md`, `Web_vault/Operacao/Runbook-final-migracao-e-handoff.md` | S5-03 remove o blocker de security/performance/concurrency; S5-04 define cutover, rollback e handoff. |

## Riscos residuais aceitos

| Risco | Classificacao | Dono/proxima acao |
| --- | --- | --- |
| `/api/buyers` permanece catalogo global | accepted risk | Avaliar scoping por cooperativa antes de buyers multi-tenant. |
| Identidade client-side ainda e espelhada em `localStorage` em telas legadas | accepted risk | Migrar telas restantes para `/api/auth/session` ou endpoints escopados. |
| Ajuste manual de estoque ainda nao tem ledger imutavel dedicado | accepted risk | Criar `stock_adjustment_ledger` antes de operacao auditavel real. |
| JWT ainda carrega CPF no payload assinado | accepted risk | Remover `cpf` de `signAuthToken` em hardening de privacidade. |
| Invariante fisica de estoque ainda depende dos helpers, sem CHECK no banco | accepted risk | Planejar constraint/backfill antes de permitir writes fora dos helpers canonicos. |
| Concorrencia coletiva ainda nao tem smoke multi-transacao real em Postgres | accepted risk | Criar teste descartavel antes de cutover operacional real com concorrencia multiusuario. |

## Validacao executada

Comandos centrais desta task:

```bash
npx tsx --test tests/security-performance-concurrency-s503.test.ts tests/collective-sales-s302-api.test.ts tests/collective-sales-s303-api.test.ts tests/stock-ledger.test.ts tests/material-stock-api.test.ts tests/sale-lifecycle.test.ts tests/auth-rbac.test.ts tests/observability.test.ts tests/jobs-runtime.test.ts
npm run quality
npm audit --audit-level=high --json
npm audit --omit=dev --audit-level=high --json
npx --yes @google/design.md lint .tony/design.md
```

Resultados observados:

- Teste dirigido S5-03 e superficies tocadas: 79/79 testes passando apos cobrir `edit`, `invite` e `join`.
- Auditoria `security-auditor`: PASS apos corrigir findings High/Medium de lifecycle coletivo.
- Peer review `codex-peer-reviewer`: PASS apos corrigir finding Medium de rateio coletivo com largest-remainder.
- `npm run quality`: passando com 440/440 testes, Prisma validate, visual contract, build e whitespace.
- `npm audit --audit-level=high --json`: 0 vulnerabilidades.
- `npm audit --omit=dev --audit-level=high --json`: 0 vulnerabilidades.
- `npx --yes @google/design.md lint .tony/design.md`: 0 erros, 0 warnings, 1 info.
- `next-env.d.ts`: sem drift de import extra alem do gerado pelo Next.
