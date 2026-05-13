# Backlog tecnico

Backlog derivado de fatos observados no codigo e nos checks locais.

## Seguranca

- Ampliar testes de API com banco controlado para cobrir login, vendas, usuarios e dashboard.
- Revisar a politica operacional antes de habilitar `DMS_DEBUG_ENDPOINTS_ENABLED=true` em producao, incluindo trilha de auditoria e rate limit.
- Reduzir PII em respostas de API ou mascarar CPF/PIS/RG no cliente.
- Normalizar `/api/user?id|cpf` para nao revelar diferenca entre usuario inexistente e fora de escopo para gerente autenticado.
- Planejar upgrade major Prisma 7 em task separada.

## Integridade de dados

- Usar transacao Prisma em criacao/edicao/exclusao de venda + update de estoque.
- Aplicar [[ADR/ADR-0002-lifecycle-vendas-estoque-decimal]] nas migrations e APIs de vendas/estoque.
- Usar transacao no recalc de contribuicoes.
- Decidir se `phone` deve existir no schema ou sair dos formularios.
- Padronizar tipos de `material_id` nas respostas e componentes.

## Tooling

- Expandir `npm test` alem de auth/RBAC/debug para smoke tests.
- Ampliar workflow CI quando houver ambientes reais de banco/staging.
- Registrar comando de seed no README atualizado.
- Manter migrations Prisma versionadas apos a baseline `00000000000000_baseline`.

## Jobs e migracao

- Implementar scripts `npm run job:monthly-random-multiplier`, `npm run job:achievement-evaluation`, `npm run job:leaderboard-snapshot-weekly` e `npm run job:leaderboard-snapshot-monthly` conforme [[ADR/ADR-0004-job-runner-cron-feature-flags]].
- Criar adapter Prisma persistente para o ledger idempotente de jobs.
- Adicionar eventos estruturados de `job.started`, `job.completed`, `job.skipped` e `job.failed`.
- Ligar feature flags por dominio somente apos migrations e APIs aprovadas.

## PDF e notices

- Implementar endpoints PDF reais conforme [[ADR/ADR-0005-pdf-sanitizacao-notices]].
- Aplicar `sanitizeNoticeTitle` e `sanitizeNoticeContent` nas APIs de notices.
- Registrar fonte local dos PDFs quando o layout final de reports for implementado.
- Manter testes contra GHSA-9mrh-v2v3-xpfm em qualquer mudanca de allowlist.

## UI e produto

- Consolidar paleta verde/vinho em tokens.
- Reduzir estilos inline.
- Corrigir metadata default `Create Next App`.
- Revisar responsividade dos graficos e menu FAB.

## Documentacao

- Atualizar `README.md` com stack real.
- Atualizar ou arquivar `DOCUMENTATION.md` por conter referencias MongoDB/Mongoose.
- Expandir exemplos de payloads conforme novas tasks alterarem contratos.
- Manter este vault sincronizado apos mudancas em API, schema e UI.
