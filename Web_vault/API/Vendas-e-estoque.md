# API - Vendas e estoque

ADR vigente para lifecycle e estoque: [[ADR/ADR-0002-lifecycle-vendas-estoque-decimal]].

Desde S5-07, este documento registra o estado atual do Next como contrato canonico para substituir o `network_management_system`. A rota coletiva Java singular `/api/collective-sale` fica historica; o Next usa `/api/collective-sales`.

## `GET /api/stock`

Arquivo: `src/app/api/stock/route.ts`.

Query params:

| Param | Tipo | Observacao |
| --- | --- | --- |
| `material_id` | BigInt ou `group_{nome}` | Opcional |
| `cooperative_id` | BigInt | Admin opcional; manager fica limitado a propria cooperativa |

Regras:

- Requer `manager` ou `admin`.
- Soma `currentStockKg` por material.
- `admin` visualiza estoque global ou cooperativa alvo.
- `manager` visualiza apenas a propria cooperativa.
- Material invalido retorna `400`.

## `POST /api/stock`

Arquivo: `src/app/api/stock/route.ts`.

Adiciona estoque manualmente para a cooperativa alvo. Requer `manager` ou `admin` e permissao `stock:manage:cooperative`.

A tela `/materials` usa `POST /api/stock` para ajuste manual de estoque da cooperativa da sessao, sempre mostrando confirmacao de impacto antes do envio. Ajuste manual negativo, ajuste absoluto, motivo persistido ou trilha auditavel dedicada continuam fora deste endpoint e devem virar tarefa propria se forem exigidos operacionalmente.

Body:

| Campo | Obrigatorio | Observacao |
| --- | --- | --- |
| `materialId` ou `material_id` | Sim | BigInt |
| `amount` | Sim | Decimal positivo com ate 2 casas |
| `cooperative_id` | Admin opcional | Manager fica limitado a propria cooperativa |

Efeitos:

- Valida cooperativa e material.
- Usa `addToStock` com `ON CONFLICT ("Cooperative", "Material")`.
- Cria linha de `Stock` quando nao existe.
- Incrementa `totalCollectedKg` e `currentStockKg`.

## `POST /api/insertMaterial`

Arquivo: `src/app/api/insertMaterial/route.ts`.

Porta o fluxo Java de pesagem acumulada. Requer sessao autenticada com role `worker`; a web gerencial continua focada em gestores, mas esta rota preserva o contrato operacional de coleta/dispositivo.

Body:

| Campo | Obrigatorio | Observacao |
| --- | --- | --- |
| `materialId` ou `material_id` | Sim | BigInt |
| `amount` | Sim | Decimal positivo com ate 2 casas; leitura acumulada do saco |
| `measuredAt`, `measured_at`, `timeStamp` ou `time_stamp` | Sim | Data/hora ISO posterior a ultima leitura aceita |
| `deviceId` ou `device_id` | Sim | BigInt; precisa pertencer a cooperativa da sessao |
| `workerId` ou `worker_id` | Nao | Se enviado, deve ser o proprio worker da sessao |
| `bagFull` ou `bag_full` | Nao | Booleano; `false` por padrao |

Efeitos:

- Bloqueia `material_bag_state` com `FOR UPDATE`.
- Calcula delta como `max(amount - current_kg anterior, 0)`.
- Rejeita leitura acumulada regressiva sem `bagFull=true`.
- Rejeita leitura stale/out-of-order.
- Cria `Measurments` com o delta calculado.
- Atualiza `material_bag_state`.
- Incrementa `Stock.totalCollectedKg` e `Stock.currentStockKg` apenas pelo delta positivo.

## `POST /api/collections`

Registro de coleta pelo portal, em nome de um catador, com a mesma semantica do app mobile (leitura acumulada do saco + `bag_full`). Exige `manager`/`admin` (`requireManagerOrAdmin`) e `stock:create` no escopo `cooperative`; a cooperativa vem de `cooperative_id` (admin) ou da sessao.

- Body: `worker_id` (obrigatorio, catador ativo da cooperativa; usuarios do tipo gerente/admin sao rejeitados), `material_id`, `amount` (leitura acumulada em kg, 2 casas), `bag_full` (opcional, default `false`), `measured_at` (opcional; default `now()` no servidor). A UI so envia `measured_at` quando o operador altera a data, porque `material_bag_state.last_updated` guarda hora e uma data `YYYY-MM-DD` de hoje seria anterior a uma pesagem mobile do mesmo dia.
- O dispositivo e resolvido automaticamente (`resolveCooperativeDevice`: primeiro `Devices` da cooperativa, criado se nao existir), como no backend mobile.
- Reusa `recordMaterialWeighing`: lock de `material_bag_state`, `calculateBagStateDelta`, delta gravado em `Measurments`, `addToStock` quando delta > 0.
- Respostas: `201` `{ success, message, worker_name, measurement, bag_state, collected_delta_kg, stock }`; `400` campos invalidos; `403` `MANAGER_ROLE_REQUIRED` / `WORKER_SCOPE_DENIED`; `422` `WORKER_NOT_FOUND` / `WORKER_INACTIVE` / `WORKER_ROLE_REQUIRED` / `MATERIAL_NOT_FOUND` / leitura regressiva sem `bag_full` / `measured_at` anterior a ultima leitura.

## `GET /api/collections`

Lista as coletas da cooperativa (escopo via `wastepickerRef.cooperative`, pois `Measurments` nao tem coluna de cooperativa).

- Query: `from`/`to` (`YYYY-MM-DD`, inclusivo; default ultimos 7 dias), `worker_id` (`5` ou `WP005`), `material_id`, `limit` (default 100, max 500), `cooperative_id` (admin).
- Resposta: `{ collections: [{ id, worker_id, wastepicker_id, worker_name, material_id, material_name, weight_kg, bag_full, date }], count, total_weight_kg, from, to, limit }`. `weight_kg` e o delta coletado (nao a leitura acumulada).

## `GET /api/collections/bag-state`

Estado atual do saco de `(cooperativa, material)` para orientar o operador antes de registrar. Query: `material_id`, `cooperative_id` (admin). Resposta: `{ material_id, cooperative_id, is_begun, current_kg, last_updated | null }`.

## `GET /api/sales`

Arquivo: `src/app/api/sales/route.ts`.

Lista vendas normais escopadas.

Query params:

| Param | Tipo | Observacao |
| --- | --- | --- |
| `material_id` | BigInt | Opcional |
| `cooperative_id` | BigInt | Admin opcional; manager limitado a propria cooperativa |
| `start_date` | Date | Opcional |
| `end_date` | Date | Opcional |
| `status` | `ACTIVE`, `HISTORY`, `CANCELLED` | `HISTORY` representa vendas `SOLD` |
| `limit` | number | Padrao `100` |

Retorno inclui `status`, `created_at`, `sold_at`, `cancelled_at`, `expected_sale_date` e `summary` somente com vendas consolidadas para receita/peso.

## `POST /api/sales`

Arquivo: `src/app/api/sales/route.ts`.

Cria venda normal `ACTIVE`. A venda nao baixa estoque no create; estoque e debitado apenas no complete.

Body:

| Campo | Obrigatorio | Observacao |
| --- | --- | --- |
| `material_id` | Sim | BigInt |
| `price/kg` | Sim | Decimal positivo com ate 2 casas |
| `weight_sold` | Sim | Decimal positivo com ate 2 casas |
| `date` | Sim | Usada como `expected_sale_date` |
| `Buyer` | Sim | Comprador; criado se nao existir |
| `cooperative_id` | Admin opcional | Manager ignora payload e usa sessao |
| `responsible_worker_id` | Admin opcional | Responsavel precisa pertencer a cooperativa alvo |

## `PUT /api/sales/[id]`

Arquivo: `src/app/api/sales/[id]/route.ts`.

Atualiza venda normal `ACTIVE`. Requer `manager` ou `admin`, permissao de update e escopo por cooperativa.

Regras:

- `admin` pode alterar globalmente; `manager` apenas a propria cooperativa.
- Material nao pode ser alterado.
- Vendas `SOLD` ou `CANCELLED` retornam `409 SALE_LIFECYCLE_LOCKED`.

## `PATCH /api/sales/[id]/complete`

Arquivo: `src/app/api/sales/[id]/complete/route.ts`.

Conclui venda normal `ACTIVE`, baixa `Stock.currentStockKg` uma vez e incrementa `Stock.totalSoldKg`.

Regras:

- Requer `manager` ou `admin`.
- Usa transacao e update condicional atomico para estoque.
- Retry em venda ja `SOLD` e idempotente.
- Venda `CANCELLED` retorna conflito.

## `PATCH /api/sales/[id]/cancel`

Arquivo: `src/app/api/sales/[id]/cancel/route.ts`.

Cancela venda normal `ACTIVE`.

Regras:

- Requer `manager` ou `admin`.
- Retry em venda ja `CANCELLED` e idempotente.
- Venda `SOLD` retorna conflito.
- Nao movimenta estoque, porque create nao reserva.

## `DELETE /api/sales/[id]`

Arquivo: `src/app/api/sales/[id]/route.ts`.

Exclusao destrutiva foi removida. A rota retorna `405 METHOD_NOT_ALLOWED` e instrui o uso de `PATCH /api/sales/{id}/cancel`.

## Compradores

### `GET /api/buyers`

Arquivo: `src/app/api/buyers/route.ts`.

Rota canonica para listar compradores como objetos estruturados com `_id` e `name`.

### `POST /api/buyers`

Cria comprador por nome, bloqueando duplicidade case-insensitive.

### `GET /api/sales/buyers` e `POST /api/sales/buyers`

Arquivo: `src/app/api/sales/buyers/route.ts`.

Alias legado ainda suportado para fluxos de venda. Preferir `/api/buyers` em novas integracoes.

## Vendas coletivas

Schema: `CollectiveSale` (`collective_sale`) e `CollectiveSaleContribution` (`collective_sale_contribution`).

Rota canonica Next: `/api/collective-sales`.

| Metodo | Rota | Arquivo | Contrato |
| --- | --- | --- | --- |
| `GET` | `/api/collective-sales` | `src/app/api/collective-sales/route.ts` | Lista por `status=ACTIVE/SOLD/CANCELLED`; admin ve tudo, manager ve creator ou participante `ACCEPTED`. |
| `POST` | `/api/collective-sales` | `src/app/api/collective-sales/route.ts` | Cria venda coletiva e adiciona creator como `ACCEPTED`. |
| `GET` | `/api/collective-sales/invitations` | `src/app/api/collective-sales/invitations/route.ts` | Lista convites pendentes da cooperativa autenticada. |
| `PATCH` | `/api/collective-sales/[id]` | `src/app/api/collective-sales/[id]/route.ts` | Atualiza material/preco enquanto a venda esta aberta e sem reserva bloqueante. |
| `POST` | `/api/collective-sales/[id]/invite` | `src/app/api/collective-sales/[id]/invite/route.ts` | Creator/admin convida outra cooperativa; bloqueia convite para propria coop e duplicidade. |
| `POST` | `/api/collective-sales/[id]/join` | `src/app/api/collective-sales/[id]/join/route.ts` | Aceita convite; retry quando ja `ACCEPTED` e idempotente. |
| `PATCH` | `/api/collective-sales/[id]/contribution` | `src/app/api/collective-sales/[id]/contribution/route.ts` | Reserva/devolve estoque por delta de `contributed_weight`. |
| `POST` | `/api/collective-sales/[id]/leave` | `src/app/api/collective-sales/[id]/leave/route.ts` | Participante sai e devolve reserva; creator nao pode sair. |
| `POST` | `/api/collective-sales/[id]/cancel` | `src/app/api/collective-sales/[id]/cancel/route.ts` | Creator/admin cancela e devolve reservas ativas. |
| `POST` | `/api/collective-sales/[id]/complete` | `src/app/api/collective-sales/[id]/complete/route.ts` | Creator/admin conclui, grava `sold_at`, `total_weight`, `revenue_share` e incrementa `totalSoldKg`. |

Observacoes:

- O Java ja tinha `PATCH /api/collective-sale/{saleId}/complete`; o Next preserva a capacidade em `POST /api/collective-sales/[id]/complete`, usando path plural, resposta estruturada e idempotencia explicita.
- Estoque coletivo e reservado na contribuicao e convertido para vendido no complete sem mexer de novo em `currentStockKg`.
- Reports usam `revenue_share` persistido quando existir.

## Reports JSON e PDF

| Metodo | Rota | Arquivo |
| --- | --- | --- |
| `GET` | `/api/reports/sales/normal/[saleId]` | `src/app/api/reports/sales/normal/[saleId]/route.ts` |
| `GET` | `/api/reports/sales/collective/[saleId]` | `src/app/api/reports/sales/collective/[saleId]/route.ts` |
| `GET` | `/api/reports/pdf/normal-sale/[saleId]` | `src/app/api/reports/pdf/normal-sale/[saleId]/route.ts` |
| `GET` | `/api/reports/pdf/collective-sale/[saleId]` | `src/app/api/reports/pdf/collective-sale/[saleId]/route.ts` |

Regras:

- Requer `manager` ou `admin` com `sales.read`.
- Manager so le vendas da propria cooperativa ou coletivas onde e creator/participante aceito.
- PDF usa `src/lib/reports/pdf.tsx`, `application/pdf`, `%PDF`, filename sanitizado e `Cache-Control: no-store`.
