# Visao geral

O DMS Web e um dashboard operacional para cooperativas de reciclagem. A aplicacao permite visualizar dados de estoque, vendas, coletas, aniversariantes, produtividade de catadores, materiais, usuarios e perfil do gestor.

## Stack observada

| Camada | Tecnologia | Evidencia |
| --- | --- | --- |
| Aplicacao web | Next.js App Router 16.2.x | `package.json`, `src/app` |
| Linguagem | TypeScript 5 | `tsconfig.json`, arquivos `.ts`/`.tsx` |
| UI | React 19 | `package.json` |
| Estilo | Tailwind CSS 4 + CSS variables + estilos inline | `tailwind.config.ts`, `src/app/globals.css`, componentes |
| Graficos | Chart.js + react-chartjs-2 | dashboard e produtividade |
| Icones | react-icons / Font Awesome | paginas e layout |
| Banco | PostgreSQL | `prisma/schema.prisma`, `env.example` |
| ORM | Prisma Client 6.x | `src/lib/prisma.ts` |
| Autenticacao | JWT em cookie HTTP-only + bcrypt | `api/auth/login`, `src/proxy.ts` |
| Seed | Prisma + tsx | `prisma/seed.ts`, campo `prisma.seed` |

## Responsabilidades principais

- Frontend autenticado: renderizar dashboard, cadastros, vendas, produtividade e perfil.
- API interna: consultar e modificar dados no PostgreSQL via Prisma.
- Autenticacao: permitir login web somente para `admin` e `manager`; rejeitar `worker`.
- Analytics: derivar series de estoque, ganhos, coletas, preco e produtividade a partir de `Sales`, `Stock`, `Measurments` e `Worker_contributions`.
- Operacao: expor endpoints de debug e recalc para diagnosticar dados e regenerar contribuicoes.

## Limites e integracoes

- Nao ha backend externo separado; as APIs sao route handlers em `src/app/api`.
- Nao ha fila, worker assíncrono ou cron observado.
- Ha gate local `npm run quality` com lint, typecheck, testes, Prisma validate, contrato visual, build e whitespace.
- Ha baseline migration Prisma versionada em `prisma/migrations/00000000000000_baseline`.
- `DOCUMENTATION.md` contem informacao legada sobre MongoDB/Mongoose; usar o codigo atual como fonte de verdade.

## Decisoes tecnicas observadas

- Campos sensiveis como CPF, PIS, RG e senha sao armazenados como `Bytes` no Prisma e convertidos com `Buffer`.
- IDs do banco sao `BigInt` e sao serializados como string/number nos endpoints.
- O identificador amigavel de catador usa `WP` + id numerico com 3 digitos, por exemplo `WP005`.
- A aplicacao usa `localStorage` para dados de usuario no cliente e cookie `auth_token` para a sessao server-side.
- O proxy protege rotas e APIs validando assinatura, issuer, audience, expiracao e payload minimo do JWT.

## Saude operacional observada

- `npm run build`: passou.
- `npm run lint`: passa com `eslint .`.
- `npm audit`: 0 vulnerabilidades.
