# Exclusão de pesagens

No portal, abra **Coletas → Coletas recentes**, filtre o catador/material, escolha **Excluir**, confira registro/peso/data e informe o motivo. **Voltar** ou Escape fecha a revisão sem excluir. A ação está disponível para gestor na própria cooperativa e administrador no escopo autorizado.

`DELETE /api/collections/[id]?cooperative_id=...` recebe `{ "reason": "Registro feito por engano" }`. A sessão vem do cookie autenticado. A resposta informa `removed_weight_kg`, `removed_current_stock_kg` e `bag_adjusted`. IDs fora da cooperativa recebem 404; sessão de trabalhador não pode excluir.

O servidor usa uma transação com a mesma ordem de locks da pesagem móvel/web (saco, depois estoque). Reverte os efeitos originais de `measurement_effect`, atualiza somente contribuições calculadas do trabalhador/material/período afetados e conserva o lançamento, autor, motivo e estados na `collection_deletion_audit`. Vendas e reservas são preservadas; saldo insuficiente bloqueia toda a operação. A última alteração efetiva do saco restaura o estado anterior capturado. Exclusão histórica mantém a leitura física posterior; importação sem efeito no saco não o altera. O limite temporal contra leituras atrasadas é preservado.

## Registros anteriores à atualização

Pesagens sem `measurement_effect` recebem 409 `LEGACY_COLLECTION_UNSUPPORTED`: precisam de correção assistida, com identificação do registro e verificação do efeito no estoque/saco. Não há preenchimento automático desse histórico, porque uma importação pode ter aumentado apenas o total coletado. Níveis, conquistas e snapshots de ranking já fechados não são recalculados automaticamente.

## Publicação coordenada

1. Fazer backup do banco compartilhado.
2. Publicar o portal, que aplica as migrations aditivas `20261111000000_collection_deletion_audit` e `20261111010000_measurement_effect`.
3. Publicar o backend móvel que grava `measurement_effect`. Não executar migrations pelo backend móvel.
4. Verificar ambos os runtimes e o esquema. Registros gravados pelo backend antigo durante a transição seguem como legados e exigem assistência.

## Validação

O CI web cria PostgreSQL 16 descartável, aplica migrations e roda o gate completo com os testes reais de exclusão. Localmente, configure `COLLECTION_TEST_DATABASE_URL` para um banco chamado `dms_collection_delete_test` em localhost/127.0.0.1 e execute `npm test`. As mesmas migrations preparam os testes de captura de efeitos do backend móvel. Nunca usar banco de produção para esses testes.
