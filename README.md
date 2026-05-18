# DMS NextJS MGM

Dashboard web do DMS para gestao operacional de cooperativas: materiais, estoque, vendas, usuarios, produtividade e indicadores.

## Stack

- Next.js App Router
- React e TypeScript
- Tailwind CSS
- Prisma e PostgreSQL
- JWT HTTP-only cookie auth
- Chart.js
- React-pdf para reports PDF server-side

## Requisitos

- Node.js compatível com Next 16
- npm
- PostgreSQL para fluxos com banco

Variaveis principais:

```bash
DATABASE_URL='postgresql://user:pass@localhost:5432/dms?schema=public'
JWT_SECRET='use-um-segredo-com-32-ou-mais-caracteres'
DMS_JOB_RUNNER='disabled'
DMS_JOB_SECRET='use-um-segredo-de-job-com-32-ou-mais-caracteres'
```

Em producao, `JWT_SECRET` e obrigatoria e precisa ter pelo menos 32 caracteres.
Jobs e modulos migrados ficam desligados por padrao; use as flags `DMS_FEATURE_*` descritas em `env.example` e `Web_vault/Operacao/Jobs-e-feature-flags.md`.

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Qualidade

Comandos individuais:

```bash
npm run lint
npm run typecheck
npm test
npm run prisma:validate
npm run check:visual-contract
npm run build
npm run check:whitespace
```

Gate completo local:

```bash
npm run quality
```

`npm run prisma:validate` usa `DATABASE_URL` real quando ela existir. Sem env local, usa uma URL placeholder apenas para validar o schema Prisma sem conectar no banco. `npm run quality` tambem injeta placeholders locais para `DATABASE_URL` e `JWT_SECRET` quando ausentes.

O mesmo gate roda em `.github/workflows/quality.yml` para `push` em `main` e pull requests.

`npm run check:whitespace` varre arquivos de texto versionados e novos ainda nao rastreados, em vez de depender apenas de `git diff --check`.

## Prisma

Validar schema:

```bash
npm run prisma:validate
```

Aplicar migrations em ambiente alvo:

```bash
npx prisma migrate deploy
```

Seed:

```bash
npx prisma db seed
```

## Documentacao

O vault operacional fica em `Web_vault/`. Pontos de entrada:

- `Web_vault/Home.md`
- `Web_vault/Operacao/Comandos-e-validacao.md`
- `Web_vault/Operacao/Jobs-e-feature-flags.md`
- `Web_vault/Operacao/PDF-e-sanitizacao.md`
- `Web_vault/Arquitetura/Autenticacao-e-seguranca.md`
- `.tony/config.json`
- `.tony/design.md`
- `prisma.config.ts`
