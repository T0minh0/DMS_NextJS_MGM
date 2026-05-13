# Log de melhorias

Espelho operacional de `.tony/improvement-log.md`.

| Data | Categoria | Observacao | Acao sugerida | Status |
| --- | --- | --- | --- | --- |
| 2026-04-27 | dx_friction | `DOCUMENTATION.md` descreve MongoDB/Mongoose, mas o codigo atual usa Prisma/PostgreSQL. | Atualizar a documentacao tecnica antes de usa-la como fonte em tasks futuras. | aberto |
| 2026-04-27 | missing_test | Cobertura automatizada ainda esta concentrada em auth/RBAC/debug e checks de tooling. | Expandir smoke tests com banco controlado para fluxos criticos. | aberto |
| 2026-04-27 | convention_violation | UI mistura tokens DMS verdes com paleta vinho inline. | Consolidar tokens e reduzir estilos inline quando houver task visual. | aberto |
| 2026-04-27 | dx_friction | `npm run lint` falhava no Next 16.1.4 porque `next lint` nao era mais um comando valido neste formato. | Migrado para `eslint .` e coberto por `npm run quality`. | concluido |
| 2026-04-27 | security | `npm install` reportou 12 vulnerabilidades em dependencias, sendo 3 moderadas e 9 altas. | Resolvido em S0-12; `npm audit` e `npm audit --omit=dev` retornam 0 vulnerabilidades. | concluido |
| 2026-04-27 | agent_improvement | Vault expandido com documentacao completa de arquitetura, API, dominio, UI, operacao, seguranca e backlog tecnico. | Manter as notas sincronizadas apos cada task que alterar contrato, schema ou fluxo. | em andamento |
| 2026-04-27 | dx_friction | O workspace `/Web` contem dois repositorios e pode confundir o Tony quando iniciado fora do repo oficial. | Manter `.tony` e `.codex` da raiz apontando para `DMS_NextJS_MGM` e executar comandos do app nesse diretório. | concluido |
| 2026-05-13 | security | Auditoria S0-12 apontou enumeração limitada em `/api/user` por diferença entre `403` fora de escopo e `404` inexistente. | Incorporar na S5-05: filtrar consulta por cooperativa para manager ou normalizar fora de escopo para `404`. | aberto |
| 2026-05-13 | missing_test | QA da S0-09 encontrou respostas 4xx diretas em rotas API tocadas, sem `code`, `requestId` e header `x-request-id`, apesar de `npm run quality` passar. | Adicionado teste estático em `tests/observability.test.ts` bloqueando `NextResponse.json(..., { status: 4xx/5xx })` fora dos helpers de erro. | concluido |

## Entradas detalhadas

### [security] npm audit de producao ainda acusa CVEs altas
- **Data:** 2026-05-13
- **Agente:** dev-tony
- **Task:** 86e136bvr
- **Fonte:** audit
- **Sinal:** PASS com warning
- **Descricao:** `npm audit --omit=dev` falhou com 6 vulnerabilidades em dependencias de producao: `next`, `postcss`, `prisma`/`@prisma/config` via `effect`, e `defu`. A dependencia central desta task, `sanitize-html`, esta travada em `2.17.3` no lockfile e nao aparece como vulneravel.
- **Causa raiz:** baseline de dependencias do Next/Prisma ficou desatualizado em relacao aos advisories recentes.
- **Impacto:** risco de DoS/XSS/cache/proxy e supply chain fora da POC de PDF/sanitizacao; precisa ser tratado antes de considerar o sistema production ready.
- **Sugestao:** incorporar `npm audit --omit=dev` na task `86e1c9e29` / `[S0-12] Preflight production hardening de logs, debug, proxy e fallbacks`, atualizando Next/Prisma/PostCSS/defu ou registrando accepted risk formal com dono e prazo.
- **Acao sistemica:** task
- **Resolucao:** incorporado na task `86e1c9e29`; lockfile/dependencias atualizados e `postcss` fixado por override.
- **Status:** concluido

### [security] `/api/user` pode diferenciar fora de escopo e inexistente
- **Data:** 2026-05-13
- **Agente:** security-auditor
- **Task:** 86e1c9e29
- **Fonte:** security_audit
- **Sinal:** PASS com warning baixo
- **Descricao:** `/api/user?id|cpf` pode diferenciar `404` de usuario inexistente e `403` de usuario fora do escopo, permitindo enumeracao limitada para gerente autenticado.
- **Causa raiz:** consulta encontra o usuario antes de normalizar o resultado para escopo cooperativo.
- **Impacto:** baixo; requer sessao autenticada e nao expõe payload fora de escopo, mas pode revelar existencia de identificadores.
- **Sugestao:** em S5-05, consultar ja filtrando por cooperativa para nao-admin ou responder `404` tanto para inexistente quanto para fora de escopo.
- **Acao sistemica:** task existente `86e1c9eh1` / `[S5-05] UX de usuarios, equipe e PII para gerentes de cooperativa`
- **Status:** pendente

### [missing_test] contrato de erro API nao coberto de forma exaustiva
- **Data:** 2026-05-13
- **Agente:** qa-reviewer
- **Task:** 86e136bwb
- **Fonte:** qa_comment
- **Sinal:** FAIL
- **Descricao:** QA encontrou respostas 4xx diretas em rotas tocadas por S0-09, como `/api/user/change-password`, `/api/users/create`, `/api/users/update`, `/api/user` e `/api/materials/[id]`, retornando apenas `{ message }` ou `{ error }` sem `code`, `requestId` e header `x-request-id`.
- **Causa raiz:** a migracao para `src/lib/api/errors.ts` nao foi aplicada de forma exaustiva e a suite nao tem guardrail para o contrato de erro.
- **Impacto:** viola o aceite "API errors usam formato consistente" e dificulta correlacao operacional de erros 4xx/5xx.
- **Sugestao:** migrar todos os retornos de erro API tocados para `apiErrorResponse`/`apiRouteErrorResponse` e adicionar checagem estatica ou teste que bloqueie novos `NextResponse.json(..., { status: 4xx/5xx })` fora dos helpers.
- **Acao sistemica:** teste
- **Resolucao:** retornos 4xx/5xx diretos migrados para `apiErrorResponse`; `tests/observability.test.ts` agora varre `src/app/api` e `src/lib/debug-routes.ts` contra regressao.
- **Status:** concluido
