# Qualidade e riscos

## Riscos de seguranca

| Risco | Evidencia | Impacto |
| --- | --- | --- |
| Documentos pessoais retornam em claro | APIs de usuario retornam CPF/PIS/RG | Exposicao de PII no cliente |
| Endpoints debug existem no app | `/api/debug/*` com `requireAdmin` e bloqueio por `NODE_ENV=production` | So devem ser habilitados em producao com `DMS_DEBUG_ENDPOINTS_ENABLED=true` e aprovacao operacional |
| Enumeração limitada em usuario | `/api/user?id|cpf` pode diferenciar `403` fora de escopo e `404` inexistente para gerente autenticado | Baixo; resolver em S5-05 ao revisar PII/escopo de equipe |

## Riscos de integridade

| Risco | Evidencia | Impacto |
| --- | --- | --- |
| Recalc sem transacao explicita | `deleteMany` seguido por inserts SQL raw | Falha no meio pode deixar contribuicoes vazias/parciais |
| Venda cria/atualiza estoque sem transacao | `Sales.create/update/delete` e `Stock.update` separados | Falha parcial pode desalinhar venda e estoque |
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
3. Envolver mutacoes venda+estoque e recalc em transacoes.
4. Atualizar documentacao legada ou marcar como historica.
5. Mascarar documentos pessoais em respostas de API e telas de gestao.
6. Normalizar respostas fora de escopo em `/api/user` ou consultar por cooperativa para nao-admin.
