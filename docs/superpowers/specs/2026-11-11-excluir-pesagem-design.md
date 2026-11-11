# Exclusão de pesagem pelo gestor

Pedido: remover a última pesagem acidental da Suellen e disponibilizar a correção no portal para gestores da cooperativa.

Implementação escolhida: acrescentar exclusão individual em Coletas, no desktop e celular, com revisão dos dados, motivo obrigatório e confirmação. A API autentica gestor/admin, verifica a cooperativa no registro, bloqueia o saco e o estoque e reverte somente o delta registrado. Não permite saldo negativo nem consome reservas/vendas. Uma tabela de auditoria conserva o lançamento original, autor, motivo e estados anteriores/posteriores na mesma transação. Não altera cadastros ou vendas.

Alternativas consideradas: apagar apenas a linha deixaria estoque incorreto; exclusão lógica exigiria mudar todas as leituras e o backend móvel. Exclusão com estorno e auditoria mantém o contrato das leituras atuais e é aditiva no schema compartilhado.

Cada nova pesagem mantém em `measurement_effect` os deltas exatos de estoque e os estados anterior/posterior do saco. Os escritores web, móvel e de importação registram esses efeitos na mesma transação. A exclusão reverte apenas esses efeitos: a última alteração efetiva do saco restaura o estado anterior; registros históricos preservam a leitura física posterior e continuam como barreiras de estado na auditoria, mesmo após removidos da lista. Importações só de total coletado não diminuem o disponível. A data de atualização é preservada como barreira contra leituras atrasadas. Registros legados sem proveniência são bloqueados para correção assistida. Contribuições calculadas do trabalhador/material são atualizadas nos períodos afetados. Níveis/conquistas/snapshots fechados não são recalculados automaticamente.

Operação solicitada: identificar inequivocamente o lançamento em produção e guardar backup antes de excluir. Consulta inicial em 11/11 encontrou Suelen de Oliveira Soares (worker 12, cooperativa 1) sem pesagens; esclarecimento solicitado. Não apagar dados de outra pessoa.
