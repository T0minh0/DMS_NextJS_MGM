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

## `GET /api/reports/period`

Relatorio do periodo em JSON. Alimenta a pagina `/dashboards`; os dois PDFs (`/api/reports/pdf/period` e `/api/reports/pdf/worker/[workerId]`) chamam o mesmo builder (`src/lib/reports/period-report.ts`), entao graficos, tabelas e PDFs mostram os mesmos numeros.

### Query params

| Param | Formato | Default | Observacao |
| --- | --- | --- | --- |
| `year_month` | `AAAA-MM` | mes atual em America/Sao_Paulo | ignorado quando `from`/`to` sao informados; invalido -> `400 INVALID_YEAR_MONTH` |
| `from`, `to` | `AAAA-MM-DD` (ambos, `to` inclusivo) | - | invalido -> `400 INVALID_PERIOD`; `to < from` ou > 366 dias -> `400 INVALID_PERIOD_RANGE` |
| `worker_id` | `5` ou `WP005` | - | invalido -> `400 INVALID_WORKER_ID`; fora da cooperativa -> `404 WORKER_NOT_FOUND`; gera a variante `worker-period` |
| `material_id` | id ou `group_<Nome>` | - | invalido -> `400 INVALID_MATERIAL`; grupo vazio -> `200` com secoes vazias |
| `cooperative_id` | id | cooperativa da sessao | admin pode escolher; gerente de outra cooperativa -> `403 COOPERATIVE_SCOPE_DENIED` |

### Regras

- Auth `requireManagerOrAdmin` + `reports:read` no escopo `cooperative`.
- Medicoes com delta zero (`Weight_KG = 0`) sao excluidas para que contagens e totais batam.
- Colunas `DATE` (`Measurments.Time_stamp`, `Sales.Date`) sao tratadas como meia-noite UTC; limites do periodo usam `Date.UTC` e datas-so sao formatadas com `timeZone: 'UTC'`.
- Vendas do periodo usam `SOLD_SALE_WHERE` e sao limitadas por `Sales.Date` (mesma coluna de `/api/earnings-comparison`). `/api/revenue` usa `sold_at`, entao os valores podem divergir em viradas de mes.
- Estoque e um snapshot atual (nao historico), marcado com `generated_at`.

### Retorno

`{ report: { kind, cooperative, period{year_month, from, to, label}, generated_at, generated_by{name, role}, filters{worker, material_ids, material_label}, summary{collected_kg, collections_count, active_workers, worked_days, sold_kg, sales_count, revenue_brl, stock_kg}, by_material[], by_worker[], daily[], sales[], stock[], worker_daily[] } }`. Na variante `worker-period`, `sales` e `by_worker` ficam vazios e `worker_daily` traz a quebra por dia e material. Nenhum documento pessoal e retornado (apenas `WP` id e nome).
