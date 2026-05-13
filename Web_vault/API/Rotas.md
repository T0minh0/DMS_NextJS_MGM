# Rotas API

Todas as rotas ficam em `src/app/api` e usam route handlers do Next.js App Router.

## Indice completo

| Grupo | Metodo | Rota | Nota detalhada |
| --- | --- | --- | --- |
| Auth | `POST` | `/api/auth/login` | [[API/Autenticacao]] |
| Auth | `POST` | `/api/auth/logout` | [[API/Autenticacao]] |
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
| Estoque | `GET` | `/api/stock` | [[API/Vendas-e-estoque]] |
| Vendas | `GET` | `/api/sales` | [[API/Vendas-e-estoque]] |
| Vendas | `POST` | `/api/sales` | [[API/Vendas-e-estoque]] |
| Vendas | `PUT` | `/api/sales/[id]` | [[API/Vendas-e-estoque]] |
| Vendas | `DELETE` | `/api/sales/[id]` | [[API/Vendas-e-estoque]] |
| Compradores | `GET` | `/api/sales/buyers` | [[API/Vendas-e-estoque]] |
| Compradores | `POST` | `/api/sales/buyers` | [[API/Vendas-e-estoque]] |
| Dashboard | `GET` | `/api/birthdays` | [[API/Dashboard-e-analytics]] |
| Dashboard | `GET` | `/api/earnings-comparison` | [[API/Dashboard-e-analytics]] |
| Dashboard | `GET` | `/api/worker-collections` | [[API/Dashboard-e-analytics]] |
| Dashboard | `GET` | `/api/price-fluctuation` | [[API/Dashboard-e-analytics]] |
| Produtividade | `GET` | `/api/worker-productivity` | [[API/Dashboard-e-analytics]] |
| Operacao | `POST` | `/api/recalculate-contributions` | [[API/Debug-e-operacao]] |
| Debug | `GET` | `/api/debug/check-data` | [[API/Debug-e-operacao]] |
| Debug | `GET` | `/api/debug/collections` | [[API/Debug-e-operacao]] |
| Debug | `GET` | `/api/debug/wastepickers` | [[API/Debug-e-operacao]] |
| Debug | `GET` | `/api/debug/create-test-user` | [[API/Debug-e-operacao]] |

## Padroes comuns

- IDs `BigInt` geralmente saem como string; algumas respostas legadas tambem incluem `Number(...)`.
- `Decimal` Prisma e convertido para `number` com `decimalToNumber`.
- Documentos pessoais (`CPF`, `PIS`, `RG`) sao guardados como `Bytes` e expostos como string apos `decodeBytes`.
- Mutacoes de usuario/material/venda retornam mensagens em pt-BR.
- Erros de validacao usam status `400`; conflitos de CPF usam `409`; nao encontrado usa `404`; falhas internas usam `500`.

## Middleware

O matcher de `src/middleware.ts` cobre praticamente todas as rotas fora de `_next/static`, `_next/image`, `favicon.ico` e `public/`. Rotas publicas: `/login`, `/api/auth/login` e qualquer rota que começa com `/api/auth/`.
