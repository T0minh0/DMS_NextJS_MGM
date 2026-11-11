# Plano de implementação

1. Cobrir em PostgreSQL descartável: exclusão individual, estorno exato, auditoria, escopo de cooperativa, estoque insuficiente, saco parcial/cheio, pesagem histórica, repetição e concorrência com pesagem.
2. Criar `src/lib/materials/delete-collection.ts`: validação de ID/motivo e serviço transacional com locks compatíveis com web/mobile, recomposição de saco, estoque, contribuições e auditoria. Adicionar models/migrations aditivas `collection_deletion_audit` e `measurement_effect`, capturar efeitos nos escritores web/móvel e na importação, bloquear registros legados sem proveniência.
3. Criar `DELETE /api/collections/[id]` com requireManagerOrAdmin, determineTargetCooperative, permissão stock:delete e erros de domínio. Ampliar a matriz somente para admin/manager no escopo existente.
4. Adicionar diálogo nativo em `src/components/collections/DeleteCollectionDialog.tsx` e ação nas duas apresentações de Coletas. Motivo obrigatório, proteção contra repetição, feedback e atualização de lista/saco após sucesso; erro preserva o lançamento.
5. Rodar testes, quality e fluxo real contra banco descartável. Revisar diff, verificar restrições e não publicar código sem revisão dos resultados. Preparar commit/PR revisável; produção somente conforme escopo autorizado.
