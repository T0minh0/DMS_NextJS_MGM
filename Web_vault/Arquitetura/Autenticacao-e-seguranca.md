# Autenticacao e seguranca

## Login

Endpoint: `POST /api/auth/login`

Fluxo observado:

1. Recebe `cpf` e `password`.
2. Sanitiza CPF mantendo apenas digitos.
3. Busca em `Workers` com SQL raw comparando `regexp_replace(encode("CPF", 'escape'), '\D', '', 'g')`.
4. Mapeia `User_type` com `mapDatabaseUserTypeToRole`.
5. Permite login apenas para `admin` ou `manager`.
6. Decodifica senha armazenada em `Bytes`.
7. Se a senha armazenada e hash bcrypt (`$2a$`, `$2b$`, `$2x$`, `$2y$`), usa `bcrypt.compare`.
8. Senha armazenada sem formato bcrypt e rejeitada; registros legados devem passar por reset/migracao.
9. Mapeia `User_type` para `role` (`admin`, `manager`, `worker`) preservando `userType` numerico para compatibilidade do frontend.
10. Assina JWT HS256 com `workerId`, `cooperativeId`, `role`, `userType`, `name`, `cpf`, `iss`, `aud` e expiracao de 8h.
11. Falha em producao se `JWT_SECRET` nao estiver configurado.
12. Grava cookie `auth_token` HTTP-only, `sameSite: strict`, `path: /`, `maxAge` 8h e `secure` apenas em producao.
13. Retorna dados do usuario para salvar no `localStorage`, incluindo `role`, `workerId`, `cooperative_id` e `cooperative_name`.

## Logout

Endpoint: `POST /api/auth/logout`

- Apaga cookie `auth_token`.
- Retorna mensagem de sucesso.

## Middleware

Arquivo: `src/middleware.ts`

Rotas publicas:

- `/login`
- `/api/auth/login`
- qualquer rota sob `/api/auth/`

Para rotas protegidas:

- Lê cookie `auth_token`.
- Verifica assinatura HS256, issuer, audience, expiracao e payload minimo com `verifyAuthTokenEdge`.
- Se API protegida sem token/formato valido, retorna `401`.
- Se pagina protegida sem token/formato valido, redireciona para `/login`.
- Se usuario autenticado acessa `/login`, redireciona para `/`.
- Token ausente, adulterado, expirado ou com payload incompleto limpa o cookie.

## Autorizacao por endpoint

| Area | Protecao observada |
| --- | --- |
| Login | Permite `admin` e `manager`; rejeita `worker` no painel web |
| Middleware | Verifica assinatura, issuer, audience, expiracao e payload JWT |
| `GET/POST /api/sales` | Usa `requireManagerOrAdmin`, escopo de cooperativa e responsavel valido |
| `PUT/DELETE /api/sales/[id]` | Usa escopo de cooperativa da venda; admin global, manager apenas propria cooperativa |
| Usuarios/perfil | Usa `requireAuth`, `determineTargetWorker` e `determineTargetCooperative` |
| Materiais/cooperativas/debug/recalc | Mutacoes e debug exigem `requireAdmin`; leituras operacionais exigem gestor/admin |
| Dashboard/notices/reports/gamificacao | Revalidam JWT na API e aplicam escopo de cooperativa/usuario |

## Segredos e defaults

`JWT_SECRET` deve ser definido em producao e ter pelo menos 32 caracteres. O runtime local/teste usa segredo fixo apenas fora de producao para DX, mas `getJwtSecret()` lanca erro quando `NODE_ENV === "production"` e a variavel esta ausente ou fraca.

## RBAC e escopo

Arquivo principal: `src/lib/auth/shared.ts`

Recursos cobertos pela matriz:

- `auth`
- `stock`
- `sales`
- `cooperatives`
- `materials`
- `users`
- `notices`
- `reports`
- `gamification`

Helpers server-side:

- `requireAuth`
- `requireAdmin`
- `requireManagerOrAdmin`
- `determineTargetCooperative`
- `determineTargetWorker`
- `requireScopedPermission`

Regras base:

- `admin`: pode atuar globalmente ou por cooperativa.
- `manager`: atua na propria cooperativa.
- `worker`: atua apenas no proprio usuario/escopo self.

## Senhas

- Login aceita apenas hash bcrypt.
- Criacao de usuarios: `bcrypt.hash(password, 10)`.
- Atualizacao de usuarios: `bcrypt.hash(password, 10)` quando senha e informada.
- Troca de senha de perfil: valida senha atual com bcrypt e grava hash com custo `12`.
- Seed cria `manager123` e `worker123` com custo `10`.

## Dados pessoais

- CPF, PIS e RG ficam em `Bytes`, mas nao ha criptografia observada; os bytes representam strings UTF-8.
- APIs retornam CPF/PIS/RG em texto para frontend.

## Dependencias vulneraveis observadas

`npm audit --json` reportou 12 vulnerabilidades:

| Severidade | Quantidade |
| --- | --- |
| Moderada | 3 |
| Alta | 9 |
| Critica | 0 |

Pacotes afetados incluem `next`, `prisma`, `@prisma/config`, `effect`, `defu`, `flatted`, `minimatch`, `picomatch`, `postcss`, `tar`, `brace-expansion` e `ajv`.

## Pontos de atencao

- Migrar `src/middleware.ts` para a convencao `proxy` quando o projeto atualizar o padrao do Next 16.
- Revisar exposicao de endpoints debug.
- Corrigir vulnerabilidades de `next` e `prisma`.
- Rever logs client-side que podem expor dados em console.
- Considerar criptografia/mascara para documentos pessoais em respostas de API.
