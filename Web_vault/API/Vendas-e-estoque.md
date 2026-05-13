# API - Vendas e estoque

ADR vigente para a reforma: [[ADR/ADR-0002-lifecycle-vendas-estoque-decimal]]. As rotas atuais ainda refletem o legado em que a venda normal baixa estoque no create/update/delete; novas rotas devem usar `ACTIVE`, `SOLD`, `CANCELLED`, complete/cancel idempotentes e estoque transacional.

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

## `GET /api/sales`

Arquivo: `src/app/api/sales/route.ts`

### Query params

| Param | Tipo | Observacao |
| --- | --- | --- |
| `material_id` | BigInt | Opcional |
| `cooperative_id` | BigInt | Filtra pela cooperativa do responsavel |
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
      "price/kg": 1.35,
      "weight_sold": 120,
      "date": "2024-02-12T00:00:00.000Z",
      "Buyer": "Comprador"
    }
  ],
  "summary": {
    "totalSales": 1,
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
- Cria `Sales`.
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

## Observacoes de consistencia

- `POST /api/sales` ignora `cooperative_id` enviado pelo cliente e usa a cooperativa do gerente autenticado.
- `admin` pode informar `cooperative_id` e `responsible_worker_id`; o responsavel precisa pertencer a cooperativa alvo.
- O frontend tambem valida estoque antes de enviar, mas a regra efetiva esta na API.
- Os endpoints de venda usam os helpers compartilhados de JWT/RBAC e rejeitam token ausente, adulterado ou expirado.
