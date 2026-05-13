# Qualidade e riscos

## Riscos de seguranca

| Risco | Evidencia | Impacto |
| --- | --- | --- |
| Documentos pessoais retornam em claro | APIs de usuario retornam CPF/PIS/RG | Exposicao de PII no cliente |
| Endpoints debug existem no app | `/api/debug/*` com `requireAdmin` | Ainda devem ser evitados em producao operacional |
| Vulnerabilidades npm | `npm audit` | Next/Prisma e transientes com CVEs altas |

## Riscos de integridade

| Risco | Evidencia | Impacto |
| --- | --- | --- |
| Recalc sem transacao explicita | `deleteMany` seguido por inserts SQL raw | Falha no meio pode deixar contribuicoes vazias/parciais |
| Venda cria/atualiza estoque sem transacao | `Sales.create/update/delete` e `Stock.update` separados | Falha parcial pode desalinhar venda e estoque |
| Dashboard espera `totalEarnings` inexistente | `handleRecalculateContributions` | Erro em runtime na mensagem de sucesso |
| `phone` no cliente nao existe no backend | profile/manage-workers | Usuario pode achar que telefone sera salvo |
| `material_id` retorna number em `/api/materials` | algumas telas esperam string | Comparacoes podem falhar em casos especificos |

## Riscos de manutencao

| Risco | Evidencia | Impacto |
| --- | --- | --- |
| Documentacao legada cita MongoDB | `DOCUMENTATION.md` | Onboarding pode seguir stack errada |
| `next lint` quebrado | script atual | Sem gate de lint confiavel |
| `middleware` deprecated | aviso de build Next 16 | Futuras versoes podem exigir migracao |
| UI com cores duplicadas | Tailwind verde + inline vinho | Inconsistencia visual e manutencao dificil |
| Logs excessivos client-side | dashboard e layout | Console ruidoso e possivel vazamento de dados |
| Cobertura automatizada ainda estreita | `npm test` cobre auth/RBAC, mas nao fluxos de UI/API reais | Regressao funcional ainda depende de build/manual QA |

## Prioridades sugeridas

1. Atualizar `next`/`prisma` e resolver `npm audit`.
2. Ampliar testes de smoke para rotas reais com banco controlado.
3. Migrar `src/middleware.ts` para a convencao `proxy` do Next 16.
4. Envolver mutacoes venda+estoque e recalc em transacoes.
5. Atualizar documentacao legada ou marcar como historica.
6. Remover ou condicionar logs client-side.
