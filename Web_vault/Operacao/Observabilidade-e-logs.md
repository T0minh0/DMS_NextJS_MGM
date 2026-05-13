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
| Stock | `stock.read.succeeded`, `stock.read.no_data`, `stock.read.invalid_filter`, `stock.read.failed` |
| Sales | `sales.read.*`, `sales.create.*`, `sales.update.*`, `sales.delete.*` |
| Job | `job.started`, `job.completed`, `job.skipped`, `job.failed` |

## Auth e vendas

O login executa comparacao bcrypt contra hash dummy quando o CPF nao existe ou quando a senha armazenada nao e bcrypt. Decisoes de role web (`worker`, tipo invalido) so acontecem apos senha valida, reduzindo enumeracao publica de CPF/role. Ha throttling local por CPF normalizado e bucket global. Bucket por IP so usa headers de proxy quando `DMS_TRUST_PROXY_HEADERS=true`, que deve ser habilitado apenas atras de proxy confiavel; em producao, complementar com rate limit do ingress/plataforma.

Vendas que alteram estoque usam transacao Prisma e `FOR UPDATE` nas linhas de estoque do par cooperativa/material. Se existirem duplicatas de `Stock`, a transacao soma as linhas, atualiza a linha canonica e zera as duplicadas para manter paridade com o que `/api/stock` exibe.

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
