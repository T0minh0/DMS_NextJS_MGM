# Matriz de fixtures UAT gerenciais

Task ClickUp: `86e1c9e7z` (`[S0-13] Fixtures gerenciais de UAT e matriz de dados por papel`).

Fonte estruturada: `src/lib/uat/fixtures.ts`.
Seed local: [[Operacao/Seed-e-dados-locais]].
Jornadas alvo: [[Planejamento/Jornadas-gerenciais-IA]].

## Objetivo

Fornecer dados sinteticos e repetiveis para provar fluxos web de gestores sem depender de producao, PII real ou comportamento legado incerto.

## Regras

- Nenhum CPF/PIS/RG real deve aparecer nos fixtures.
- CPFs sinteticos usam prefixo `000`.
- PIS sinteticos usam prefixo `900`.
- RGs sinteticos usam prefixo `990`.
- Manager deve enxergar apenas a propria cooperativa.
- Operator e viewer sao personas de produto; ate existir RBAC dedicado, ambos mapeiam para `manager` no seed e devem ser tratados como lacuna em tasks que precisarem de permissao fina.

## Papel -> fixture

| Papel de produto | Fixture | RBAC atual | Documento sintetico | Uso em UAT |
| --- | --- | --- | --- | --- |
| Admin | `admin-system` | `admin` | CPF `00000000001` | Configuracao global, catalogo e suporte |
| Gerente Horizonte | `manager-horizonte` | `manager` | CPF `00000000002` | Fluxos principais da cooperativa Horizonte |
| Operador Horizonte | `operator-horizonte` | `manager` temporario | CPF `00000000003` | Operacao/pesagens ate RBAC dedicado |
| Visualizador Horizonte | `viewer-horizonte` | `manager` temporario | CPF `00000000004` | Leitura/relatorios ate RBAC dedicado |
| Worker ativo | `worker-horizonte-active` | `worker` | CPF `00000000011` | Produtividade e login web negado |
| Worker sem operacao | `worker-horizonte-empty` | `worker` | CPF `00000000012` | Estados vazios de produtividade/equipe |
| Worker desligado | `worker-horizonte-inactive` | `worker` | CPF `00000000013` | Estado desligado/inativo |
| Gerente Leste | `manager-leste` | `manager` | CPF `00000000022` | Cross-coop negativo |
| Worker Leste | `worker-leste` | `worker` | CPF `00000000023` | Cross-coop negativo |

## Material -> cenario

| Fixture | Cenario | Tela alvo |
| --- | --- | --- |
| `cardboard-stocked` | Estoque suficiente | `/`, `/materials`, `/sales` |
| `pet-stocked` | Estoque suficiente | `/materials`, `/sales` |
| `aluminum-low-stock` | Estoque baixo | `/`, `/materials` |
| `glass-empty-stock` | Sem estoque | `/materials`, `/sales`, pendencias |
| `leste-cardboard-stocked` | Dado de outra cooperativa | Teste negativo cross-coop |

## Vendas

| Fixture | Estado alvo | Persistido no schema atual | Proxima task |
| --- | --- | --- | --- |
| `normal-active-horizonte` | ativa | Sim, com `sold_at`/`cancelled_at` nulos | S2-01 deve portar complete/cancel |
| `normal-completed-horizonte` | concluida | Sim, como venda historica | S2-01/S3-04 refinam relatorios |
| `normal-cancelled-horizonte` | cancelada | Sim, como `cancelled_at` | S2-01 deve portar endpoint/UX de cancelamento |
| `leste-cardboard-sale` | concluida cross-coop | Sim, como venda da Leste | Negativo para gerente Horizonte |
| `collective-open-two-coops` | convite aberto | Nao | S1-02/S3-01 |
| `collective-contribution-pending` | contribuicao pendente | Nao | S3-02 |

## Jornada -> dados

| Jornada S0-11 | Rotas | Fixtures | Lacuna declarada | Negativo |
| --- | --- | --- | --- | --- |
| Abrir painel do dia | `/login`, `/` | `manager-horizonte`, `cardboard-stocked`, `aluminum-low-stock`, `normal-active-horizonte` | Nenhuma para telas atuais | `worker-web-login-denied` |
| Revisar estoque critico | `/materials` | `aluminum-low-stock`, `glass-empty-stock`, `leste-cardboard-stocked` | Nenhuma para telas atuais | `manager-horizonte-worker-leste-denied` |
| Criar e acompanhar venda normal | `/sales` | `normal-active-horizonte`, `normal-completed-horizonte`, `normal-cancelled-horizonte` | S1-01 persiste lifecycle; S2-01 porta complete/cancel e UX | `manager-horizonte-sale-leste-denied` |
| Criar ou participar de venda coletiva | futura area de vendas coletivas | `collective-open-two-coops`, `collective-contribution-pending` | Schema/API dependem de S1-02/S3-01/S3-02 | `manager-horizonte-sale-leste-denied` |
| Gerenciar equipe | `/manage-workers`, `/worker-productivity` | `manager-horizonte`, `worker-horizonte-active`, `worker-horizonte-empty`, `worker-horizonte-inactive`, `worker-leste` | UX final em S5-05 | `manager-horizonte-worker-leste-denied` |
| Publicar aviso | futura `/notices` | `notice-global-safe`, `notice-coop-horizonte`, `notice-xss-blocked` | Persistencia depende de S4-01/S4-02 | Manager nao publica global |
| Baixar relatorio/PDF | futura `/reports` | `normal-completed-horizonte`, `collective-open-two-coops`, `normal-cancelled-horizonte` | PDF real depende de S3-04/S3-05 | Relatorio cross-coop negado |
| Investigar pendencia operacional | `/`, `/materials`, `/worker-productivity` | `glass-empty-stock`, `worker-horizonte-empty`, `job-pending-achievements` | Fila/jobs persistidos dependem de S4/S5 | Debug/recalc exige admin |

## Evidencia esperada

- `npm run db:seed:uat` em banco local/preview descartavel.
- `npm test` cobrindo `tests/uat-fixtures.test.ts`.
- `npm run quality` verde.
- Screenshot/browser evidence das tasks dependentes usando as fixtures acima.
- Comentario de QA citando qual fixture foi usada por jornada.
