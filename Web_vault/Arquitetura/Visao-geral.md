# Visao geral

O DMS Web e um dashboard operacional para cooperativas de reciclagem. A aplicacao permite visualizar dados de estoque, vendas, coletas, aniversariantes, produtividade de catadores, materiais, usuarios e perfil do gestor.

## Stack observada

| Camada | Tecnologia | Evidencia |
| --- | --- | --- |
| Aplicacao web | Next.js App Router 16.1.4 | `package.json`, `src/app` |
| Linguagem | TypeScript 5 | `tsconfig.json`, arquivos `.ts`/`.tsx` |
| UI | React 19 | `package.json` |
| Estilo | Tailwind CSS 4 + CSS variables + estilos inline | `tailwind.config.ts`, `src/app/globals.css`, componentes |
| Graficos | Chart.js + react-chartjs-2 | dashboard e produtividade |
| Icones | react-icons / Font Awesome | paginas e layout |
| Banco | PostgreSQL | `prisma/schema.prisma`, `env.example` |
| ORM | Prisma Client 6.0.1 | `src/lib/prisma.ts` |
| Autenticacao | JWT em cookie HTTP-only + bcrypt | `api/auth/login`, `middleware.ts` |
| Seed | Prisma + tsx | `prisma/seed.ts`, campo `prisma.seed` |

## Responsabilidades principais

- Frontend autenticado: renderizar dashboard, cadastros, vendas, produtividade e perfil.
- API interna: consultar e modificar dados no PostgreSQL via Prisma.
- Autenticacao: permitir login somente para gerentes (`userType` mapeado para `0`).
- Analytics: derivar series de estoque, ganhos, coletas, preco e produtividade a partir de `Sales`, `Stock`, `Measurments` e `Worker_contributions`.
- Operacao: expor endpoints de debug e recalc para diagnosticar dados e regenerar contribuicoes.

## Limites e integracoes

- Nao ha backend externo separado; as APIs sao route handlers em `src/app/api`.
- Nao ha fila, worker assíncrono ou cron observado.
- Nao ha testes automatizados configurados.
- Nao ha migrations Prisma versionadas no repositorio; existem `prisma/schema.prisma` e `New_db_schema.sql`.
- `DOCUMENTATION.md` contem informacao legada sobre MongoDB/Mongoose; usar o codigo atual como fonte de verdade.

## Decisoes tecnicas observadas

- Campos sensiveis como CPF, PIS, RG e senha sao armazenados como `Bytes` no Prisma e convertidos com `Buffer`.
- IDs do banco sao `BigInt` e sao serializados como string/number nos endpoints.
- O identificador amigavel de catador usa `WP` + id numerico com 3 digitos, por exemplo `WP005`.
- A aplicacao usa `localStorage` para dados de usuario no cliente e cookie `auth_token` para a sessao server-side.
- O middleware protege rotas e APIs por presenca/formato de token, mas nao valida assinatura no middleware.

## Saude operacional observada

- `npm run build`: passou.
- Aviso de build: a convencao `middleware` esta deprecated e deve migrar para `proxy`.
- `npm run lint`: falha com `Invalid project directory provided.../lint`.
- `npm audit`: 12 vulnerabilidades, incluindo `next` e `prisma`.
