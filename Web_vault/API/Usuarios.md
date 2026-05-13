# API - Usuarios e perfil

## `GET /api/user`

Arquivo: `src/app/api/user/route.ts`

### Query params

| Param | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | string BigInt | Condicional | Busca por `workerId` |
| `cpf` | string | Condicional | Busca por CPF em bytes |

Exige pelo menos `id` ou `cpf`.

### Retorno

Retorna `id`, `worker_id`, `wastepicker_id`, `full_name`, `cpf`/`CPF`, `PIS`, `RG`, `role`, `userType`, `user_type`, `email`, `gender`, datas, `cooperative_id` e `cooperative_name` para usuario autorizado no escopo.

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

Lista apenas catadores/trabalhadores (`mapUserType(userType) === 1`), ordenados por nome, incluindo cooperativa. `manager` recebe apenas a propria cooperativa; `admin` recebe todas.

Campos retornados incluem aliases para compatibilidade: `wastepicker_id`, `worker_id`, `user_id`, `full_name`, `worker_name`, `cooperative_id`, `CPF`, `cpf`, `PIS`, `RG`, datas e email. Documentos pessoais saem mascarados na listagem; fluxos de edicao buscam detalhe autorizado em `/api/user?id=...`.

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

- CPF duplicado retorna `409` com mensagem generica para evitar exposicao explicita de documento.
- CPF, PIS e RG precisam conter digitos.
- `manager` so pode criar usuario na propria cooperativa; `admin` pode informar outra cooperativa.
- Cria `Workers`.
- Retorna mensagem diferente para gerente e catador.

## `POST /api/users/update`

Arquivo: `src/app/api/users/update/route.ts`

Atualiza usuario administrativo.

### Regras

- Exige `id`, nome, datas, cooperativa, PIS e RG.
- `user_type` precisa ser `0` ou `1`.
- Senha e opcional; se enviada, atualiza com bcrypt custo `10`.
- `manager` so pode atualizar usuario da propria cooperativa e manter cooperativa dentro desse escopo.
- Conecta nova cooperativa via relation `cooperativeRef.connect`.
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
