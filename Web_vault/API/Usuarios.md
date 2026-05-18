# API - Usuarios e perfil

## `GET /api/user`

Arquivo: `src/app/api/user/route.ts`

### Query params

| Param | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | string BigInt | Condicional | Busca por `workerId` |
| `cpf` | string | Condicional | Busca por CPF em bytes |
| `reveal` | `documents` | Nao | Revela CPF/PIS/RG completos apenas para usuario autorizado |

Exige pelo menos `id` ou `cpf`.

### Retorno

Retorna `id`, `worker_id`, `wastepicker_id`, `full_name`, `cpf`/`CPF`, `PIS`, `RG`, `role`, `userType`, `user_type`, `email`, `gender`, datas, `cooperative_id`, `cooperative_name`, `can_reveal_documents` e `documents_revealed` para usuario autorizado no escopo.

CPF, PIS e RG saem mascarados por padrao. A leitura completa exige `reveal=documents`, escopo server-side valido e permissao de edicao/gestao de usuarios no RBAC. A tela `/manage-workers` usa essa revelacao somente por acao explicita dentro do modal de edicao.

### Autorizacao

- `admin`: pode consultar qualquer usuario.
- `manager`: pode consultar usuarios da propria cooperativa.
- `worker`: pode consultar apenas o proprio usuario.

### Erros

- `400`: id/cpf ausente ou id invalido.
- `404`: usuario nao encontrado.
- `500`: erro interno.

## `POST /api/user/update`

Arquivo: `src/app/api/user/update/route.ts`

Atualiza perfil do usuario logado.

### Body

| Campo | Uso |
| --- | --- |
| `id` | Obrigatorio |
| `full_name` | Opcional; trim |
| `email` | Opcional; trim |
| `PIS` | Opcional; digitos viram bytes |
| `RG` | Opcional; digitos viram bytes |

Sempre atualiza `lastUpdate`.

Autorizacao: `worker` apenas self; `manager` so pode atualizar perfil de usuarios da propria cooperativa; `admin` pode atualizar por cooperativa/global. O fluxo esperado de UI continua sendo o usuario logado.

## `POST /api/user/change-password`

Arquivo: `src/app/api/user/change-password/route.ts`

### Body

| Campo | Obrigatorio | Regra |
| --- | --- | --- |
| `id` | Sim | BigInt valido |
| `currentPassword` | Sim | Precisa bater com bcrypt |
| `newPassword` | Sim | Minimo 6 caracteres |

Grava senha nova com bcrypt custo `12`.

Autorizacao: troca senha apenas do proprio usuario, inclusive para `manager`/`admin`. Reset administrativo de senha deve usar `/api/users/update`.

## `GET /api/users`

Arquivo: `src/app/api/users/route.ts`

Por padrao lista apenas integrantes operacionais (`mapUserType(userType) === 1`), ordenados por nome, incluindo cooperativa. `manager` recebe apenas a propria cooperativa; `admin` recebe todas.

Campos retornados incluem aliases para compatibilidade: `wastepicker_id`, `worker_id`, `user_id`, `full_name`, `worker_name`, `cooperative_id`, `CPF`, `cpf`, `PIS`, `RG`, datas e email. Documentos pessoais saem mascarados na listagem; fluxos de edicao buscam detalhe autorizado em `/api/user?id=...`.

`view=team-management` inclui gestores e integrantes operacionais para a tela de equipe. `view=gamification` continua retornando payload reduzido e apenas integrantes operacionais, sem CPF/PIS/RG/email/datas.

## `GET /api/users/all`

Arquivo: `src/app/api/users/all/route.ts`

Lista todos os workers, gerentes e catadores, ordenados por nome. Requer `admin`.

Difere de `/api/users` por nao filtrar `userType`.

## `POST /api/users/create`

Arquivo: `src/app/api/users/create/route.ts`

### Body

| Campo | Obrigatorio | Observacao |
| --- | --- | --- |
| `full_name` | Sim | Nome completo |
| `CPF` | Sim | Sanitizado para digitos |
| `email` | Nao | Fallback `sem-email@coop.local` |
| `PIS` | Sim | Sanitizado para digitos |
| `RG` | Sim | Sanitizado para digitos |
| `user_type` | Sim | `0` ou `1` |
| `password` | Sim | bcrypt custo `10` |
| `birth_date` | Sim | Date valido |
| `enter_date` | Sim | Date valido |
| `exit_date` | Nao | Date valido se enviado |
| `gender` | Nao | Trim ou null |
| `cooperative_id` | Sim | BigInt |

### Regras

- CPF duplicado retorna `409` com mensagem generica para evitar exposicao explicita de documento, cooperativa ou titular.
- CPF e PIS precisam conter 11 digitos; RG precisa conter 8 ou 9 digitos.
- `manager` so pode criar usuario na propria cooperativa; `admin` pode informar outra cooperativa.
- CPF e identidade global de login: como o login usa CPF como identificador, a criacao serializa a tabela `Workers` e bloqueia duplicidade global antes de persistir. A resposta de conflito continua generica e nao informa se o CPF existe, em qual cooperativa esta ou quem e o titular.
- Cria `Workers`.
- Retorna mensagem gerencial sem tratar catador como publico primario da web.

## `POST /api/users/update`

Arquivo: `src/app/api/users/update/route.ts`

Atualiza usuario administrativo.

### Regras

- Exige `id`, nome, datas e cooperativa.
- PIS/RG sao opcionais em atualizacao administrativa; quando omitidos ou mascarados, os documentos persistidos sao preservados. A UI so envia PIS/RG completos depois de `reveal=documents`.
- PIS precisa conter 11 digitos; RG precisa conter 8 ou 9 digitos.
- `user_type` precisa ser `0` ou `1`.
- Senha e opcional; se enviada, atualiza com bcrypt custo `10`.
- `manager` so pode atualizar usuario da propria cooperativa e manter cooperativa dentro desse escopo.
- Conecta nova cooperativa via relation `cooperativeRef.connect`.
- Bloqueia troca de cooperativa quando o usuario ja possui vendas, medicoes ou contribuicoes associadas; isso preserva a invariavel entre `Workers.Cooperative` e `Sales.cooperative_id`.
- Nao atualiza CPF.

## `POST /api/users/delete`

Arquivo: `src/app/api/users/delete/route.ts`

### Body

```json
{ "id": "1" }
```

### Regras

- Verifica se worker existe.
- `manager` so pode excluir usuario da propria cooperativa.
- Bloqueia se houver vendas (`Sales.responsible`), medicoes (`Measurments.wastepicker`) ou contribuicoes (`WorkerContributions.wastepicker`).
- Remove worker se nao houver vinculos.

## `POST /api/users/assign-wastepicker-ids`

Arquivo: `src/app/api/users/assign-wastepicker-ids/route.ts`

Nao altera banco. Lista workers no escopo do usuario autenticado e informa IDs amigaveis gerados automaticamente por `formatWorkerId`.

Resposta inclui:

- `message`
- `updated: 0`
- `assignments`

## Campos cliente nao persistidos

As paginas `profile` e `manage-workers` mantem `phone` em estado/payload, mas o schema Prisma e os handlers atuais nao persistem telefone.
