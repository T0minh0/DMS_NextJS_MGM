# Seed e dados locais

Task ClickUp: `86e1c9e7z` (`[S0-13] Fixtures gerenciais de UAT e matriz de dados por papel`).

Arquivo executavel: `prisma/seed.ts`.
Matriz de UAT: [[Planejamento/Matriz-fixtures-UAT]].

## Aviso destrutivo

O seed comeca truncando as tabelas operacionais abaixo:

```sql
TRUNCATE TABLE "Worker_contributions", "material_bag_state", "Stock", "Measurments", "Sales", "Devices", "Workers", "Buyers", "Materials", "Groups", "Cooperative" RESTART IDENTITY CASCADE;
```

Use apenas em banco descartavel de desenvolvimento, preview ou UAT.

## Guard contra producao

O seed se recusa a executar quando:

- `DATABASE_URL` nao esta configurada.
- A URL parece conter `prod`, `production` ou `prd`.
- A URL nao contem marcador descartavel explicito no usuario ou nome do banco, como `uat`, `dev`, `test`, `local`, `preview`, `sandbox`, `tmp`, `scratch` ou `seed`.
- O host nao e `localhost`, `127.0.0.1` ou `::1`, a menos que `DMS_ALLOW_REMOTE_UAT_SEED=true` esteja definido.

`DMS_ALLOW_REMOTE_UAT_SEED=true` so deve ser usado para bancos descartaveis de preview. Nunca use contra producao ou replica de producao.

## Comandos

Validar schema sem conectar no banco:

```bash
npm run prisma:validate
```

Rodar seed em banco local descartavel:

```bash
export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/dms_uat'
npm run db:seed:uat
```

Equivalente via Prisma:

```bash
npx prisma db seed
```

## Contas sinteticas

Todos os documentos abaixo sao ficticios e foram escolhidos para comecar com prefixos reservados de UAT:

- CPF: `000...`
- PIS: `900...`
- RG: `990...`

| Fixture | Papel de produto | RBAC atual | CPF sintetico | Senha | Cooperativa |
| --- | --- | --- | --- | --- | --- |
| `admin-system` | Admin | `admin` (`A`) | `00000000001` | `uat-admin-123` | UAT Horizonte |
| `manager-horizonte` | Gerente | `manager` (`M`) | `00000000002` | `uat-manager-123` | UAT Horizonte |
| `operator-horizonte` | Operador | `manager` (`0`) ate RBAC dedicado | `00000000003` | `uat-operator-123` | UAT Horizonte |
| `viewer-horizonte` | Visualizador | `manager` (`0`) ate RBAC dedicado | `00000000004` | `uat-viewer-123` | UAT Horizonte |
| `worker-horizonte-active` | Trabalhador | `worker` (`1`) | `00000000011` | `uat-worker-123` | UAT Horizonte |
| `worker-horizonte-empty` | Trabalhador sem operacao | `worker` (`1`) | `00000000012` | `uat-worker-123` | UAT Horizonte |
| `worker-horizonte-inactive` | Trabalhador desligado | `worker` (`1`) | `00000000013` | `uat-worker-123` | UAT Horizonte |
| `manager-leste` | Gerente | `manager` (`M`) | `00000000022` | `uat-manager-123` | UAT Leste |
| `worker-leste` | Trabalhador fora do escopo Horizonte | `worker` (`1`) | `00000000023` | `uat-worker-123` | UAT Leste |

Observacao: `operator` e `viewer` sao personas de produto para UAT. Como o RBAC server-side dedicado ainda nao existe, ambos sao semeados como `manager` e documentados como lacuna de produto.

## Dados criados

### Cooperativas

- `Cooperativa UAT Horizonte`
- `Cooperativa UAT Leste`

### Materiais e estoque

| Fixture | Material | Cooperativa | Cenario |
| --- | --- | --- | --- |
| `cardboard-stocked` | UAT Papelao Ondulado | Horizonte | Estoque suficiente |
| `pet-stocked` | UAT Plastico PET Cristal | Horizonte | Estoque suficiente |
| `aluminum-low-stock` | UAT Aluminio Prensado | Horizonte | Estoque baixo |
| `glass-empty-stock` | UAT Vidro Misto Sem Estoque | Horizonte | Sem estoque |
| `leste-cardboard-stocked` | UAT Papelao Ondulado | Leste | Dado cross-coop para negativo |

### Vendas normais

Desde S1-01, o schema possui `created_at`, `sold_at`, `cancelled_at`, `cooperative_id` e `expected_sale_date`. O seed persiste os estados de venda normal usados em UAT:

| Fixture | Estado alvo | Persistido agora | Observacao |
| --- | --- | --- | --- |
| `normal-active-horizonte` | ativa | Sim | `sold_at` e `cancelled_at` nulos; S2-01 porta complete/cancel |
| `normal-completed-horizonte` | concluida | Sim | `sold_at` preenchido e estoque consolidado pelo legado |
| `normal-cancelled-horizonte` | cancelada | Sim | `cancelled_at` preenchido e sem movimento de estoque |
| `leste-cardboard-sale` | concluida cross-coop | Sim | Venda da Leste usada como alvo negativo para gerente Horizonte |

### Estado fisico de sacos

S1-01 adiciona a tabela `material_bag_state` para portar o fluxo Java de pesagem por delta. O seed cria:

- `UAT Aluminio Prensado` em Horizonte com saco iniciado e `10.00 kg`.
- `UAT Vidro Misto Sem Estoque` em Horizonte com saco vazio e `0.00 kg`.

### Vendas coletivas, avisos e jobs

Ainda nao ha tabelas Prisma para venda coletiva, notices persistidos ou ledger persistido de jobs no schema atual. A S0-13 declara esses dados na matriz UAT para que as tasks futuras implementem os seeds reais quando criarem o schema:

- `collective-open-two-coops`
- `collective-contribution-pending`
- `notice-global-safe`
- `notice-coop-horizonte`
- `notice-xss-blocked`
- `job-pending-achievements`

## Cenario negativo obrigatorio

| Cenario | Ator | Alvo | Resultado esperado |
| --- | --- | --- | --- |
| `manager-horizonte-worker-leste-denied` | Gerente Horizonte | Trabalhador Leste | `404`/vazio escopado, sem revelar existencia |
| `manager-horizonte-sale-leste-denied` | Gerente Horizonte | Venda Leste | `404`/vazio escopado, sem revelar existencia |
| `worker-web-login-denied` | Worker Horizonte | Login web | `403 WEB_ROLE_DENIED` |

## Validacao

Comandos esperados:

```bash
npm run prisma:validate
npm test
npm run quality
```

Cobertura automatizada:

- `tests/uat-fixtures.test.ts` valida papeis, duas cooperativas, documentos sinteticos, estados de venda, venda coletiva declarada, jornada -> fixture, alvos negativos, scan de documentos realistas e guard contra seed em producao/banco duravel/remoto.
- `tests/auth-rbac.test.ts` valida escopo RBAC/cooperativa.
- `tests/schema-migrations.test.ts` valida os contratos S1-01 de lifecycle, `Stock` unico por cooperativa/material, `material_bag_state`, preflights e checks da migration.
- `tests/observability.test.ts` valida PII/logs, contrato de erro API e estabilidade de IDs nas listagens de usuarios.
