# Observabilidade e logs

## Padrao

Logs estruturados usam JSON line em stdout/stderr para serem consumidos pelo terminal local e pelo coletor do provedor de deploy.

Campos base:

| Campo | Uso |
| --- | --- |
| `timestamp` | ISO datetime do evento |
| `level` | `info`, `warn` ou `error` |
| `event` | Nome do evento em formato `dominio.acao.resultado` |
| `requestId` | Correlation id da requisicao ou job |
| `domain` | `auth`, `stock`, `sales`, `job` ou `api` |
| `route` / `method` | Rota HTTP quando aplicavel |

O app aceita `x-request-id` ou `x-correlation-id`; quando ausente, gera um id novo. Respostas de erro padronizadas retornam o header `x-request-id`.

## Redacao

O helper `src/lib/observability/logger.ts` redige campos e textos sensiveis antes de escrever logs:

- CPF, PIS, RG e documentos.
- Senha.
- Token, Authorization, Cookie e secrets.
- Strings com formato de JWT.

IDs operacionais como `workerId`, `cooperativeId`, `saleId` e `materialId` podem aparecer quando ajudam debug sem expor documento pessoal.

## Eventos mínimos

| Dominio | Eventos |
| --- | --- |
| Auth | `auth.login.*`, `auth.proxy.*`, `auth.rejected` |
| Stock | `stock.read.succeeded`, `stock.read.no_data`, `stock.read.invalid_filter`, `stock.read.failed`, `stock.create.succeeded`, `stock.create.rejected`, `stock.create.failed`, `material.insert.succeeded`, `material.insert.rejected`, `material.insert.failed` |
| Sales | `sales.read.*`, `sales.create.*`, `sales.update.*`, `sales.delete.*` |
| Job | `job.started`, `job.completed`, `job.skipped`, `job.failed` |

## Auth, vendas e estoque

O login executa comparacao bcrypt contra hash dummy quando o CPF nao existe ou quando a senha armazenada nao e bcrypt. Decisoes de role web (`worker`, tipo invalido) so acontecem apos senha valida, reduzindo enumeracao publica de CPF/role. Ha throttling local por CPF normalizado e bucket global. Bucket por IP so usa headers de proxy quando `DMS_TRUST_PROXY_HEADERS=true`, que deve ser habilitado apenas atras de proxy confiavel; em producao, complementar com rate limit do ingress/plataforma.

Mutacoes de estoque devem passar por `src/lib/stock/ledger.ts`. O contrato canonico e:

- `addToStock`: incrementa `total_collected_kg` e `current_stock_kg` com `Decimal`; pode criar a linha unica `(Cooperative, Material)` quando o fluxo permitir.
- `recordSale`: baixa `current_stock_kg` e incrementa `total_sold_kg` via update condicional atomico `Current_stock_KG >= amount`.
- `adjustStock`: reserva/libera estoque por delta de contribuicao coletiva, espelhando a referencia Java, e bloqueia over-release acima de `total_collected_kg - total_sold_kg`.
- `calculateBagStateDelta`: calcula delta de pesagem acumulada a partir de `material_bag_state` e rejeita leituras fora de ordem pelo timestamp de captura.

`/api/insertMaterial` bloqueia `material_bag_state` com `FOR UPDATE` antes de calcular delta, cria medicao mesmo quando o delta e zero e rejeita leitura regressiva sem reset explicito. A rota tambem exige `measuredAt` e rejeita leituras capturadas antes ou no mesmo instante da ultima leitura aceita, fechando a brecha de leitura stale apos reset de saco cheio. `/api/stock` usa `ON CONFLICT` para criar ou incrementar a linha unica de estoque por cooperativa/material. JSON invalido ou nao-objeto nos POSTs e mapeado para `400 INVALID_JSON_BODY`, nao para erro interno.

As rotas legadas de venda ainda usam `FOR UPDATE` para editar/excluir vendas historicas ja consolidadas, mas agora a matematica interna usa `Prisma.Decimal`. Se existirem duplicatas de `Stock`, a transacao soma as linhas, atualiza a linha canonica e zera as duplicadas para manter paridade com o que `/api/stock` exibe. A migracao S1-01 deve impedir novas duplicatas pela unique `(Cooperative, Material)`.

Erros esperados de dominio devem ser tratados como eventos operacionais, nao como falha generica: `STOCK_MISSING`, `INSUFFICIENT_STOCK`, `INVALID_STOCK_DECIMAL` e `STOCK_INVARIANT_VIOLATION`.

## Onde ver

Local:

```bash
npm run dev
```

Os logs aparecem no terminal do Next.js. Para seguir somente eventos estruturados:

```bash
npm run dev 2>&1 | rg '"event"'
```

Producao:

- Ver stdout/stderr do runtime do deploy.
- Filtrar por `requestId` ao investigar um fluxo especifico.
- Filtrar por `domain` e `event` para incidentes de auth, vendas, estoque e jobs.

## Respostas de erro

Novos erros API devem usar `src/lib/api/errors.ts` e manter o formato:

```json
{
  "error": "Mensagem segura",
  "message": "Mensagem segura",
  "code": "ERROR_CODE",
  "requestId": "..."
}
```

`message` existe por compatibilidade com telas legadas; `error`, `code` e `requestId` sao o contrato operacional preferencial.
