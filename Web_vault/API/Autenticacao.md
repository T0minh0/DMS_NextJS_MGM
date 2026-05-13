# API - Autenticacao

## `POST /api/auth/login`

Arquivo: `src/app/api/auth/login/route.ts`

### Body

| Campo | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `cpf` | string | Sim | Pontuacao e removida com `sanitizeDigits` |
| `password` | string | Sim | Comparada com hash bcrypt |

### Fluxo

- Busca worker por CPF usando SQL raw sobre a coluna `CPF` (`bytea`).
- Converte `User_type` com `mapDatabaseUserTypeToRole`.
- Rejeita `worker` e permite apenas `manager`/`admin` no painel web.
- Valida senha.
- Assina JWT HS256 por 8 horas com `workerId`, `cooperativeId`, `role`, `userType`, `issuer` e `audience`.
- Em producao, falha se `JWT_SECRET` estiver ausente ou tiver menos de 32 caracteres.
- Define cookie `auth_token`.
- Retorna dados basicos de usuario e contrato de sessao para o frontend.

### Resposta de sucesso

```json
{
  "message": "Login realizado com sucesso",
  "user": {
    "id": "1",
    "workerId": "1",
    "worker_id": 1,
    "name": "Nome",
    "full_name": "Nome",
    "role": "manager",
    "userType": 0,
    "user_type": 0,
    "cooperativeId": "1",
    "cooperative_id": "1",
    "cooperative_name": "Cooperativa",
    "wastepicker_id": "WP001"
  }
}
```

### Erros

| Status | Condicao |
| --- | --- |
| `400` | CPF ou senha ausentes |
| `401` | Usuario nao encontrado ou senha incorreta |
| `403` | Usuario existe, mas nao tem perfil `manager`/`admin` para o painel web |
| `500` | Erro interno |

## `POST /api/auth/logout`

Arquivo: `src/app/api/auth/logout/route.ts`

### Fluxo

- Apaga cookie `auth_token`.
- Retorna mensagem de sucesso.

### Resposta

```json
{ "message": "Logout realizado com sucesso" }
```

## Middleware

Arquivo: `src/middleware.ts`

### Publico

- `/login`
- `/api/auth/login`
- qualquer rota iniciada por `/api/auth/`

### Protegido

- Paginas protegidas sem token: redirect para `/login`.
- APIs protegidas sem token: `401`.
- Usuario com token em `/login`: redirect para `/`.

### Verificacao

O middleware usa `verifyAuthTokenEdge` para validar assinatura HS256, issuer, audience, expiracao e payload minimo. APIs protegidas tambem usam helpers server-side (`requireAuth`, `requireAdmin`, `requireManagerOrAdmin`) para nao depender apenas do middleware.
