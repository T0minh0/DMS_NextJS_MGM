# Mapa do codigo

Inventario factual do repositorio observado.

## Raiz

| Caminho | Responsabilidade |
| --- | --- |
| `package.json` | Dependencias, scripts npm e seed Prisma |
| `package-lock.json` | Lockfile npm |
| `next.config.ts` | Config Next sem opcoes customizadas |
| `tsconfig.json` | TypeScript strict, path alias `@/* -> ./src/*` |
| `eslint.config.mjs` | ESLint flat config com `next/core-web-vitals` e `next/typescript` |
| `tailwind.config.ts` | Cores DMS verdes e caminhos de content |
| `postcss.config.mjs` | Config PostCSS |
| `nixpacks.toml` | Sinal de deploy via Nixpacks |
| `env.example` | Exemplo de variaveis PostgreSQL/JWT |
| `New_db_schema.sql` | SQL ERD gerado pelo pgAdmin |
| `generatepass.js` | Utilitario manual para gerar hash bcrypt |
| `README.md` | README default de create-next-app |
| `DOCUMENTATION.md` | Documentacao extensa, mas parcialmente legada por citar MongoDB/Mongoose |
| `PRODUCTIVITY_README.md` | Documentacao de produtividade herdada |

## Codigo de aplicacao

| Caminho | Responsabilidade |
| --- | --- |
| `src/app/layout.tsx` | Root layout; carrega fontes Geist e metadata default `Create Next App` |
| `src/app/globals.css` | Import Tailwind, CSS variables DMS verdes e base de body |
| `src/components/Layout.tsx` | Layout autenticado com navbar, menu FAB, footer e logout |
| `src/middleware.ts` | Protecao de rotas por cookie `auth_token` |

## Paginas

| Rota | Arquivo | Responsabilidade |
| --- | --- | --- |
| `/` | `src/app/page.tsx` | Dashboard com filtros, cards, graficos e operacoes admin |
| `/login` | `src/app/login/page.tsx` | Login por CPF/senha |
| `/worker-productivity` | `src/app/worker-productivity/page.tsx` | Produtividade semanal por catador |
| `/materials` | `src/app/materials/page.tsx` | CRUD de materiais e grupos |
| `/manage-workers` | `src/app/manage-workers/page.tsx` | CRUD de usuarios/catadores/gerentes |
| `/sales` | `src/app/sales/page.tsx` | CRUD de vendas e compradores |
| `/profile` | `src/app/profile/page.tsx` | Perfil e troca de senha |

## APIs

As 28 rotas observadas estao detalhadas em [[API/Rotas]].

## Libs internas

| Arquivo | Funcoes |
| --- | --- |
| `src/lib/prisma.ts` | Singleton de `PrismaClient` reutilizado em desenvolvimento |
| `src/lib/db-utils.ts` | `decodeBytes`, `sanitizeDigits`, `toBigIntId`, `formatWorkerId`, `mapUserType`, `decimalToNumber` |

## Prisma

| Arquivo | Responsabilidade |
| --- | --- |
| `prisma/schema.prisma` | Modelos Prisma e mapeamento para tabelas PostgreSQL |
| `prisma/seed.ts` | Seed destrutivo para dados locais |

## Assets

| Caminho | Uso observado |
| --- | --- |
| `public/logo.svg` | Logo principal no login |
| `public/simple-logo.svg` | Fallback do login |
| `public/dms-text.svg` | Fallback final do login |
| `public/dms-text.html` | Asset estatico presente |
| `public/next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg` | Assets default ou nao observados diretamente nas telas principais |

## Arquivos Tony e vault

| Caminho | Responsabilidade |
| --- | --- |
| `.tony/config.json` | Config runtime Tony, ClickUp, stack, vault e agentes |
| `.tony/design.md` | Contrato visual Google DESIGN.md |
| `.tony/conventions.md` | Convencoes tecnicas observadas |
| `.tony/improvement-log.md` | Log de melhorias |
| `.tony/session-history.md` | Historico operacional |
| `.codex/agents/*.toml` | Personas de agentes Tony/Codex |
| `Web_vault` | Documentacao Obsidian |

## Observacoes para manutencao

- Evitar usar `DOCUMENTATION.md` como fonte unica; conferir contra `prisma/schema.prisma` e `src/app/api`.
- O nome `Measurments` esta grafado assim no schema e nas APIs; mudar isso exigiria migracao cuidadosa.
- O projeto tem muitos `console.log` em paginas client-side, especialmente no dashboard.
- A UI atual mistura tokens verdes (`dms-*`) com paleta vinho inline.
