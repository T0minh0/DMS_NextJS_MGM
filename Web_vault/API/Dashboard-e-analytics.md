# API - Dashboard e analytics

## `GET /api/birthdays`

Arquivo: `src/app/api/birthdays/route.ts`

Lista aniversariantes do mes atual. Requer `manager` ou `admin`; `manager` ve apenas a propria cooperativa.

### Regras

- Consulta `Workers` via Prisma.
- Filtra mes de `Birth_date`.
- Filtra `User_type` em `1`, `W`, `C`.
- Ordena pelo dia do aniversario.

### Retorno

```json
[
  { "name": "Nome", "date": "12/04" }
]
```

## `GET /api/earnings-comparison`

Arquivo: `src/app/api/earnings-comparison/route.ts`

### Query params

| Param | Valores | Padrao |
| --- | --- | --- |
| `material_id` | BigInt ou `group_{nome}` | sem filtro |
| `period_type` | `weekly`, `monthly`, `yearly` | `monthly` |

### Regra

Calcula 6 periodos e soma `priceKg * weight` das vendas. `manager` fica restrito a propria cooperativa; `admin` pode ver global.

### Retorno

```json
[
  { "period": "abr.", "earnings": 123.45 }
]
```

Sem dados:

```json
{
  "noData": true,
  "message": "..."
}
```

## `GET /api/worker-collections`

Arquivo: `src/app/api/worker-collections/route.ts`

### Query params

| Param | Valores | Padrao |
| --- | --- | --- |
| `worker_id` | `WP001`, `1` ou similar | sem filtro |
| `material_id` | BigInt ou `group_{nome}` | sem filtro |
| `period_type` | `weekly`, `monthly`, `yearly` | `monthly` |

### Retorno normal

```json
{
  "grouped": false,
  "data": [
    {
      "wastepicker_id": "WP001",
      "worker_name": "Nome",
      "totalWeight": 100
    }
  ]
}
```

Autorizacao: `manager` ve apenas medicoes de workers da propria cooperativa; `admin` pode ver global.

### Retorno anual agrupado

Quando `period_type=yearly` e nao ha filtro de material:

```json
{
  "grouped": true,
  "workers": [
    {
      "wastepicker_id": "WP001",
      "worker_name": "Nome",
      "totalWeight": 100,
      "1": 60
    }
  ],
  "materials": [
    { "id": "1", "name": "Material" }
  ]
}
```

## `GET /api/price-fluctuation`

Arquivo: `src/app/api/price-fluctuation/route.ts`

### Query params

| Param | Valores | Padrao |
| --- | --- | --- |
| `material_id` | BigInt ou `group_{nome}` | sem filtro |

### Material individual

Retorna ate 10 vendas recentes do material, em ordem cronologica:

```json
[
  {
    "date": "2024-02-12T00:00:00.000Z",
    "material": "Papelão",
    "price": 1.35,
    "dateLabel": "12 fev 24",
    "timestamp": 1707696000000
  }
]
```

### Grupo

Agrupa por data e retorna preco medio do grupo. Inclui `materialsCount`.

### Sem filtro

Seleciona ate 5 materiais com venda mais recente e monta:

```json
{
  "materials": ["Papelão"],
  "priceData": [
    {
      "weekLabel": "12 fev 24",
      "date": "2024-02-12T00:00:00.000Z",
      "materials": {
        "Papelão": 1.35
      }
    }
  ]
}
```

Autorizacao: `manager` fica restrito a vendas da propria cooperativa; `admin` pode ver global.

## `GET /api/worker-productivity`

Arquivo: `src/app/api/worker-productivity/route.ts`

### Query params

| Param | Obrigatorio | Padrao |
| --- | --- | --- |
| `worker_id` | Sim | nenhum |
| `weeks` | Nao | `12` |

### Retorno

```json
{
  "weeklyContributions": [
    {
      "week": "2026W17",
      "weekStart": "20/04/2026",
      "weekEnd": "26/04/2026",
      "materials": {
        "1": {
          "materialName": "Papelão",
          "weight": 10,
          "measurements": []
        }
      },
      "totalWeight": 10
    }
  ],
  "stats": {
    "totalWeeks": 1,
    "totalWeight": 10,
    "averageWeekly": 10,
    "bestWeek": { "week": "2026W17", "weight": 10 },
    "topMaterials": []
  }
}
```

Sem medicoes retorna arrays vazios e stats zerados.

Autorizacao: `worker` ve apenas self; `manager` ve workers da propria cooperativa; `admin` pode consultar qualquer worker.
