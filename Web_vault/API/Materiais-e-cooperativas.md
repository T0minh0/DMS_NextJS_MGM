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

## Uso pelas telas

- `/materials`: CRUD completo.
- `/`: filtros e graficos.
- `/sales`: selecao de material.
- `/worker-productivity`: nomes de materiais via endpoint de produtividade.
