# Qualidade e riscos

## Riscos de seguranca

| Risco | Evidencia | Impacto |
| --- | --- | --- |
| Detalhe autorizado retorna documentos completos | `/api/user?id=...` retorna CPF/PIS/RG para usuario no escopo | Necessario para edicao/perfil; manter fora de listagens e auditar fluxos |
| Endpoints debug existem no app | `/api/debug/*` com `requireAdmin` e bloqueio por `NODE_ENV=production` | So devem ser habilitados em producao com `DMS_DEBUG_ENDPOINTS_ENABLED=true` e aprovacao operacional |
| Rate limit de login em memoria | App so confia em headers de proxy com `DMS_TRUST_PROXY_HEADERS=true` | Em scale-out precisa rate limit no ingress/proxy |
| Seed UAT destrutivo | `prisma/seed.ts` trunca tabelas operacionais | Rodar apenas em banco descartavel; guard bloqueia URLs remotas por padrao e nomes com `prod` |

## Riscos de integridade

| Risco | Evidencia | Impacto |
| --- | --- | --- |
| Recalc sem transacao explicita | `deleteMany` seguido por inserts SQL raw | Falha no meio pode deixar contribuicoes vazias/parciais |
| Dados legados podem bloquear S1-01 | Migration aborta se houver duplicidade em `Stock`, totais negativos ou vendas sem estoque correspondente | Produzir script/consulta de saneamento antes de aplicar em banco real |
| Writes durante migration S1-01 | Migration usa transacao explicita e lock em `Sales`, `Stock`, `Workers`; runbook ainda exige pausar writes | Evita divergencia durante backfill e constraints |
| `phone` no cliente nao existe no backend | profile/manage-workers | Usuario pode achar que telefone sera salvo |
| `material_id` retorna number em `/api/materials` | algumas telas esperam string | Comparacoes podem falhar em casos especificos |

## Riscos de manutencao

| Risco | Evidencia | Impacto |
| --- | --- | --- |
| Documentacao legada cita MongoDB | `DOCUMENTATION.md` | Onboarding pode seguir stack errada |
| `next lint` quebrado | script atual | Sem gate de lint confiavel |
| Prisma 7 disponivel | `prisma:validate` informa major update 6.19.3 -> 7.8.0 | Planejar upgrade separado por ser breaking change |
| Cobertura automatizada ainda estreita | `npm test` cobre auth/RBAC, mas nao fluxos de UI/API reais | Regressao funcional ainda depende de build/manual QA |

## Prioridades sugeridas

1. Planejar upgrade major Prisma 7 com guia oficial e ambiente de banco controlado.
2. Ampliar testes de smoke para rotas reais com banco controlado.
3. Envolver recalc em transacao.
4. Atualizar documentacao legada ou marcar como historica.
5. Adicionar rate limit de login no ingress/proxy de producao.
6. Preparar runbook de saneamento para bancos legados antes de aplicar S1-01 em producao.
