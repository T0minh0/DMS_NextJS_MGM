# Regras de negocio

ADR vigente para a reforma de vendas: [[ADR/ADR-0002-lifecycle-vendas-estoque-decimal]]. O comportamento abaixo descreve o legado observado; novas implementacoes devem seguir a ADR.

## Tipos de usuario

Helper: `mapUserType`.

| Valor bruto | Valor mapeado | Significado observado |
| --- | --- | --- |
| `0` | `0` | Gerente/admin |
| `M` ou `A` | `0` | Gerente/admin legado |
| `1` | `1` | Catador/trabalhador |
| `W` ou `C` | `1` | Catador/trabalhador legado |

O login do dashboard permite apenas gerentes.

## Identificador de catador

Helper: `formatWorkerId(workerId)`.

- Formato: `WP` + id numerico com pelo menos 3 digitos.
- Exemplo: `workerId = 5` vira `WP005`.
- Se o id nao puder ser convertido para number, retorna o `BigInt` como string.

## Usuarios

Criacao:

- Campos obrigatorios: nome, CPF, senha, data de nascimento, data de entrada, cooperativa, PIS e RG.
- `user_type` deve ser `0` ou `1`.
- CPF, PIS e RG devem conter digitos depois de sanitizacao.
- CPF nao pode duplicar um worker existente.
- Email ausente vira `sem-email@coop.local`.
- Senha e gravada como bcrypt em `Bytes`.

Atualizacao:

- Exige id, nome, datas, cooperativa, PIS e RG.
- Permite alterar tipo de usuario.
- Senha so muda se enviada.
- CPF nao e alterado no handler de update atual.

Exclusao:

- Bloqueada se o usuario tiver vendas como responsavel, medicoes ou contribuicoes.

## Materiais e grupos

Listagem:

- `/api/materials` retorna primeiro objetos de grupo com `_id: group-{nome}` e `isGroup: true`, depois materiais individuais.
- Materiais incluem `_id`, `material_id`, `material`, `name`, `group`.

Criacao:

- Requer nome do material e grupo.
- Nome do material nao pode existir em comparacao case-insensitive.
- Grupo e reutilizado por nome case-insensitive ou criado se nao existir.

Atualizacao:

- Requer nome e grupo.
- Bloqueia duplicidade com outro material.
- Cria grupo se necessario.

Exclusao:

- Bloqueada se material estiver em medicoes, vendas, estoque ou contribuicoes.

## Cooperativas

- Listagem ordena por nome.
- Criacao exige `name`.
- Resposta usa `_id`, `cooperative_id` e `name`.

## Estoque

Camada canonica: `src/lib/stock/ledger.ts`.

Novas implementacoes de estoque devem usar `Prisma.Decimal` desde a entrada de dominio ate a persistencia. Conversao para `number` fica restrita a JSON legado, logs ou exibicao. O helper transacional possui:

- `addToStock`: entrada positiva com ate 2 casas decimais; incrementa coletado e disponivel.
- `recordSale`: venda consolidada; executa update condicional atomico e falha sem alterar estoque quando nao ha saldo.
- `adjustStock`: delta de reserva coletiva; delta positivo reserva, delta negativo libera sem permitir que `current_stock_kg` ultrapasse `total_collected_kg - total_sold_kg`.
- `calculateBagStateDelta`: porta a regra Java de pesagem acumulada; delta coletado e `max(reportedCurrentKg - previousCurrentKg, 0)` e sacola cheia zera o estado.

Consulta:

- `/api/stock` soma `currentStockKg` por nome de material.
- Filtro `material_id` aceita id direto ou valor `group_{nome}`.
- Se nao houver dados, retorna `{ noData: true, message }`.

Venda:

- Criacao de venda exige estoque existente para a cooperativa do gerente e material.
- Bloqueia venda com peso maior que `currentStockKg`.
- Ao criar venda:
  - Cria ou reutiliza comprador.
  - Cria registro em `Sales`.
  - Soma peso em `totalSoldKg`.
  - Subtrai peso de `currentStockKg`.
- Ao editar venda:
  - Material nao pode ser alterado.
  - Apenas o gerente responsavel pode alterar.
  - Recalcula estoque com base no peso antigo e novo.
- Ao excluir venda:
  - Apenas o gerente responsavel pode excluir.
  - Remove venda.
  - Subtrai peso de `totalSoldKg` com piso zero.
  - Devolve peso a `currentStockKg`.

## Compradores

- Listagem retorna nomes ordenados.
- Criacao exige nome.
- Duplicidade e bloqueada por comparacao case-insensitive.

## Dashboard

Ganhos:

- `/api/earnings-comparison` calcula 6 periodos.
- `weekly`: janelas de 7 dias.
- `monthly`: meses.
- `yearly`: anos.
- Ganho = soma de `priceKg * weight` em vendas do periodo.

Coletas:

- `/api/worker-collections` considera medicoes no periodo atual.
- `weekly`: semana atual.
- `monthly`: mes atual.
- `yearly`: ano atual.
- Se `yearly` sem filtro de material, retorna ranking top 10 com breakdown por material.
- Caso contrario, retorna top 10 por peso total.

Precos:

- `/api/price-fluctuation` com material especifico retorna ultimos pontos desse material.
- Com grupo, agrupa por data e retorna preco medio.
- Sem material, pega ate 5 materiais com venda mais recente e monta series por data.

Aniversarios:

- `/api/birthdays` lista trabalhadores/catadores com aniversario no mes atual.
- Filtra `User_type` em `1`, `W`, `C`.

## Produtividade individual

Endpoint: `/api/worker-productivity`.

- Requer `worker_id`.
- `weeks` padrao: 12.
- Busca medicoes do catador entre `hoje - weeks*7` e hoje.
- Agrupa medicoes por data e material.
- Calcula contribuicao liquida por diferenca de peso entre medicoes do mesmo dia/material.
- Se `bagFilled` for true, usa regra especifica para calcular liquido a partir do peso inicial.
- Agrupa por semana.
- Retorna contribuicoes semanais, total, media semanal, melhor semana e top 5 materiais.

## Recalculo de contribuicoes

Endpoint: `POST /api/recalculate-contributions`.

- Busca todas as medicoes.
- Agrupa por worker, material e data.
- Calcula contribuicoes diarias: se houver medicao com `bagFilled`, usa o peso dessa medicao; caso contrario usa o maior peso do dia.
- Agrupa por semana ISO e ano.
- Apaga todas as linhas de `Worker_contributions`.
- Reinsere contribuicoes semanais com `daterange(startDate, endDate, '[]')`.

Risco: operacao destrutiva para `Worker_contributions`.
