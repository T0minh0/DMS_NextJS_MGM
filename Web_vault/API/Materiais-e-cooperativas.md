# API - Materiais e cooperativas

## `GET /api/cooperatives`

Arquivo: `src/app/api/cooperatives/route.ts`

Lista cooperativas ordenadas por `cooperativeName`. Requer `manager` ou `admin`; `manager` recebe apenas a propria cooperativa, `admin` recebe todas.

Retorno por item:

```json
{
  "_id": "1",
  "cooperative_id": "1",
  "name": "Cooperativa"
}
```

## `POST /api/cooperatives`

Cria cooperativa. Requer `admin`.

### Body

```json
{ "name": "Nome da cooperativa" }
```

### Erros

- `400`: nome ausente.
- `500`: erro interno.

## `GET /api/materials`

Arquivo: `src/app/api/materials/route.ts`

Lista materiais com grupos. Requer `manager` ou `admin`.

### Retorno

A resposta e um array misto:

1. Objetos de grupo:

```json
{
  "_id": "group-Papéis",
  "group": "Papéis",
  "isGroup": true
}
```

2. Objetos de material:

```json
{
  "_id": "1",
  "material_id": 1,
  "material": "Papelão",
  "name": "Papelão",
  "group": "Papéis"
}
```

Observacao: algumas telas esperam `material_id` como string; o endpoint retorna number.

## `POST /api/materials`

Cria material e grupo se necessario. Requer `admin`.

### Body

| Campo | Obrigatorio |
| --- | --- |
| `material` | Sim |
| `group` | Sim |

### Regras

- Nome de material duplicado e bloqueado por comparacao case-insensitive.
- Grupo existente e reutilizado por nome case-insensitive.
- Grupo inexistente e criado.

## `PUT /api/materials/[id]`

Arquivo: `src/app/api/materials/[id]/route.ts`

Atualiza material. Requer `admin`.

### Params

| Param | Tipo |
| --- | --- |
| `id` | BigInt em string |

### Body

| Campo | Obrigatorio |
| --- | --- |
| `material` | Sim |
| `group` | Sim |

### Regras

- `id` invalido retorna `400`.
- Material ausente retorna `404`.
- Bloqueia duplicidade de nome com outro material.
- Cria grupo se necessario.

## `DELETE /api/materials/[id]`

Arquivo: `src/app/api/materials/[id]/route.ts`

Remove material se nao houver uso. Requer `admin`.

### Bloqueios

A exclusao e bloqueada se houver qualquer vinculo em:

- `Measurments`
- `Sales`
- `collective_sale`
- `Stock`
- `WorkerContributions`

## `POST /api/insertMaterial`

Arquivo: `src/app/api/insertMaterial/route.ts`

Porta o fluxo Java de pesagem acumulada. Requer sessão autenticada com role `worker`; a web gerencial continua focada em gestores, mas esta rota preserva o contrato operacional de coleta/dispositivo.

### Body

| Campo | Obrigatorio | Observacao |
| --- | --- | --- |
| `materialId` ou `material_id` | Sim | BigInt |
| `amount` | Sim | Decimal positivo com ate 2 casas; leitura acumulada do saco |
| `measuredAt`, `measured_at`, `timeStamp` ou `time_stamp` | Sim | Data/hora ISO da captura no dispositivo; precisa ser posterior a ultima leitura aceita |
| `deviceId` ou `device_id` | Sim | BigInt; precisa pertencer a cooperativa da sessao |
| `workerId` ou `worker_id` | Nao | Se enviado, deve ser o proprio worker da sessao |
| `bagFull` ou `bag_full` | Nao | Booleano; `false` por padrao |

### Efeitos

- Bloqueia `material_bag_state` com `FOR UPDATE`.
- Calcula delta como `max(amount - current_kg anterior, 0)`.
- Rejeita leitura acumulada regressiva sem `bagFull=true`, para nao baixar `current_kg` e depois contar novamente o mesmo peso.
- Rejeita leitura stale/out-of-order quando `measuredAt` e menor ou igual a `material_bag_state.last_updated`; isso impede que uma leitura capturada antes de um reset `bagFull=true` seja aceita como inicio de novo saco.
- Cria linha em `Measurments` com o delta calculado e `timeStamp=measuredAt`.
- Atualiza `material_bag_state`; quando `bagFull=true`, zera `current_kg`, marca `is_begun=false` e grava `last_updated=measuredAt`.
- Incrementa `Stock.totalCollectedKg` e `Stock.currentStockKg` apenas pelo delta positivo.

### Erros

- `400`: JSON invalido ou nao-objeto, campo ausente, ID invalido, decimal invalido, `measuredAt` invalido ou `bagFull` nao booleano.
- `403`: role diferente de `worker`, worker enviado fora da sessao, worker/dispositivo fora da cooperativa.
- `422`: material, worker, dispositivo, linha de estoque inexistente, leitura regressiva sem reset ou leitura stale/out-of-order.
- `500`: falha inesperada, logada como `material.insert.failed`.

## Uso pelas telas

- `/materials`: CRUD completo.
- `/`: filtros e graficos.
- `/sales`: selecao de material.
- `/worker-productivity`: nomes de materiais via endpoint de produtividade.
