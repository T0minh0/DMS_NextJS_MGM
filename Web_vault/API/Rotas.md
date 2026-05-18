# Rotas API

Todas as rotas ficam em `src/app/api` e usam route handlers do Next.js App Router.

## Indice completo

| Grupo | Metodo | Rota | Nota detalhada |
| --- | --- | --- | --- |
| Auth | `POST` | `/api/auth/login` | [[API/Autenticacao]] |
| Auth | `POST` | `/api/auth/logout` | [[API/Autenticacao]] |
| Auth | `GET` | `/api/auth/session` | [[API/Autenticacao]] |
| Perfil | `GET` | `/api/user` | [[API/Usuarios]] |
| Perfil | `POST` | `/api/user/update` | [[API/Usuarios]] |
| Perfil | `POST` | `/api/user/change-password` | [[API/Usuarios]] |
| Usuarios | `GET` | `/api/users` | [[API/Usuarios]] |
| Usuarios | `GET` | `/api/users/all` | [[API/Usuarios]] |
| Usuarios | `POST` | `/api/users/create` | [[API/Usuarios]] |
| Usuarios | `POST` | `/api/users/update` | [[API/Usuarios]] |
| Usuarios | `POST` | `/api/users/delete` | [[API/Usuarios]] |
| Usuarios | `POST` | `/api/users/assign-wastepicker-ids` | [[API/Usuarios]] |
| Cooperativas | `GET` | `/api/cooperatives` | [[API/Materiais-e-cooperativas]] |
| Cooperativas | `POST` | `/api/cooperatives` | [[API/Materiais-e-cooperativas]] |
| Materiais | `GET` | `/api/materials` | [[API/Materiais-e-cooperativas]] |
| Materiais | `POST` | `/api/materials` | [[API/Materiais-e-cooperativas]] |
| Materiais | `PUT` | `/api/materials/[id]` | [[API/Materiais-e-cooperativas]] |
| Materiais | `DELETE` | `/api/materials/[id]` | [[API/Materiais-e-cooperativas]] |
| Materiais | `POST` | `/api/insertMaterial` | [[API/Materiais-e-cooperativas]] e [[API/Vendas-e-estoque]] |
| Estoque | `GET` | `/api/stock` | [[API/Vendas-e-estoque]] |
| Estoque | `POST` | `/api/stock` | [[API/Vendas-e-estoque]] |
| Compradores | `GET` | `/api/buyers` | [[API/Vendas-e-estoque]] |
| Compradores | `POST` | `/api/buyers` | [[API/Vendas-e-estoque]] |
| Compradores | `GET` | `/api/sales/buyers` | [[API/Vendas-e-estoque]] |
| Compradores | `POST` | `/api/sales/buyers` | [[API/Vendas-e-estoque]] |
| Vendas normais | `GET` | `/api/sales` | [[API/Vendas-e-estoque]] |
| Vendas normais | `POST` | `/api/sales` | [[API/Vendas-e-estoque]] |
| Vendas normais | `PUT` | `/api/sales/[id]` | [[API/Vendas-e-estoque]] |
| Vendas normais | `DELETE` | `/api/sales/[id]` | Retorna `405`; usar cancel |
| Vendas normais | `PATCH` | `/api/sales/[id]/complete` | [[API/Vendas-e-estoque]] |
| Vendas normais | `PATCH` | `/api/sales/[id]/cancel` | [[API/Vendas-e-estoque]] |
| Vendas coletivas | `GET` | `/api/collective-sales` | [[API/Vendas-e-estoque]] |
| Vendas coletivas | `POST` | `/api/collective-sales` | [[API/Vendas-e-estoque]] |
| Vendas coletivas | `GET` | `/api/collective-sales/invitations` | [[API/Vendas-e-estoque]] |
| Vendas coletivas | `PATCH` | `/api/collective-sales/[id]` | [[API/Vendas-e-estoque]] |
| Vendas coletivas | `POST` | `/api/collective-sales/[id]/invite` | [[API/Vendas-e-estoque]] |
| Vendas coletivas | `POST` | `/api/collective-sales/[id]/join` | [[API/Vendas-e-estoque]] |
| Vendas coletivas | `PATCH` | `/api/collective-sales/[id]/contribution` | [[API/Vendas-e-estoque]] |
| Vendas coletivas | `POST` | `/api/collective-sales/[id]/leave` | [[API/Vendas-e-estoque]] |
| Vendas coletivas | `POST` | `/api/collective-sales/[id]/cancel` | [[API/Vendas-e-estoque]] |
| Vendas coletivas | `POST` | `/api/collective-sales/[id]/complete` | [[API/Vendas-e-estoque]] |
| Reports | `GET` | `/api/reports/sales/normal/[saleId]` | [[API/Vendas-e-estoque]] |
| Reports | `GET` | `/api/reports/sales/collective/[saleId]` | [[API/Vendas-e-estoque]] |
| Reports | `GET` | `/api/reports/pdf/normal-sale/[saleId]` | [[API/Vendas-e-estoque]] |
| Reports | `GET` | `/api/reports/pdf/collective-sale/[saleId]` | [[API/Vendas-e-estoque]] |
| Dashboard | `GET` | `/api/birthdays` | [[API/Dashboard-e-analytics]] |
| Dashboard | `GET` | `/api/earnings-comparison` | [[API/Dashboard-e-analytics]] |
| Dashboard | `GET` | `/api/worker-collections` | [[API/Dashboard-e-analytics]] |
| Dashboard | `GET` | `/api/price-fluctuation` | [[API/Dashboard-e-analytics]] |
| Dashboard | `GET` | `/api/revenue` | [[API/Dashboard-e-analytics]] |
| Dashboard | `GET` | `/api/cooperative/materials` | [[API/Dashboard-e-analytics]] |
| Dashboard | `GET` | `/api/cooperative/lastsales` | [[API/Dashboard-e-analytics]] |
| Produtividade | `GET` | `/api/worker-productivity` | [[API/Dashboard-e-analytics]] |
| Notices | `GET` | `/api/notices` | [[Operacao/PDF-e-sanitizacao]] |
| Notices | `POST` | `/api/notices` | [[Operacao/PDF-e-sanitizacao]] |
| Notices | `GET` | `/api/notices/global` | [[Operacao/PDF-e-sanitizacao]] |
| Notices | `GET` | `/api/notices/filter` | [[Operacao/PDF-e-sanitizacao]] |
| Notices | `GET` | `/api/notices/[id]` | [[Operacao/PDF-e-sanitizacao]] |
| Notices | `PATCH` | `/api/notices/[id]` | [[Operacao/PDF-e-sanitizacao]] |
| Notices | `DELETE` | `/api/notices/[id]` | [[Operacao/PDF-e-sanitizacao]] |
| Multipliers | `GET` | `/api/multipliers` | [[Operacao/Jobs-e-feature-flags]] |
| Multipliers | `POST` | `/api/multipliers` | [[Operacao/Jobs-e-feature-flags]] |
| Multipliers | `GET` | `/api/multipliers/single` | [[Operacao/Jobs-e-feature-flags]] |
| Gamificacao | `GET` | `/api/achievements` | [[Operacao/Jobs-e-feature-flags]] |
| Gamificacao | `PATCH` | `/api/achievements/[achievementId]/xp` | [[Operacao/Jobs-e-feature-flags]] |
| Gamificacao | `GET` | `/api/achievements/workers/[workerId]/month` | [[Operacao/Jobs-e-feature-flags]] |
| Gamificacao | `GET` | `/api/achievements/workers/[workerId]/top-month` | [[Operacao/Jobs-e-feature-flags]] |
| Gamificacao | `GET` | `/api/achievements/workers/[workerId]/top-day` | [[Operacao/Jobs-e-feature-flags]] |
| Gamificacao | `GET` | `/api/levels` | [[Operacao/Jobs-e-feature-flags]] |
| Gamificacao | `GET` | `/api/levels/worker/[workerId]` | [[Operacao/Jobs-e-feature-flags]] |
| Gamificacao | `GET` | `/api/leaderboard` | [[Operacao/Jobs-e-feature-flags]] |
| Gamificacao | `GET` | `/api/leaderboard/history` | [[Operacao/Jobs-e-feature-flags]] |
| Jobs | `POST` | `/api/jobs/random-multiplier` | [[Operacao/Jobs-e-feature-flags]] |
| Jobs | `POST` | `/api/jobs/achievement-evaluation` | [[Operacao/Jobs-e-feature-flags]] |
| Jobs | `POST` | `/api/jobs/leaderboard-snapshot-weekly` | [[Operacao/Jobs-e-feature-flags]] |
| Jobs | `POST` | `/api/jobs/leaderboard-snapshot-monthly` | [[Operacao/Jobs-e-feature-flags]] |
| Operacao | `POST` | `/api/recalculate-contributions` | [[API/Debug-e-operacao]] |
| Debug | `GET` | `/api/debug/check-data` | [[API/Debug-e-operacao]] |
| Debug | `GET` | `/api/debug/collections` | [[API/Debug-e-operacao]] |
| Debug | `GET` | `/api/debug/wastepickers` | [[API/Debug-e-operacao]] |
| Debug | `GET` | `/api/debug/create-test-user` | [[API/Debug-e-operacao]] |

## Padroes comuns

- IDs `BigInt` saem como string nos contratos novos.
- `Decimal` Prisma e convertido na borda por helpers de dominio.
- Documentos pessoais (`CPF`, `PIS`, `RG`) sao guardados como `Bytes`; listagens retornam mascarado.
- POSTs novos que usam `readJsonBody` rejeitam JSON malformado, `null` e arrays com `400 INVALID_JSON_BODY`.
- Erros de validacao usam status `400`; conflitos usam `409`; nao encontrado usa `404`; falhas internas usam `500`.

## Proxy

O matcher de `src/proxy.ts` cobre praticamente todas as rotas fora de `_next/static`, `_next/image`, `favicon.ico` e `public/`. Rotas publicas: `/login`, `/api/auth/login` e qualquer rota que começa com `/api/auth/`.

## Nota S5-07

Para paridade final com o Java, novas integracoes devem usar o App Router Next e as rotas pluralizadas descritas acima. O legado singular `/api/collective-sale` e as paginas Thymeleaf `/frontend`, `/normal-sale` e `/collective-sale` nao sao destinos canonicos.
