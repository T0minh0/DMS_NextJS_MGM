# Inventario de portabilidade Java -> Next

Task Tony: `86e136bqc` (`S0-01`)

Data: 2026-04-27

Repos:

- Referencia Java: `/Users/cammis/Repositorio/UNB/DMS/Web/network_management_system`
- Principal Next: `/Users/cammis/Repositorio/UNB/DMS/Web/DMS_NextJS_MGM`

## Objetivo

Mapear as funcionalidades novas do `network_management_system` e definir como cada uma deve entrar no `DMS_NextJS_MGM`, respeitando Next.js App Router, Prisma/PostgreSQL e o contrato visual Tony.

Esta nota nao implementa codigo. Ela cria o contrato inicial para as ADRs e tasks seguintes.

## Resumo executivo

O repo Java referencia introduz dominios que ainda nao existem no Prisma/Next atual:

- Auth/RBAC com roles `A`, `M`, `W` e escopo por cooperativa.
- Pesagem de material com `material_bag_state` e update de estoque por delta.
- Venda normal com lifecycle `ACTIVE`, `SOLD`, `CANCELLED`.
- Venda coletiva com convites, contribuicoes, reserva/devolucao de estoque e historico.
- Reports JSON e PDF para venda normal/coletiva.
- Notice board global/cooperativa com sanitizacao.
- Multiplicadores por material/cooperativa e random multiplier mensal.
- Achievements, levels e leaderboard com jobs recorrentes.

O Next atual ja possui partes de auth, dashboard, materiais, usuarios, estoque e venda, mas com contratos diferentes. Em especial, a venda normal atual baixa estoque no `POST /api/sales`; a referencia Java baixa estoque no `PATCH /api/sales/{saleId}/complete`.

## Decisoes pendentes que bloqueiam implementacao

| ID | Decisao | Por que bloqueia |
| --- | --- | --- |
| `ADR-SCHEMA` | Escolher estrategia Prisma para tabelas capitalizadas atuais vs `public.*` lower-case da referencia Java. | Qualquer migration/API nova depende dos nomes finais e de rollback. |
| `ADR-SALES-LIFECYCLE` | Definir lifecycle de vendas normais/coletivas e quando estoque e reservado/baixado/devolvido. | Evita dupla baixa de estoque e inconsistencias em reports. |
| `ADR-MONEY-DECIMAL` | Definir escala/arredondamento para kg, preco, receita, multipliers e `revenue_share`. | Evita divergencia financeira contra Java e em PDFs. |
| `ADR-AUTH-RBAC` | Definir payload JWT, matriz role x acao x escopo e compatibilidade com `userType` atual. | APIs novas precisam permissao consistente por cooperativa. |
| `ADR-JOBS` | Escolher job runner/cron para random multiplier, achievements e leaderboard. | Next App Router nao agenda jobs sozinho. |
| `ADR-PDF-SANITIZE` | Escolher engine PDF e biblioteca/politica de sanitizacao de notices. | Resolvido em [[ADR/ADR-0005-pdf-sanitizacao-notices]]. |
| `ADR-DESIGN-WEB` | Adaptar `.tony/design.md` mobile/dark/neon para contrato Web. | Tasks UI precisam uma base visual validavel. |

## Estado atual do Next

Rotas existentes em `src/app/api`:

| Grupo | Rotas existentes | Observacao |
| --- | --- | --- |
| Auth | `/api/auth/login`, `/api/auth/logout` | JWT atual carrega `id`, `name`, `cpf`, `role`, `userType`; `src/proxy.ts` valida assinatura e claims antes de liberar rotas protegidas. |
| Usuarios | `/api/user`, `/api/user/update`, `/api/user/change-password`, `/api/users/*` | Expoe/consome `userType` numerico e dados legados. |
| Cooperativas | `/api/cooperatives` | GET/POST basico. |
| Materiais | `/api/materials`, `/api/materials/[id]` | CRUD de materiais/grupos. |
| Estoque | `/api/stock` | GET agregado atual; falta POST manual conforme Java. |
| Vendas | `/api/sales`, `/api/sales/[id]`, `/api/sales/buyers` | Sem active/history/complete/cancel; create atual ja baixa estoque. |
| Dashboard | `/api/birthdays`, `/api/earnings-comparison`, `/api/worker-collections`, `/api/price-fluctuation`, `/api/worker-productivity` | Cobre dashboards atuais, nao parity Java completa. |
| Operacao/debug | `/api/recalculate-contributions`, `/api/debug/*`, `/api/users/assign-wastepicker-ids` | Dev/admin hacks precisam protecao ou remocao. |

Modelos Prisma atuais:

| Modelo | Tabela mapeada atual | Lacuna frente ao Java |
| --- | --- | --- |
| `Cooperative` | `Cooperative` | Java usa `cooperative` lower-case e inclui contato/localizacao/timestamps. |
| `Devices` | `Devices` | Compativel conceitualmente, nomes divergem. |
| `Groups` | `Groups` | Nomes divergem (`Group_id` vs `group_id`). |
| `Materials` | `Materials` | Nomes divergem. |
| `Buyers` | `Buyers` | Nomes divergem. |
| `Sales` | `Sales` | Falta lifecycle Java: `created_at`, `sold_at`, `cancelled_at`, `cooperative_id`, `expected_sale_date`. |
| `Workers` | `Workers` | Roles mapeadas hoje para numero; Java usa `A/M/W`. |
| `Measurments` | `Measurments` | Grafia legada e nomes divergem de `measurements`. |
| `Stock` | `Stock` | Falta unique formal por cooperativa/material no Prisma atual. |
| `WorkerContributions` | `Worker_contributions` | Usa `Unsupported("daterange")`; manter como ponto de atencao. |

Modelos ausentes no Prisma atual:

`notice_board`, `collective_sale`, `collective_sale_contribution`, `material_bag_state`, `cooperative_material_multiplier`, `cooperative_random_multiplier`, `achievement_definition`, `achievement_xp_override`, `worker_achievement`, `leaderboard_snapshot`, `leaderboard_entry`, `level_definition`, `worker_level`.

## Mapa de endpoints Java -> Next

### Auth e RBAC

| Java | DTO/request | Decisao | Next proposto | Observacoes |
| --- | --- | --- | --- | --- |
| `POST /api/auth/login` | `AuthRequest { cpf, password }` | Adaptar | Manter `/api/auth/login` | Payload Next deve incluir `role`, `cooperativeId`, `workerId`; manter compatibilidade temporaria com `userType`. |

Exemplo Java:

```json
{
  "cpf": "12345678900",
  "password": "senha"
}
```

Gaps:

- Middleware Next deve verificar assinatura/expiracao, nao apenas formato.
- Java aceita JWT por header, cookie `jwt` e query param `?token=`; Next deve descartar token em query e aceitar somente cookie httpOnly ou header `Authorization` validado.
- Remover fallback de `JWT_SECRET` em runtime de producao.
- Definir matriz RBAC antes das APIs novas.

### Cooperativas e compradores

| Java | DTO/response | Decisao | Next proposto | Observacoes |
| --- | --- | --- | --- | --- |
| `GET /api/cooperatives` | `CooperativeDTO { cooperativeId, cooperativeName }` | Adaptar | Manter `/api/cooperatives` | Atual Next tambem tem POST; revisar escopo. |
| `GET /api/buyers` | `BuyerDTO { buyerId, buyerName }` | Portar | Criar `/api/buyers`; manter alias `/api/sales/buyers` | Next atual usa `/api/sales/buyers`; padronizar sem quebrar UI. |

### Analytics

| Java | Query | Response DTO | Decisao | Next proposto |
| --- | --- | --- | --- | --- |
| `GET /api/performance` | `cooperativeId`, `startDate`, `endDate` | `CooperativePerformanceDTO` | Adaptar | `/api/performance` |
| `GET /api/productivity` | `cooperativeId`, `workerId`, `startDate`, `endDate` | `WorkerProductivityDTO` | Adaptar | `/api/productivity`; manter `/api/worker-productivity` se UI precisar |
| `GET /api/revenue` | `cooperativeId`, `materialId`, `startDate`, `endDate` | `RevenueDTO` | Adaptar | `/api/revenue` |
| `GET /api/cooperative/materials` | none | `Map { materialId, materialName }` | Portar | `/api/cooperative/materials` |
| `GET /api/cooperative/lastsales` | `cooperativeId`, `materialId` | `Last5SalesDTO[]` | Portar | `/api/cooperative/lastsales` |
| `GET /api/cooperative/lastsales/all` | `materialId` | `Last5SalesDTO[]` | Portar | `/api/cooperative/lastsales/all` |
| `GET /api/stock` | `cooperativeId` | `StockByMaterialDTO[]` | Adaptar | `/api/stock` |
| `GET /api/getLast5Sales` | `materialId` | raw rows | Substituir | Preferir `/api/cooperative/lastsales/all` |

Response examples:

```json
{
  "totalCollected": 1200.5,
  "totalSold": 800,
  "currentStock": 400.5,
  "activeWorkers": 18
}
```

```json
{
  "workerId": "7",
  "workerName": "Maria",
  "totalCollectedKg": 250.75,
  "numberOfWeighings": 12,
  "avgWeightPerWeighing": 20.9
}
```

Gaps:

- Java aceita `startDate`/`endDate` em performance, mas gap conhecido diz que a query nao usa esses filtros.
- `GET /api/getLast5Sales` tem gap de escopo para manager.
- Analytics deve depender da decisao de lifecycle para contar apenas vendas concluidas.

### Materiais, pesagem e estoque

| Java | DTO/request | Decisao | Next proposto | Observacoes |
| --- | --- | --- | --- | --- |
| `POST /api/insertMaterial` | `MaterialRequest` | Portar | `/api/insertMaterial` | Exige `material_bag_state` e update de estoque por delta. |
| `POST /api/stock` | `AddStockDTO` | Portar | `/api/stock` | Next atual so tem GET; adicionar POST protegido. |

`MaterialRequest`:

```json
{
  "materialId": 3,
  "workerId": 7,
  "amount": 12.5,
  "bagFull": false,
  "deviceId": 1
}
```

`AddStockDTO`:

```json
{
  "materialId": 3,
  "amount": 50.0
}
```

Gaps:

- SQL Java de `material_bag_state` deve ser revisado antes de virar migration.
- Estoque precisa transacao/condicao atomica para evitar `current_stock_kg < 0`.
- Diferenciar missing stock de estoque insuficiente.

### Vendas normais

| Java | DTO/request | Decisao | Next proposto | Observacoes |
| --- | --- | --- | --- | --- |
| `GET /api/sales/history` | query `cooperativeId`, `startDate`, `endDate`, `type` | Portar | `/api/sales/history` | Lista normal + coletiva por periodo. |
| `GET /api/sales/active` | query `cooperativeId`, `type` | Portar | `/api/sales/active` | Lista normal + coletiva ativa. |
| `GET /api/sales` | query `cooperativeId`, `status` | Adaptar | `/api/sales` | Next atual lista vendas legadas; mudar para status active/history. |
| `POST /api/sales` | `CreateSaleDTO` | Adaptar | `/api/sales` | Deve seguir ADR: provavelmente criar ativa sem baixar estoque. |
| `PUT /api/sales/{saleId}` | `UpdateSaleDTO` | Adaptar | `/api/sales/[id]` | Bloquear se sold/cancelled. |
| `PATCH /api/sales/{saleId}/complete` | none | Portar | `/api/sales/[id]/complete` | Baixa estoque atomico. |
| `PATCH /api/sales/{saleId}/cancel` | none | Portar | `/api/sales/[id]/cancel` | Marca cancelada. |

`CreateSaleDTO`:

```json
{
  "materialId": 1,
  "weight": 100.0,
  "priceKg": 2.5,
  "buyerId": 4,
  "expectedSaleDate": "2026-05-01T10:00:00Z"
}
```

`SaleDTO` response esperado:

```json
{
  "saleId": "10",
  "saleType": "REGULAR",
  "createdAt": "2026-04-27T12:00:00Z",
  "soldAt": null,
  "cancelledAt": null,
  "expectedSaleDate": "2026-05-01T10:00:00Z",
  "materialName": "Aluminio",
  "weight": 100.0,
  "pricePerKg": 2.5,
  "totalRevenue": 250.0,
  "buyerName": "Comprador",
  "status": "ACTIVE"
}
```

Gaps:

- Next atual baixa estoque no create/update/delete; isso conflita com Java.
- Definir idempotencia de complete/cancel.
- Definir `cooperative_id` em `sales` antes de migration.

### Vendas coletivas

| Java | DTO/request | Decisao | Next proposto | Observacoes |
| --- | --- | --- | --- | --- |
| `GET /api/collective-sale` | none | Portar | `/api/collective-sale` | Admin ve tudo ativo; manager ve vendas relevantes. |
| `GET /api/collective-sale/invitations` | none | Portar | `/api/collective-sale/invitations` | Convites pendentes da cooperativa autenticada. |
| `POST /api/collective-sale` | `CreateCollectiveSaleDTO` | Portar | `/api/collective-sale` | Creator vira `ACCEPTED`. |
| `POST /api/collective-sale/{saleId}/invite` | `InviteCooperativeDTO` | Portar | `/api/collective-sale/[saleId]/invite` | Apenas creator/admin; proibir propria cooperativa. |
| `POST /api/collective-sale/{saleId}/join` | none | Portar | `/api/collective-sale/[saleId]/join` | Aceita convite. |
| `PUT /api/collective-sale/{saleId}/contribution` | `UpdateContributionDTO` | Portar | `/api/collective-sale/[saleId]/contribution` | Reserva/devolve estoque por delta. |
| `PUT /api/collective-sale/{saleId}/material` | `UpdateSaleMaterialDTO` | Portar | `/api/collective-sale/[saleId]/material` | Bloquear se houver reserva. |
| `PUT /api/collective-sale/{saleId}/price` | `UpdateSalePriceDTO` | Portar | `/api/collective-sale/[saleId]/price` | Apenas creator/admin. |
| `DELETE /api/collective-sale/{saleId}/leave` | none | Portar | `/api/collective-sale/[saleId]/leave` | Creator nao pode sair; devolver reserva. |
| `GET /api/collective-sale/my` | query `status` | Portar | `/api/collective-sale/my` | Active/history da propria cooperativa. |
| `DELETE /api/collective-sale/{saleId}` | none | Portar | `/api/collective-sale/[saleId]` | Cancelar e devolver reservas. |
| Nao observado no Java | completion | Portar | `/api/collective-sale/[saleId]/complete` ou equivalente | Contrato novo necessario para `sold_at`, `total_weight`, `revenue_share`, reports e history. |

Requests criticos:

`CreateCollectiveSaleDTO`:

```json
{
  "materialId": 1,
  "buyerId": 4,
  "pricePerKg": 2.5,
  "expectedSaleDate": "2026-05-01T10:00:00Z"
}
```

`InviteCooperativeDTO`:

```json
{
  "cooperativeId": 2
}
```

`UpdateContributionDTO`:

```json
{
  "weight": 500.0
}
```

`UpdateSaleMaterialDTO`:

```json
{
  "materialId": 3
}
```

`UpdateSalePriceDTO`:

```json
{
  "pricePerKg": 3.75
}
```

Gaps:

- Nao ha endpoint Java observado para concluir venda coletiva.
- `revenue_share` precisa formula de arredondamento.
- Cancel/leave dependem de `contributed_weight` como fonte de verdade de reserva.
- Material/preco nao podem mudar apos contribution reservada, completion ou cancel.

### Reports e PDFs

| Java | DTO/response | Decisao | Next proposto | Observacoes |
| --- | --- | --- | --- | --- |
| `GET /api/reports/sales/normal/{saleId}` | `SaleReportDTO` | Portar | `/api/reports/sales/normal/[saleId]` | JSON deterministico. |
| `GET /api/reports/sales/collective/{saleId}` | `CollectiveSaleReportDTO` | Portar | `/api/reports/sales/collective/[saleId]` | Inclui contribuicoes. |
| `GET /api/reports/pdf/normal-sale/{saleId}` | PDF bytes | Portar | `/api/reports/pdf/normal-sale/[saleId]` | Engine PDF pendente. |
| `GET /api/reports/pdf/collective-sale/{saleId}` | PDF bytes | Portar | `/api/reports/pdf/collective-sale/[saleId]` | Engine PDF pendente. |

`SaleReportDTO`:

```json
{
  "saleId": "10",
  "status": "SOLD",
  "materialId": "1",
  "materialName": "Aluminio",
  "buyerId": "4",
  "buyerName": "Comprador",
  "responsibleWorkerId": "7",
  "responsibleWorkerName": "Maria",
  "cooperativeId": "1",
  "cooperativeName": "Coop A",
  "createdAt": "2026-04-27T12:00:00Z",
  "soldAt": "2026-04-28T12:00:00Z",
  "cancelledAt": null,
  "expectedSaleDate": "2026-05-01T10:00:00Z",
  "weight": 100.0,
  "pricePerKg": 2.5,
  "totalRevenue": 250.0
}
```

`CollectiveSaleReportDTO` inclui os campos da coletiva e:

```json
{
  "totalWeight": 600.0,
  "totalRevenue": 1500.0,
  "totalCooperatives": 3,
  "creatorCooperativeId": "1",
  "contributions": [
    {
      "cooperativeId": "1",
      "cooperativeName": "Coop A",
      "contributedWeight": 200.0,
      "percentageOfTotal": 33.33,
      "revenueShare": 500.0,
      "status": "ACCEPTED"
    }
  ]
}
```

Gaps:

- Escolher engine PDF e runtime antes de implementar.
- JSON deve ser a fonte dos PDFs para reduzir divergencia.
- Permissao de report deve ser consistente com RBAC e escopo por cooperativa.

### Notices

| Java | DTO/request | Decisao | Next proposto | Observacoes |
| --- | --- | --- | --- | --- |
| `GET /api/notices` | query `cooperativeId` | Portar | `/api/notices` | Lista global + cooperativa ativa. |
| `GET /api/notices/global` | none | Portar | `/api/notices/global` | Admin only. |
| `GET /api/notices/{noticeId}` | none | Portar | `/api/notices/[noticeId]` | Escopo por global/propria coop/admin. |
| `GET /api/notices/filter` | `priority`, `cooperativeId` | Portar | `/api/notices/filter` | Prioridade 1-3. |
| `POST /api/notices` | `NoticeDTO` | Portar | `/api/notices` | Manager cria propria coop; admin pode global. |
| `PUT /api/notices/{noticeId}` | `NoticeDTO` | Portar | `/api/notices/[noticeId]` | Sanitizar. |
| `DELETE /api/notices/{noticeId}` | none | Portar | `/api/notices/[noticeId]` | Escopo de escrita. |

`NoticeDTO`:

```json
{
  "title": "Aviso",
  "content": "Conteudo permitido",
  "priority": 2,
  "expiresAt": "2026-05-01T10:00:00Z",
  "cooperativeId": 1
}
```

Gaps:

- Java usa OWASP HTML Sanitizer; Next precisa biblioteca/politica server-side.
- Definir se `content` aceita HTML limitado ou texto puro.

### Multipliers

| Java | DTO/request | Decisao | Next proposto | Observacoes |
| --- | --- | --- | --- | --- |
| `POST /api/multipliers` | `MultiplierDTO` | Portar | `/api/multipliers` | Upsert por cooperativa/material. |
| `GET /api/multipliers` | query `cooperativeId` | Portar | `/api/multipliers` | Lista com default 1.0 quando ausente. |
| `GET /api/multipliers/single` | `cooperativeId`, `materialId` | Portar | `/api/multipliers/single` | Single lookup. |

`MultiplierDTO`:

```json
{
  "cooperativeId": 1,
  "materialId": 3,
  "materialName": "Aluminio",
  "multiplierValue": 1.25
}
```

Gaps:

- Admin write com `cooperativeId` nulo e gap conhecido no Java.
- Random multiplier mensal precisa job runner.

### Gamificacao

| Java | Query/body | DTO/response | Decisao | Next proposto | Observacoes |
| --- | --- | --- | --- | --- | --- |
| `GET /api/achievements` | `cooperativeId?` | `AchievementDTO[]` | Portar | `/api/achievements` | XP efetivo com override. |
| `PATCH /api/achievements/{achievementId}/xp` | `cooperativeId?` + body | `UpdateAchievementXPDTO` | Portar | `/api/achievements/[achievementId]/xp` | Manager/admin. |
| `GET /api/achievements/workers/{workerId}/month` | `yearMonth?`, `cooperativeId?` | `WorkerMonthSummaryDTO` | Portar | `/api/achievements/workers/[workerId]/month` | Worker forced self. |
| `GET /api/achievements/workers/{workerId}/top-month` | `cooperativeId?` | `WorkerMonthSummaryDTO` | Portar | `/api/achievements/workers/[workerId]/top-month` | Melhor mes do ano atual. |
| `GET /api/achievements/workers/{workerId}/top-day` | `yearMonth?`, `cooperativeId?` | map | Portar | `/api/achievements/workers/[workerId]/top-day` | Melhor dia do mes. |
| `GET /api/levels` | none | `LevelDTO[]` | Portar | `/api/levels` | Definicoes seedadas. |
| `GET /api/levels/worker/{workerId}` | none | `LevelDTO` | Portar | `/api/levels/worker/[workerId]` | Worker forced self. |
| `GET /api/leaderboard` | `cooperativeId?` | `LeaderboardDTO` | Portar | `/api/leaderboard` | Snapshot atual. |
| `GET /api/leaderboard/history` | `cooperativeId?`, `yearMonth`, `weekNumber` | `LeaderboardDTO` | Portar | `/api/leaderboard/history` | Snapshot especifico; `yearMonth` e `weekNumber` obrigatorios. |

`UpdateAchievementXPDTO`:

```json
{
  "xpReward": 250
}
```

`WorkerMonthSummaryDTO`:

```json
{
  "workerId": "7",
  "workerName": "Maria",
  "yearMonth": "2026-04",
  "totalWeightKg": 320.5,
  "daysWorked": 12,
  "achievementsUnlocked": 4,
  "totalXpEarned": 700,
  "achievements": []
}
```

`LeaderboardDTO` request historico:

```http
GET /api/leaderboard/history?cooperativeId=1&yearMonth=2026-04&weekNumber=2
```

`LeaderboardDTO`:

```json
{
  "yearMonth": "2026-04",
  "weekNumber": 2,
  "computedAt": "2026-04-14T00:00:00Z",
  "entries": [
    {
      "rankPosition": 1,
      "workerId": "7",
      "workerName": "Maria",
      "rawXP": 900,
      "finalXP": 1125,
      "randomMultiplier": 1.25
    }
  ]
}
```

Gaps:

- Jobs de evaluation e leaderboard devem ser idempotentes.
- Definir mecanismo de cron antes das APIs finais.
- Garantir que `ACHIEVEMENTS_COUNT` nao fique impossivel pela quantidade seedada.

### Browser routes Java

| Java route | Decisao Next | Observacoes |
| --- | --- | --- |
| `/` | Substituir | Usar home/dashboard Next `/`; rota raiz Java redireciona para view server-side. |
| `/login` | Adaptar | Ja existe `/login`; alinhar contrato visual e auth. |
| `/frontend` | Substituir | Trocar dashboard server-side por telas Next App Router. |
| `/normal-sale` | Substituir | Usar `/sales` existente como destino canonico para venda normal. |
| `/collective-sale` | Portar | Criar rota/tela Next dedicada, provavelmente `/collective-sales` ou aba em `/sales`. |

## Tabelas Java novas ou divergentes

| Tabela Java | Status Prisma atual | Decisao |
| --- | --- | --- |
| `cooperative` | Existe como `Cooperative` capitalizado | Resolver em `ADR-SCHEMA`. |
| `buyers` | Existe como `Buyers` capitalizado | Resolver em `ADR-SCHEMA`. |
| `materials` | Existe como `Materials` capitalizado | Resolver em `ADR-SCHEMA`. |
| `workers` | Existe como `Workers` capitalizado | Resolver role fields e nomes. |
| `measurements` | Existe como `Measurments` capitalizado/grafia divergente | Resolver compatibilidade e migration. |
| `sales` | Existe como `Sales`, mas sem lifecycle Java | Migration core. |
| `stock` | Existe como `Stock`, constraint precisa revisao | Migration core. |
| `material_bag_state` | Ausente | Criar apos revisar SQL. |
| `collective_sale` | Ausente | Criar. |
| `collective_sale_contribution` | Ausente | Criar. |
| `notice_board` | Ausente | Criar. |
| `cooperative_material_multiplier` | Ausente | Criar. |
| `cooperative_random_multiplier` | Ausente | Criar. |
| `achievement_definition` | Ausente | Criar + seed. |
| `achievement_xp_override` | Ausente | Criar. |
| `worker_achievement` | Ausente | Criar. |
| `leaderboard_snapshot` | Ausente | Criar. |
| `leaderboard_entry` | Ausente | Criar. |
| `level_definition` | Ausente | Criar + seed. |
| `worker_level` | Ausente | Criar. |

## Gaps materiais registrados

1. **Schema divergente:** Prisma atual usa tabelas/colunas capitalizadas; Java usa lower-case `public.*`.
2. **Venda coletiva sem completion observado:** falta endpoint/servico Java claro para setar `sold_at`, `total_weight` e `revenue_share`.
3. **Venda normal com semantica divergente:** Next baixa estoque no create; Java baixa no complete.
4. **Concorrencia de estoque:** Next atual faz read/create/update sem transacao atomica suficiente.
5. **Auth web em evolucao:** proxy ja valida JWT, mas proximas features ainda precisam testes negativos de papel/escopo e pagina role-aware.
6. **JWT em query no Java:** `?token=` existe na referencia, mas deve ser descartado na portabilidade para evitar vazamento em URL/log.
7. **RBAC incompleto no Next:** payload atual colapsa `A/M` em `userType: 0`.
8. **Jobs pendentes:** random multiplier, achievements e leaderboard precisam runtime explicito.
9. **PDF runtime pendente:** Next precisa engine e estrategia de teste/render.
10. **Sanitizacao pendente:** notices precisam politica server-side contra XSS.
11. **Design pendente:** `.tony/design.md` e mobile-first dark/neon, e Web atual usa verde/vinho.
12. **Debug/hacks no Next:** endpoints debug e botoes operacionais precisam protecao/remocao antes de producao.
13. **Docs legadas:** `DOCUMENTATION.md` ainda fala em MongoDB/Mongoose e nao pode guiar implementacao.

## Ordem recomendada apos este inventario

1. `S0-02` ADR schema Prisma, baseline migration e rollback.
2. `S0-03` ADR lifecycle de vendas, estoque e arredondamento Decimal.
3. `S0-05` Sessao JWT segura e matriz RBAC/cooperativa.
4. `S0-06` Tooling/test harness para dar suporte aos criterios de aceite.
5. So depois iniciar migrations e APIs de dominio.

## Fontes verificadas

- `../network_management_system/Managers_vault/API/API Reference.md`
- `../network_management_system/Managers_vault/Models/Java Models and DTOs.md`
- `../network_management_system/Managers_vault/Planning/Known Gaps and Follow-ups.md`
- `../network_management_system/Database/DMS_db_schema.sql`
- `../network_management_system/src/main/java/dk/aau/network_management_system/**/*Controller.java`
- `DMS_NextJS_MGM/prisma/schema.prisma`
- `DMS_NextJS_MGM/src/app/api/**/route.ts`
