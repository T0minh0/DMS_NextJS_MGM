# Tony

## ClickUp

- Workspace: `Workspace` (`90171146616`)
- Espaco: `Pessoal` (`90175337568`)
- Lista: `DMS web` (`901713278884`)
- Assignee padrao: `Antonio Guimaraes` (`296418383`)

## Status

- `todo`: `A fazer`
- `in_progress`: `Fazendo`
- `rejected`: `Validação reprovada`
- `review`: `Aguardando validação`
- `done`: `Completo e aprovado`

## Runtime

O runtime roda em modo heartbeat com intervalo de 10 minutos e fila `rejected`, depois `todo`.

## Mapa do workspace

- Wrapper local: `/Users/cammis/Repositorio/UNB/DMS/Web`.
- Repo oficial do Tony: `/Users/cammis/Repositorio/UNB/DMS/Web/DMS_NextJS_MGM`.
- Repo secundario/legado: `/Users/cammis/Repositorio/UNB/DMS/Web/network_management_system`.
- Na raiz `/Web`, `.tony` e `.codex` sao links para as pastas canonicas em `DMS_NextJS_MGM`.
- Comandos de app, npm, Prisma, build e validacao devem rodar com working directory em `DMS_NextJS_MGM`.

## Arquivos de configuracao

- `.tony/config.json`: projeto, stack, ClickUp, vault, design, runtime e agentes.
- `.tony/conventions.md`: convencoes tecnicas.
- `.tony/design.md`: contrato visual.
- `.tony/improvement-log.md`: melhorias recorrentes.
- `.tony/session-history.md`: historico de sessoes.
- `.codex/config.toml`: limite de agentes.
- `.codex/agents/*.toml`: personas.

## Agentes scaffoldados

| Agente | Uso esperado |
| --- | --- |
| `planner` | Questionar backlog, riscos, dependencias e criterios vagos |
| `codex-peer-reviewer` | Revisao adversarial de codigo |
| `qa-reviewer` | Gate final de QA e status |
| `uat-tester` | Teste browser-first de aceite |
| `design-critic` | Critica UI/UX |
| `ui-implementer` | Implementacao de tasks UI-only seguindo `.tony/design.md` |
| `security-auditor` | Auditoria de seguranca |

## Como o vault deve ser usado

- Antes de implementar task de API, ler [[API/Rotas]] e a nota especifica do grupo.
- Antes de mexer em UI, ler [[Arquitetura/Frontend-e-UI]] e `.tony/design.md`.
- Antes de mexer em banco, ler [[Dominio/Modelo-de-dados]], [[Dominio/Regras-de-negocio]] e [[Operacao/Seed-e-dados-locais]].
- Antes de aprovar task, conferir [[Operacao/Comandos-e-validacao]].
