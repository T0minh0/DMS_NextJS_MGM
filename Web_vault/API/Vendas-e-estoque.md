# API - Vendas e estoque

ADR vigente para a reforma: [[ADR/ADR-0002-lifecycle-vendas-estoque-decimal]]. Desde S1-01, `Sales` persiste lifecycle (`ACTIVE`, `SOLD`, `CANCELLED`) e `cooperative_id` direto. As rotas atuais ainda preservam o legado em que a venda normal baixa estoque no create/update/delete; S2-01 deve portar `complete`/`cancel` idempotentes e separar create de baixa de estoque.

## `GET /api/stock`

Arquivo: `src/app/api/stock/route.ts`

### Query params

| Param | Tipo | Observacao |
| --- | --- | --- |
| `material_id` | BigInt ou `group_{nome}` | Opcional |

### Retorno

Sem erro, retorna objeto por nome de material:

```json
{
  "Papelão": 170
}
```

Sem dados, retorna:

```json
{
  "noData": true,
  "message": "..."
}
```

### Regras

- Soma `currentStockKg` por material.
- Para grupo, resolve todos os materiais do grupo.
- Material invalido retorna `400`.
- `admin` visualiza estoque global; `manager` visualiza apenas a propria cooperativa.

## `POST /api/stock`

Arquivo: `src/app/api/stock/route.ts`

Adiciona estoque manualmente para a cooperativa alvo. Requer `manager` ou `admin` e permissao `stock:manage:cooperative`.

### Body

| Campo | Obrigatorio | Observacao |
| --- | --- | --- |
| `materialId` ou `material_id` | Sim | BigInt |
| `amount` | Sim | Decimal positivo com ate 2 casas |
| `cooperative_id` | Admin opcional | Manager fica limitado a propria cooperativa |

### Efeitos

- Valida cooperativa e material.
- Usa `addToStock` com `ON CONFLICT ("Cooperative", "Material")`.
- Cria linha de `Stock` quando nao existe.
- Incrementa `totalCollectedKg` e `currentStockKg` quando a linha ja existe.

### Retorno

```json
{
  "success": true,
  "message": "Estoque atualizado com sucesso",
  "stock": {
    "id": "1",
    "total_collected_kg": 3.75,
    "total_sold_kg": 0,
    "current_stock_kg": 3.75
  }
}
```

### Erros

- `400`: JSON invalido ou nao-objeto, material ou amount invalido.
- `403`: gestor tentando atuar fora do escopo.
- `422`: cooperativa/material inexistente ou invariant de estoque violada.
- `500`: falha inesperada, logada como `stock.create.failed`.

## `GET /api/sales`

Arquivo: `src/app/api/sales/route.ts`

### Query params

| Param | Tipo | Observacao |
| --- | --- | --- |
| `material_id` | BigInt | Opcional |
| `cooperative_id` | BigInt | Filtra por `Sales.cooperative_id`; manager fica limitado a propria cooperativa |
| `start_date` | Date | Opcional |
| `end_date` | Date | Opcional |
| `limit` | number | Padrao `100` |

### Retorno

```json
{
  "sales": [
    {
      "_id": "1",
      "material_id": "1",
      "cooperative_id": "1",
      "status": "SOLD",
      "price/kg": 1.35,
      "weight_sold": 120,
      "date": "2024-02-12T00:00:00.000Z",
      "created_at": "2024-02-12T00:00:00.000Z",
      "sold_at": "2024-02-12T00:00:00.000Z",
      "cancelled_at": null,
      "expected_sale_date": "2024-02-12T00:00:00.000Z",
      "Buyer": "Comprador"
    }
  ],
  "summary": {
    "totalSales": 1,
    "totalSoldSales": 1,
    "totalWeight": 120,
    "totalValue": 162
  }
}
```

## `POST /api/sales`

Cria venda. Requer JWT valido no cookie.

### Body

| Campo | Obrigatorio | Observacao |
| --- | --- | --- |
| `material_id` | Sim | BigInt |
| `price/kg` | Sim | Maior que zero |
| `weight_sold` | Sim | Maior que zero |
| `date` | Sim | Date valido |
| `Buyer` | Sim | Comprador; criado se nao existir |

### Efeitos

- Cria comprador se necessario.
- Cria `Sales` com `cooperative_id`, `expected_sale_date` e, por compatibilidade legada, `sold_at` preenchido.
- Atualiza `Stock.totalSoldKg`.
- Atualiza `Stock.currentStockKg`.

### Bloqueios

- Sem gerente autenticado: `401`.
- Gestor tentando atuar fora da propria cooperativa: `403`.
- Sem estoque para material/cooperativa: `400`.
- Peso maior que estoque atual: `400`.

## `PUT /api/sales/[id]`

Arquivo: `src/app/api/sales/[id]/route.ts`

Atualiza venda. Requer JWT valido.

### Regras

- `admin` pode alterar globalmente; `manager` pode alterar vendas da propria cooperativa.
- Material nao pode ser alterado.
- Recalcula estoque usando peso antigo + estoque atual como disponibilidade.
- Atualiza preco, peso, data e comprador.

## `DELETE /api/sales/[id]`

Arquivo: `src/app/api/sales/[id]/route.ts`

Exclui venda. Requer JWT valido.

### Regras

- `admin` pode excluir globalmente; `manager` pode excluir vendas da propria cooperativa.
- Remove `Sales`.
- Devolve peso ao estoque atual.
- Reduz `totalSoldKg` com piso zero.

## `GET /api/sales/buyers`

Arquivo: `src/app/api/sales/buyers/route.ts`

Lista compradores ordenados por nome.

Retorno:

```json
{
  "buyers": ["Comprador A"],
  "count": 1
}
```

## `POST /api/sales/buyers`

Arquivo: `src/app/api/sales/buyers/route.ts`

Cria comprador.

### Body

```json
{ "buyer": "Nome" }
```

Bloqueia duplicado por comparacao case-insensitive.

## Schema de vendas coletivas

Desde S1-02, o Prisma possui os modelos `CollectiveSale` (`collective_sale`) e `CollectiveSaleContribution` (`collective_sale_contribution`) para suportar a portabilidade Java. A migration e aditiva, usa FKs para `Buyers`, `Materials` e `Cooperative`, e codifica checks de lifecycle, peso, preco, status e unicidade por venda/cooperativa.

Ainda nao ha endpoints Next para venda coletiva. As rotas `/api/collective-sale/*`, reserva/devolucao de estoque por contribuicao, completion/cancel e reports coletivos ficam para S3.

## Observacoes de consistencia

- `POST /api/sales` ignora `cooperative_id` enviado pelo cliente e usa a cooperativa do gerente autenticado.
- `admin` pode informar `cooperative_id` e `responsible_worker_id`; o responsavel precisa pertencer a cooperativa alvo.
- Enquanto S2-01 nao portar `complete`/`cancel`, `POST /api/sales` continua criando venda ja `SOLD` e baixando estoque no mesmo fluxo.
- Enquanto S2-01 nao portar `complete`/`cancel`, `PUT` e `DELETE` legados so operam vendas `SOLD`; vendas `ACTIVE` ou `CANCELLED` retornam `409 SALE_LIFECYCLE_LOCKED` para evitar corrupcao de estoque.
- Resumos e analytics de receita/preco consideram apenas vendas `SOLD`; a listagem ainda pode exibir `ACTIVE` e `CANCELLED` com status explicito.
- O frontend tambem valida estoque antes de enviar, mas a regra efetiva esta na API.
- Os endpoints de venda usam os helpers compartilhados de JWT/RBAC e rejeitam token ausente, adulterado ou expirado.
