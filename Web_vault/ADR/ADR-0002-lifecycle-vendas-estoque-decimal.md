# ADR-0002: Lifecycle de vendas, estoque e Decimal

Status: aceito para execucao da reforma.

Data: 2026-04-27.

Task ClickUp: `86e136br5` (`[S0-03] ADR lifecycle de vendas, estoque e arredondamento Decimal`).

## Contexto

O Next atual registra venda normal em `POST /api/sales` e baixa estoque imediatamente. A referencia Java cria venda normal como ativa e baixa estoque apenas em `PATCH /api/sales/{saleId}/complete`.

Vendas coletivas existem na referencia Java, mas nao tem endpoint de completion observado. Contribuicoes coletivas reservam estoque por cooperativa, enquanto reports esperam `sold_at`, `total_weight` e `revenue_share`.

Esta ADR fixa o contrato funcional antes das migrations e APIs novas.

## Decisao

1. Toda venda normal ou coletiva usa os estados derivados `ACTIVE`, `SOLD` e `CANCELLED`.
2. Venda normal nao reserva estoque no create. Estoque e baixado somente no complete.
3. Venda coletiva reserva estoque por delta de contribuicao enquanto esta `ACTIVE`.
4. Completion de venda coletiva nao baixa `current_stock_kg` de novo; ela converte reserva em venda, incrementando `total_sold_kg` por cooperativa/material.
5. Cancelamento devolve toda reserva ativa ainda nao vendida.
6. Todos os calculos monetarios e de peso devem usar `Decimal`/numeric. `number`/`toFixed` ficam apenas na borda de apresentacao.
7. `revenue_share` e calculado no completion coletivo e fica persistido, para reports idempotentes e auditaveis.

## Estados

| Estado | Condicao SQL | Significado |
| --- | --- | --- |
| `ACTIVE` | `sold_at IS NULL AND cancelled_at IS NULL` | Venda editavel/operacional. |
| `SOLD` | `sold_at IS NOT NULL AND cancelled_at IS NULL` | Venda concluida; estoque e receita consolidados. |
| `CANCELLED` | `sold_at IS NULL AND cancelled_at IS NOT NULL` | Venda encerrada sem receita. |

Invariante obrigatoria: `sold_at` e `cancelled_at` nunca podem estar preenchidos ao mesmo tempo.

## Transicoes permitidas

### Venda normal

| Operacao | De | Para | Estoque | Idempotencia |
| --- | --- | --- | --- | --- |
| `create` | none | `ACTIVE` | Nenhum movimento. | Nao idempotente sem chave externa. |
| `update` | `ACTIVE` | `ACTIVE` | Nenhum movimento. | Repetir mesmo payload nao altera totais. |
| `complete` | `ACTIVE` | `SOLD` | `current_stock_kg -= weight`; `total_sold_kg += weight`. | Retry em `SOLD` retorna sucesso sem novo debito. |
| `cancel` | `ACTIVE` | `CANCELLED` | Nenhum movimento. | Retry em `CANCELLED` retorna sucesso sem efeito. |
| `update` | `SOLD`/`CANCELLED` | bloqueado | Nenhum movimento. | `409 Conflict`. |
| `complete` | `CANCELLED` | bloqueado | Nenhum movimento. | `409 Conflict`. |
| `cancel` | `SOLD` | bloqueado | Nenhum movimento. | `409 Conflict`. |

### Venda coletiva

| Operacao | De | Para | Estoque | Idempotencia |
| --- | --- | --- | --- | --- |
| `create` | none | `ACTIVE` | Nenhum movimento; creator entra como `ACCEPTED`. | Nao idempotente sem chave externa. |
| `invite` | `ACTIVE` | `ACTIVE` | Nenhum movimento. | Repetir convite existente retorna sucesso sem duplicar linha. |
| `join` | `ACTIVE` | `ACTIVE` | Nenhum movimento. | Repetir `ACCEPTED` retorna sucesso sem efeito. |
| `update contribution` | `ACTIVE` | `ACTIVE` | Reserva/libera por delta. | Mesmo peso gera delta zero. |
| `leave` | `ACTIVE` | `ACTIVE` | Libera reserva da cooperativa e marca `LEFT`. | Retry em `LEFT` retorna sucesso sem nova liberacao. |
| `update material` | `ACTIVE` | `ACTIVE` | Permitido somente sem reserva positiva. | Repetir mesmo material e no-op. |
| `update price` | `ACTIVE` | `ACTIVE` | Permitido somente sem reserva positiva. | Repetir mesmo preco e no-op. |
| `complete` | `ACTIVE` | `SOLD` | Converte reservas em `total_sold_kg`; `current_stock_kg` nao muda. | Retry em `SOLD` retorna sucesso/report sem recalcular. |
| `cancel` | `ACTIVE` | `CANCELLED` | Libera todas as reservas ativas. | Retry em `CANCELLED` retorna sucesso sem nova liberacao. |
| qualquer mutacao | `SOLD`/`CANCELLED` | bloqueado | Nenhum movimento. | `409 Conflict`, exceto retries de complete/cancel no mesmo estado final. |

## Regras de estoque

`Stock.current_stock_kg` representa estoque disponivel, isto e, coletado e ainda nao vendido nem reservado por venda coletiva ativa.

`Stock.total_sold_kg` representa peso consolidado como vendido, seja venda normal concluida ou contribuicao coletiva concluida.

Uma contribuicao com `status = 'LEFT'` ou uma venda coletiva `SOLD`/`CANCELLED` pode manter `contributed_weight` para auditoria, mas esse peso nao compoe reserva ativa. Reserva ativa sempre filtra sale `ACTIVE` e contribuicao `ACCEPTED`.

| Evento | `current_stock_kg` | `total_sold_kg` | Observacao |
| --- | --- | --- | --- |
| Pesagem/material coletado | `+ amount` | sem mudanca | Tambem incrementa `total_collected_kg`. |
| Venda normal criada | sem mudanca | sem mudanca | Sale fica ativa. |
| Venda normal concluida | `- weight` | `+ weight` | Debito atomico se `current_stock_kg >= weight`. |
| Venda normal cancelada | sem mudanca | sem mudanca | Nada foi reservado. |
| Contribuicao coletiva aumenta | `- delta` | sem mudanca | Reserva atomica se `current_stock_kg >= delta`. |
| Contribuicao coletiva diminui | `+ abs(delta)` | sem mudanca | Libera reserva. |
| Cooperativa sai da coletiva | `+ contributed_weight` | sem mudanca | Reserva deixa de existir. |
| Coletiva cancelada | `+ sum(active contributions)` | sem mudanca | Libera reservas. |
| Coletiva concluida | sem mudanca | `+ contributed_weight` por cooperativa | Reserva vira venda. |

Invariantes:

| Invariante | Formula |
| --- | --- |
| Estoque nao negativo | `current_stock_kg >= 0` sempre. |
| Linha unica de estoque | Uma linha por `(cooperative, material)`. |
| Conservacao por material/cooperativa | `total_collected_kg = current_stock_kg + total_sold_kg + active_reserved_kg`. |
| Reserva ativa | `active_reserved_kg = SUM(contributed_weight)` apenas de coletivas `ACTIVE` e contribuicoes `ACCEPTED`. |
| Venda coletiva concluida | `total_weight = SUM(contributed_weight)` das contribuicoes `ACCEPTED` com peso positivo no momento do complete. |
| Receita coletiva | `SUM(revenue_share) = round2(total_weight * price_kg)`. |

## Validacoes de entrada

| Campo/evento | Regra |
| --- | --- |
| Venda normal `weight` | Obrigatorio, `> 0`, no maximo 2 casas decimais. |
| Venda normal `price_kg` | Obrigatorio, `> 0`, no maximo 2 casas decimais. |
| Venda coletiva `price_kg` | Obrigatorio, `> 0`, no maximo 2 casas decimais. |
| Contribuicao coletiva `contributed_weight` | Obrigatoria, `>= 0`, no maximo 2 casas decimais. |
| Complete coletivo | Exige `total_weight > 0` e pelo menos uma contribuicao `ACCEPTED` positiva. |
| Multipliers | Devem ser positivos; intervalo operacional recomendado: `0.0001` a `9.9999` ate ADR de gamificacao ajustar limites. |

Valores negativos devem ser rejeitados antes de qualquer transacao de estoque. Peso zero so e valido para zerar/liberar contribuicao coletiva ainda `ACTIVE`; nao e valido para completar venda normal nem coletiva.

Operacoes que alteram estoque devem rodar em transacao. Para evitar concorrencia, usar update condicional atomico ou lock de linha equivalente:

```sql
UPDATE "Stock"
SET "Current_stock_KG" = "Current_stock_KG" - :delta
WHERE "Cooperative" = :cooperativeId
  AND "Material" = :materialId
  AND "Current_stock_KG" >= :delta;
```

Se o update afetar zero linhas em delta positivo, responder estoque insuficiente e nao alterar sale/contribution.

## Escalas Decimal

| Campo | Escala | Armazenamento alvo | Arredondamento |
| --- | --- | --- | --- |
| Peso (`weight`, `contributed_weight`, `total_weight`) | 2 casas kg | `numeric(..., 2)` / `Decimal` | Validar entrada com no maximo 2 casas; rejeitar excesso. |
| Estoque (`current`, `sold`, `collected`) | 2 casas kg | `numeric(..., 2)` / `Decimal` | Operacoes atomicas com Decimal. |
| Preco por kg (`price_kg`) | 2 casas BRL/kg | `numeric(..., 2)` / `Decimal` | Validar entrada com no maximo 2 casas. |
| Receita (`revenue_share`, total) | 2 casas BRL | `numeric(..., 2)` / `Decimal` | `ROUND_HALF_UP` para centavos. |
| Multipliers | 4 casas | Preferir `numeric(..., 4)`; se tabela legado usar `double`, converter para `Decimal` antes de calcular | Calcular com Decimal e arredondar XP final conforme ADR de gamificacao. |

Regra de borda: APIs aceitam string decimal canonica (`"12.34"`) ou numero JSON, mas convertem imediatamente para `Decimal`. Respostas financeiras devem sair como string ou number ja arredondado para a escala do campo; reports PDF usam os valores persistidos.

## Formula de `revenue_share`

No complete coletivo:

Definicao: `round2(x)` significa arredondar para 2 casas decimais com `ROUND_HALF_UP`.

1. Selecionar contribuicoes `ACCEPTED` com `contributed_weight > 0`.
2. `total_weight = sum(contributed_weight)`.
3. `gross_revenue = round2(total_weight * price_kg)`.
4. Para cada cooperativa: `exact_share_i = contributed_weight_i * price_kg`.
5. `provisional_share_i = round2(exact_share_i, HALF_UP)`.
6. `delta = gross_revenue - sum(provisional_share_i)`.
7. Se `delta != 0`, distribuir centavos de sobra:
   - `delta > 0`: adicionar `0.01` aos maiores restos fracionarios positivos.
   - `delta < 0`: subtrair `0.01` dos menores restos/maiores arredondamentos.
   - Empate: maior `contributed_weight`; depois menor `cooperative_id`.
8. Persistir `revenue_share_i`.

Nenhum report deve recalcular `revenue_share` se o valor persistido existir.

## Exemplos de rateio

| Caso | Contribuicoes kg | Preco kg | Receita total | Shares |
| --- | --- | --- | --- | --- |
| 1 cooperativa | A: `100.00` | `2.50` | `250.00` | A: `250.00` |
| 2 cooperativas | A: `40.00`, B: `60.00` | `2.50` | `250.00` | A: `100.00`, B: `150.00` |
| 3 cooperativas com sobra | A: `0.33`, B: `0.33`, C: `0.34` | `0.01` | `0.01` | A: `0.00`, B: `0.00`, C: `0.01` |
| N cooperativas | `w1..wn` | `p` | `round2(sum(wi) * p)` | `round2(wi * p)` ajustado por centavos ate somar o total |

## Idempotencia e retries

| Operacao | Resposta a retry apos sucesso | Protecao contra efeito duplicado |
| --- | --- | --- |
| Normal complete | `204`/`200` se ja `SOLD` | Debito de estoque so ocorre em transicao `ACTIVE -> SOLD`. |
| Normal cancel | `204`/`200` se ja `CANCELLED` | Cancel nao movimenta estoque. |
| Coletiva contribution | `200` se mesmo peso | Delta calculado contra peso persistido. |
| Coletiva leave | `204`/`200` se ja `LEFT` | Liberacao so ocorre quando status anterior era `ACCEPTED` e sale `ACTIVE`. |
| Coletiva cancel | `204`/`200` se ja `CANCELLED` | Liberacao so ocorre na transicao `ACTIVE -> CANCELLED`. |
| Coletiva complete | `204`/`200` se ja `SOLD` | `total_sold_kg` e `revenue_share` so persistem na transicao `ACTIVE -> SOLD`. |

Retries de mutacoes que mudariam payload financeiro apos `SOLD` ou `CANCELLED` devem retornar `409 Conflict`.

## Implicacoes para migrations e APIs

- `Sales` precisa receber `created_at`, `sold_at`, `cancelled_at`, `cooperative_id` e `expected_sale_date`.
- `Stock` precisa de unique `(Cooperative, Material)` e check `Current_stock_KG >= 0`.
- Vendas coletivas precisam de checks equivalentes para estado, peso nao negativo e `price_kg > 0`.
- APIs antigas que deletam venda devem virar `cancel`, nao `DELETE` destrutivo.
- Implementacao deve trocar calculos com `Number`/`toFixed` em rotas de dominio por `Decimal`.
- Reports JSON/PDF devem ler `sold_at`, `cancelled_at`, `total_weight` e `revenue_share` persistidos.

## Backfill de vendas legadas

As vendas normais existentes no Next ja tiveram estoque baixado no momento do create. Portanto, a migration que adicionar lifecycle em `Sales` deve classificar essas linhas como historico consolidado, nao como `ACTIVE`.

Backfill obrigatorio para cada linha existente em `"Sales"`:

1. `created_at = COALESCE("Date"::timestamp, now())`.
2. `sold_at = COALESCE("Date"::timestamp, created_at)`.
3. `cancelled_at = NULL`.
4. `cooperative_id = "Workers"."Cooperative"` via `"Responsible" -> "Workers"."Worker_id"`.
5. `expected_sale_date = COALESCE("Date"::timestamp, created_at)`.

Preflight obrigatorio antes do backfill:

- Toda venda precisa ter responsible valido e cooperativa derivavel.
- `weight > 0` e `price_kg > 0` para todas as vendas existentes, ou a migration deve abortar e listar os IDs invalidos.
- Para cada `(cooperative_id, material)`, `SUM("Sales"."Weight")` deve ser menor ou igual a `Stock.total_sold_kg` dentro de tolerancia de `0.01`, pois esse estoque ja foi debitado no legado.
- Se houver venda legada sem linha de `Stock`, a migration deve abortar; nao criar estoque retroativo silenciosamente.

Se algum ambiente tiver vendas legadas ainda nao debitadas, ele nao pode usar este backfill padrao. Nesse caso, o cutover deve executar uma reconciliation manual documentada antes de aplicar as APIs novas.

## Testes obrigatorios nas tasks de implementacao

- Venda normal: create nao mexe estoque; complete baixa uma vez; retry de complete nao baixa duas vezes; cancel active nao mexe estoque; cancel sold falha.
- Backfill legado: vendas existentes viram `SOLD`, nunca `ACTIVE`, e nao sofrem novo debito de estoque.
- Validade Decimal: rejeitar peso/preco zero ou negativo onde proibido; permitir contribution `0.00` apenas para liberar reserva ativa.
- Estoque concorrente: duas completes simultaneas nao podem deixar `current_stock_kg < 0`.
- Coletiva: increase/decrease contribution reserva/libera por delta; material/preco nao mudam com reserva positiva; leave libera uma vez; cancel libera todas as reservas uma vez; complete soma `total_sold_kg` sem mexer em `current_stock_kg`.
- Rateio: casos de 1, 2, 3 e N cooperativas, incluindo sobra de centavos.
- Invariantes: `current_stock_kg >= 0`, conservacao de estoque e `SUM(revenue_share) = gross_revenue`.

## Evidencias desta ADR

- S0-01 registrou divergencia entre create atual do Next e complete da referencia Java.
- S0-02 definiu estrategia de schema aditiva, permitindo lifecycle em `Sales` sem renomeacao destrutiva.
- Repositorio Java foi conferido em `SalesService`, `SalesRepository`, `CollectiveSaleService`, `CollectiveSaleRepository`, `StockRepository` e reports.
