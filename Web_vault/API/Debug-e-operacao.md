# API - Debug e operacao

## `POST /api/recalculate-contributions`

Arquivo: `src/app/api/recalculate-contributions/route.ts`

Recalcula `Worker_contributions` a partir de todas as linhas de `Measurments`. Requer `admin` e permissao `reports:recalculate:global`.

### Fluxo

1. Busca todas as medicoes.
2. Converte `Decimal` para number.
3. Agrupa por worker/material/dia.
4. Calcula contribuicao diaria:
   - se ha medicao com `bagFilled`, usa o peso dessa medicao;
   - caso contrario, usa o maior peso do dia.
5. Agrupa por semana ISO e ano.
6. Busca cooperativa de cada worker.
7. Apaga todas as contribuicoes com `deleteMany`.
8. Insere novas linhas via SQL raw com `daterange`.

### Retorno

```json
{
  "message": "Worker contributions recalculated successfully",
  "statistics": {
    "totalMeasurements": 10,
    "dailyContributions": 5,
    "weeklyContributions": 3,
    "totalWorkers": 2,
    "totalMaterials": 2,
    "totalWeight": 123.45
  },
  "processed": 3
}
```

### Riscos

- Operacao destrutiva para `Worker_contributions`.
- Nao ha transacao explicita envolvendo delete + inserts.
- Frontend espera `statistics.totalEarnings`, mas o endpoint nao retorna esse campo.

## `GET /api/debug/check-data`

Arquivo: `src/app/api/debug/check-data/route.ts`

Retorna diagnostico de:

- Catadores (`Workers` com `userType: '1'`).
- Medicoes.
- Contribuicoes.
- Materiais.

Inclui contagens e ate 3 amostras por grupo.

Requer `admin`.

## `GET /api/debug/collections`

Arquivo: `src/app/api/debug/collections/route.ts`

Retorna lista de colecoes/modelos principais e uma amostra de cada:

- `Workers`
- `Materials`
- `Sales`
- `Measurments`
- `Stock`
- `WorkerContributions`

Requer `admin`.

## `GET /api/debug/wastepickers`

Arquivo: `src/app/api/debug/wastepickers/route.ts`

Endpoint diagnostico que tenta encontrar:

- Worker por `workerId = 5`.
- Worker por CPF `56789012345`.

Tambem retorna lista de nomes de modelos Prisma esperados.

Requer `admin`.

## `GET /api/debug/create-test-user`

Arquivo: `src/app/api/debug/create-test-user/route.ts`

Cria ou atualiza usuario de teste. Requer `admin`.

### Protecao

Bloqueia em producao:

```ts
if (process.env.NODE_ENV === 'production') return 403
```

### Credenciais criadas

| Campo | Valor |
| --- | --- |
| CPF | `12345678900` |
| Senha | `test123` |
| Tipo | `1` |

Observacao: tipo `1` e catador; o login principal aceita apenas gerente, entao esse usuario nao entra no dashboard pelo fluxo atual.
