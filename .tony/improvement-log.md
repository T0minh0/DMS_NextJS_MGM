# Tony Improvement Log

Registro de aprendizados recorrentes, friccoes e melhorias para o loop Tony neste projeto.

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
| 2026-05-14 | security | Peer review da S1-03 encontrou FKs independentes permitindo registros cross-coop em tabelas novas de gamificacao/notices. | Usar FKs compostas de tenant e smoke negativo cross-coop em migrations que combinam `worker_id` e `cooperative_id`. | concluido |
| 2026-05-14 | missing_test | S1-04 fecha invariantes de estoque na aplicacao, mas o banco ainda nao tem check constraint para `current <= collected - sold`. | Criar task futura de constraint/backfill de estoque antes de permitir mutacoes fora dos helpers canonicos. | aberto |
| 2026-05-16 | bug_pattern | P2002 capturado sem verificar `e.meta.target` pode silenciar constraint errada em endpoints de buyers. | Sempre checar `meta.target` antes de emitir resposta 409 de negocio; pattern canonico adicionado como convencao. | pendente |
| 2026-05-16 | accepted_risk | `/api/buyers` retorna todos os buyers sem filtro por cooperativa — catálogo global consistente com legado, mas pode ser problema se buyers forem scopados no futuro. | Criar task futura para avaliar scoping de buyers por cooperativa. | pendente |
| 2026-05-16 | bug_pattern | S3-01 round 1 usou status 'PENDING' no codigo que nunca existia no CHECK constraint do banco ('INVITED','ACCEPTED','LEFT'). Bug silencioso: passa no typecheck (string), falha em runtime com P2002. | Gate: script de smoke que valida valores literais de status contra a migration antes de submeter ao QA. Ou constraint enum no Prisma schema. | pendente |

| 2026-05-16 | bug_pattern | Codigo usou `'PENDING'` mas migration SQL define `CHECK status IN ('INVITED', 'ACCEPTED', 'LEFT')`. Prisma `String @db.VarChar(20)` e testes estaticos sao cegos a esta constraint. | Toda nova escrita em status de enum SQL deve ter teste de integracao ou constante compartilhada derivada da migration; nunca confiar apenas em testes de regex sobre codigo fonte. | pendente |
| 2026-05-16 | accepted_risk | S3-02 cancel/leave race estreita: cancel lê contribuicoes ACCEPTED apos updateMany mas antes de adquirir lock por coop; leave concorrente pode comitar LEFT+stock antes do lock do cancel, causando double stock return. | Apos `lockStockAggregateForUpdate` no loop do cancel, re-checar status da contribution antes de chamar adjustStock. Janela muito estreita e impacto e estoque em excesso (nao falta), mas vale fechar numa task de hardening. | pendente |

| 2026-05-16 | dx_friction | S3-06: `getMaterialName` (page.tsx:228) definida e nunca chamada — material_name ja vem no payload da API, funcao e dead code. | Remover funcao em cleanup/refactor proximo; nao re-criar se o design da API ja enriquece o payload no backend. | pendente |
| 2026-05-17 | security | S3-04 round 1 permitia que participante `INVITED` lesse relatorio coletivo completo com pesos e revenue_share. | Relatorio completo deve usar helper compartilhado e permitir somente admin, cooperativa criadora ou participante `ACCEPTED`; testes devem cobrir `INVITED` negado em JSON/PDF. | concluido |
| 2026-05-17 | missing_test | S5-03 fechou corridas conhecidas de venda coletiva por lock order, mas a cobertura de concorrencia ainda e estrutural/estatica, nao multi-transacao real em Postgres. | Criar smoke futuro com Postgres descartavel exercitando intercalacoes reais de `edit`/`invite`/`join`/`contribution`/`cancel`/`complete`. | pendente |

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

### [dx_friction] ClickUp recusou time entry do QA
- **Data:** 2026-05-13
- **Agente:** qa-reviewer
- **Task:** 86e1c9dr3
- **Fonte:** qa_comment
- **Sinal:** PASS com warning
- **Descricao:** Ao finalizar a S0-11, o QA tentou registrar time entry `tony-qa`, mas o ClickUp recusou por limite do plano de Advanced Time Tracking.
- **Causa raiz:** Limite de plano/configuracao do workspace ClickUp, nao falha do codigo.
- **Impacto:** Tempo de QA pode ficar fora do tracking automatico; comentarios finais continuam sendo a fonte de evidencia.
- **Sugestao:** Tratar time tracking como best-effort no Tony quando o workspace nao tiver Advanced Time Tracking habilitado.
- **Acao sistemica:** convencao
- **Status:** pendente

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

### [security] migrations multitenant precisam de FKs compostas
- **Data:** 2026-05-14
- **Agente:** codex-peer-reviewer
- **Task:** 86e136c4z
- **Fonte:** peer_review
- **Sinal:** FAIL
- **Descricao:** Peer review da S1-03 identificou que `worker_achievement`, `leaderboard_entry`, `notice_board.created_by` e `achievement_xp_override.updated_by` tinham `worker_id` e `cooperative_id` com FKs independentes, permitindo registros cross-coop no nivel do banco.
- **Causa raiz:** a migration validava existencia dos registros, mas nao amarrava o worker ao mesmo tenant do registro cooperativo.
- **Impacto:** risco de violar scoping cooperativo em jobs/APIs futuras mesmo com RBAC correto na camada de aplicacao.
- **Sugestao:** para novas tabelas multitenant, preferir superchaves e FKs compostas como `(worker_id, cooperative_id)` quando o dado carrega os dois campos; incluir smoke negativo cross-coop no runbook ou teste de integracao.
- **Acao sistemica:** convencao
- **Resolucao:** S1-03 passou a criar `Workers_worker_cooperative_key` e FKs compostas para achievements, leaderboard, notices e XP overrides; smoke Postgres bloqueou inserts cross-coop.
- **Status:** concluido

### [bug_pattern] P2002 sem meta.target check silencia constraint errada

- **Data:** 2026-05-16
- **Agente:** codex-peer-reviewer + qa-reviewer
- **Task:** 86e136c5j (S2-02)
- **Fonte:** peer_review
- **Sinal:** PASS com correccao previa ao QA
- **Descricao:** Os endpoints `/api/buyers` e `/api/sales/buyers` capturavam `P2002` sem verificar `e.meta.target`, o que poderia engolir silenciosamente violacoes de outras constraints no mesmo modelo (ex: futuro unique em email/cpf), retornando 409 enganoso.
- **Causa raiz:** pattern comum de `catch(P2002)` sem discriminar qual constraint disparou; peer review encontrou antes da producao.
- **Impacto:** Silenciar constraints erradas mascara bugs de dados e impede debugging correto de violacoes de integridade.
- **Sugestao:** Ao tratar P2002, sempre checar `e.meta?.target` e fazer match contra o nome da constraint esperada antes de emitir resposta de negocio. Pattern padrao: `String(e.meta?.target ?? '').toLowerCase().includes('nome_da_coluna')`.
- **Acao sistemica:** convencao — revisao de todos os handlers P2002 existentes no projeto para verificar se ha outros sem meta.target check.
- **Status:** pendente

### [bug_pattern] Status enum em CHECK SQL invisivel para Prisma schema e testes estaticos

- **Data:** 2026-05-16
- **Agente:** qa-reviewer
- **Task:** 86e136ccn (S3-01)
- **Fonte:** qa_final — inspecao manual de migration vs codigo
- **Sinal:** FAIL
- **Descricao:** Migration `20260513233000_s1_02_collective_sales/migration.sql` cria `CONSTRAINT "collective_sale_contribution_status_check" CHECK ("status" IN ('INVITED', 'ACCEPTED', 'LEFT'))`. O codigo da S3-01 usa `'PENDING'` em todos os paths de invite e invitations. Nenhuma migration posterior altera esta constraint. Qualquer insert com `'PENDING'` seria rejeitado pelo banco com erro de CHECK violation, resultando em 500 nos endpoints `/invite` e `/join`.
- **Causa raiz:** Prisma nao modela raw CHECK constraints — o schema declara `status String @db.VarChar(20)` sem restricao de valores. Testes estaticos (regex sobre codigo fonte) sao cegos ao que o banco vai aceitar. O dev nao verificou a migration original ao escolher o valor `'PENDING'`.
- **Impacto:** AC #4 (invite) e AC #5 (join) nao funcionam em producao — qualquer convite retorna 500; flow PENDING→ACCEPTED e inacessivel.
- **Sugestao:** Opcao A — renomear `'PENDING'` para `'INVITED'` no codigo (valor ja permitido pela constraint existente); Opcao B — nova migration que altera o CHECK para incluir `'PENDING'`. Adicionalmente: criar constante compartilhada (`CONTRIBUTION_STATUSES`) que derive do enum da migration e seja importada tanto no codigo quanto nos testes, tornando o drift detectavel em typecheck.
- **Acao sistemica:** convencao — toda nova tabela com campo de status deve ter: (1) enum ou constante compartilhada no codigo, (2) teste de integracao que escreva no banco, ou (3) assertion explicitica no peer review checklist "valores de status batem com a migration SQL".
- **Status:** pendente

### [accepted_risk] RBAC scope de buyers nao filtra por cooperativa

- **Data:** 2026-05-16
- **Agente:** qa-reviewer
- **Task:** 86e136c5j (S2-02)
- **Fonte:** peer_review (MEDIO — deferido ao backlog)
- **Sinal:** PASS com risco aceito
- **Descricao:** `/api/buyers` e `/api/sales/buyers` autenticam com `requireManagerOrAdmin` + `requireScopedPermission('sales','read','cooperative')`, mas retornam TODOS os buyers sem filtrar por cooperativa do usuario. Buyers sao catálogo global no dominio atual, o que e consistente com o comportamento pre-existente de `/api/sales/buyers`.
- **Causa raiz:** buyers foram modelados como lista global compartilhada entre cooperativas; scoping por cooperativa exigiria redesign do modelo e migracao de dados.
- **Impacto:** Manager de cooperativa A ve buyers registrados por cooperativa B. Para o modelo de negocio atual (catalogo compartilhado), esto e esperado — mas pode tornar-se problema se buyers forem associados a contratos especificos.
- **Sugestao:** Criar task futura para avaliar se buyers devem ser scopados por cooperativa ou manter catalogo global; se scopados, adicionar campo `cooperativeId` ao modelo e migracao.
- **Acao sistemica:** task futura
- **Dono/prazo:** backlog Tony DMS / antes de multi-tenant buyers.
- **Status:** pendente

### [security] Relatorio coletivo completo nao pode ser aberto por convite pendente

- **Data:** 2026-05-17
- **Agente:** codex-peer-reviewer + dev-tony + security-auditor
- **Task:** 86e136cd1 (S3-04)
- **Fonte:** peer_review
- **Sinal:** FAIL round 1, corrigido antes do QA
- **Descricao:** O endpoint JSON de relatorio coletivo aceitava contributions com status `INVITED` como participante suficiente para ler o relatorio completo, expondo `contributed_weight` e `revenue_share` de todas as cooperativas antes do convite ser aceito. O mesmo padrao existia no PDF coletivo.
- **Causa raiz:** A regra de acesso confundia "convite visivel" com "participacao aceita"; testes estaticos verificavam apenas a existencia de logica de participante, nao o status autorizado.
- **Impacto:** IDOR/scoping leak para manager convidado ainda nao aceito, com dados operacionais e financeiros de outras cooperativas.
- **Sugestao:** Centralizar acesso de relatorio completo em helper compartilhado e exigir testes com `INVITED`/`LEFT` negados e `ACCEPTED` permitido para qualquer novo formato de relatorio coletivo.
- **Acao sistemica:** helper `src/lib/reports/collective-access.ts` e testes S3-04/S3-05.
- **Status:** concluido

### [missing_test] invariante fisica de estoque ainda depende dos helpers
- **Data:** 2026-05-14
- **Agente:** qa-reviewer
- **Task:** 86e136c55
- **Fonte:** qa_final
- **Sinal:** PASS com accepted_risk
- **Descricao:** S1-04 adiciona helpers transacionais canonicos (`addToStock`, `recordSale`, `adjustStock`) com `Prisma.Decimal`, updates condicionais e guards contra estoque negativo/over-release, mas o schema atual ainda nao possui check constraint que garanta `current_stock_kg <= total_collected_kg - total_sold_kg` diretamente no banco.
- **Causa raiz:** a task foi limitada a helpers de aplicacao, Decimal e documentacao operacional; constraint/backfill de dados fisicos fica fora do escopo desta entrega.
- **Impacto:** mutacoes futuras que escrevam em `Stock` sem usar `src/lib/stock/ledger.ts` podem reintroduzir corrupcao silenciosa de estoque.
- **Sugestao:** abrir task futura para backfill/constraint de estoque e exigir em review que novas mutacoes de estoque passem pelos helpers canonicos ate a constraint existir.
- **Acao sistemica:** task futura
- **Dono/prazo:** backlog Tony DMS / antes de qualquer nova rota ou job que escreva em `Stock`.
- **Status:** pendente

### [bug_pattern] Validacao de API deve refletir constraints fisicas antes do banco

- **Data:** 2026-05-17
- **Agente:** codex-peer-reviewer + dev-tony
- **Task:** 86e136cdp (S4-03)
- **Fonte:** peer_review
- **Sinal:** FAIL rounds 1 e 2, corrigido antes do QA
- **Descricao:** O PATCH de override XP inicialmente aceitava `xpReward = 0`, embora a migration exija `xp_reward_override > 0`; depois tambem aceitava inteiros acima do range `Int` do Prisma/Postgres e nao mapeava `ApiRequestError` de JSON invalido, podendo transformar input ruim em 500.
- **Causa raiz:** A validacao de payload foi escrita contra o DTO esperado, mas nao contra todos os limites fisicos do schema (`CHECK > 0`, tipo `Int`) nem contra o contrato central de erro API.
- **Impacto:** Requests malformados ou fora do range poderiam gerar erro interno, mascarar problema de cliente e poluir logs operacionais.
- **Sugestao:** Em endpoints que escrevem no banco, conferir migration/schema antes de liberar payload: limites numericos, checks, FKs compostas e shape JSON. Sempre mapear `ApiRequestError` antes de `apiInternalErrorResponse`.
- **Acao sistemica:** convencao
- **Resolucao:** S4-03 passou a validar `xpReward` em `1..2147483647`, negar escrita cross-coop antes da FK composta e mapear JSON invalido com `apiRequestErrorResponse`.
- **Status:** concluido

### [missing_test] Dashboard async precisa de teste comportamental de resposta obsoleta

- **Data:** 2026-05-17
- **Agente:** codex-peer-reviewer + dev-tony
- **Task:** 86e136ck7 (S5-01)
- **Fonte:** peer_review_delta
- **Sinal:** PASS com warning
- **Descricao:** A S5-01 adicionou `dashboardRequestSeq` para impedir que respostas antigas de `loadDashboard()` sobrescrevam filtros mais recentes, mas a cobertura automatizada ainda e estatica por string em `tests/dashboard-s501-ui.test.ts`.
- **Causa raiz:** O projeto ainda nao tem harness de componente com fetch controlavel para provar ordering de promessas em UI client-side.
- **Impacto:** O guard atual foi revisado e validado por peer review, mas uma regressao futura poderia passar se mantivesse os nomes de variaveis e removesse a semantica correta.
- **Sugestao:** Criar teste comportamental de dashboard com promises mockadas: disparar duas cargas, resolver a mais nova primeiro e a antiga depois, e assertar que o estado renderizado permanece no recorte mais recente.
- **Acao sistemica:** teste
- **Status:** pendente

### [accepted_risk] Identidade client-side ainda e espelhada em localStorage fora do dashboard

- **Data:** 2026-05-17
- **Agente:** security-auditor + dev-tony
- **Task:** 86e136ck7 (S5-01)
- **Fonte:** security_audit_delta
- **Sinal:** PASS com warning
- **Descricao:** A S5-01 removeu a dependencia do dashboard em `localStorage` e passou a usar `/api/auth/session`, mas `Layout` ainda espelha a sessao derivada do servidor em `localStorage` para compatibilidade com paginas legadas que leem dados de usuario para UX/body defaults.
- **Causa raiz:** A migracao de todas as telas para sessao server-derived ainda nao ocorreu; S5-01 focou dashboard, navegacao e bloqueio de acesso direto.
- **Impacto:** APIs seguem sendo a fronteira real de autorizacao, mas paginas legadas podem exibir estado client-side desatualizado ou confiavel demais para UX se o storage for adulterado.
- **Sugestao:** Nas proximas tasks S5, migrar telas gerenciais legadas para `/api/auth/session` ou dados retornados por endpoints escopados e remover gradualmente a persistencia de role/cooperativa em `localStorage`.
- **Acao sistemica:** task futura
- **Status:** pendente

### [accepted_risk] Ajuste manual de estoque ainda nao possui ledger imutavel dedicado

- **Data:** 2026-05-17
- **Agente:** security-auditor + dev-tony
- **Task:** 86e1c9eqx (S5-06)
- **Fonte:** security_audit
- **Sinal:** PASS com warning baixo
- **Descricao:** A tela `/materials` exige confirmacao de impacto e o endpoint `POST /api/stock` valida RBAC, cooperativa e integridade de estoque, mas o ajuste manual ainda nao persiste motivo, saldo anterior/posterior, ator e requestId em uma tabela ledger dedicada.
- **Causa raiz:** O contrato atual de ajuste manual reutiliza o helper canonico de incremento de estoque e logs estruturados; trilha auditavel operacional ficou fora do escopo da UX S5-06.
- **Impacto:** Operacao consegue ajustar saldo com seguranca de escopo, mas auditoria posterior depende de logs e do estado agregado, nao de um historico imutavel por ajuste.
- **Sugestao:** Criar task futura para `stock_adjustment_ledger` com ator, cooperativa, material, delta, saldo anterior, saldo posterior, motivo, requestId e timestamp; exigir motivo na UI quando essa tabela existir.
- **Acao sistemica:** task futura
- **Dono/prazo:** backlog Tony DMS / antes de uso operacional real de ajustes manuais como processo auditavel.
- **Status:** pendente

### [accepted_risk] JWT ainda carrega CPF do usuario

- **Data:** 2026-05-17
- **Agente:** security-auditor + dev-tony
- **Task:** 86e1c9eqx (S5-06)
- **Fonte:** security_audit
- **Sinal:** PASS com warning baixo
- **Descricao:** O token de autenticacao assinado no login ainda inclui `cpf` no payload. O cookie e `httpOnly`, `sameSite` e `secure` em producao, e a S5-06 nao altera login/session, mas o principio de minimizacao recomenda remover esse dado se nenhuma rota server-side precisar dele no JWT.
- **Causa raiz:** Payload legado de autenticacao carrega documento pessoal por conveniencia historica; S5-05/S5-06 reduziram exposicao de PII na UI, mas nao redesenharam o token.
- **Impacto:** Em caso de vazamento de token, ha mais PII do que o necessario dentro do payload assinado.
- **Sugestao:** Criar task futura para remover `cpf` de `signAuthToken`, ajustar `AuthTokenPayload` e validar que rotas que precisam de documento consultem o banco com RBAC em vez de confiar no token.
- **Acao sistemica:** task futura
- **Dono/prazo:** backlog Tony DMS / antes de endurecimento final de privacidade para producao.
- **Status:** pendente

### [missing_test] Concorrencia coletiva precisa de smoke multi-transacao real

- **Data:** 2026-05-17
- **Agente:** qa-reviewer + dev-tony
- **Task:** 86e136ckx (S5-03)
- **Fonte:** qa_final
- **Sinal:** PASS com accepted_risk
- **Descricao:** A S5-03 serializou `edit`, `invite`, `join`, `contribution`, `leave`, `cancel` e `complete` com `lockCollectiveSaleForUpdate`, alem de cobrir invariantes por testes estaticos/estruturais. QA aceitou o gate, mas registrou que ainda nao ha teste multi-transacao real em Postgres provando intercalacoes concorrentes.
- **Causa raiz:** O suite atual roda majoritariamente por analise de fonte e unit tests sem banco concorrente controlado; criar harness transacional descartavel ficou fora do escopo da task.
- **Impacto:** O lock order foi revisado e validado, mas uma regressao futura poderia passar se preservasse strings/ordem aparente sem exercitar bloqueios reais de banco.
- **Sugestao:** Criar smoke com Postgres descartavel que abra transacoes concorrentes e teste intercalacoes `edit` vs `contribution`, `invite/join` vs `cancel/complete`, e `cancel` vs `leave`, assertando estoque, status e ausencia de deadlock.
- **Acao sistemica:** task futura
- **Dono/prazo:** backlog Tony DMS / antes de cutover operacional real com concorrencia multiusuario.
- **Status:** pendente
