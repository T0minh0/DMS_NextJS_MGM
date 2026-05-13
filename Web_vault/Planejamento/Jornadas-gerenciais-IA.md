# Jornadas gerenciais e arquitetura de informacao

Task ClickUp: `86e1c9dr3` (`[S0-11] Mapa de jornadas gerenciais, papeis e arquitetura de informacao`).

## Objetivo

Este mapa define como a web DMS deve se comportar para gerentes de cooperativas e operadores de gestao. Catadores/trabalhadores nao sao o publico primario da web; eles aparecem como registros de equipe, produtividade, contribuicao e historico operacional administrados por usuarios autorizados.

O codigo atual usa `UserRole = admin | manager | worker` em `src/lib/auth/shared.ts`. A matriz abaixo separa papeis de produto dos papeis tecnicos ja existentes para deixar claro o que pode ser implementado agora e o que ainda depende de RBAC dedicado.

Este documento descreve a arquitetura de informacao alvo e os gates das proximas tasks. Ele nao declara que o comportamento atual ja esta conforme. Quando o codigo atual diverge do alvo, a divergencia aparece na secao "Comparacao com RBAC atual" e deve bloquear production readiness ate a task indicada resolver ou aceitar formalmente o risco.

## Matriz de papeis de produto

| Papel de produto | Mapeamento atual | Escopo | Rotas alvo | Acoes permitidas | Dados visiveis | Testes negativos obrigatorios |
| --- | --- | --- | --- | --- | --- | --- |
| Admin do sistema | `admin` | Global e por cooperativa | `/`, `/materials`, `/sales`, `/manage-workers`, `/worker-productivity`, `/profile`, futuras `/notices`, `/reports`, area admin/dev | Configurar cooperativas, materiais globais, usuarios, recalc, debug dev-only, leitura e suporte cross-cooperativa | Dados operacionais globais; PII apenas quando necessario para suporte ou cadastro | Manager nao acessa acoes globais; usuario sem sessao recebe `401`/redirect; debug exige admin e flag/dev quando aplicavel |
| Gerente da cooperativa | `manager` | Somente propria cooperativa | `/`, `/materials`, `/sales`, `/manage-workers`, `/worker-productivity`, `/profile`, futuras `/notices`, `/reports` | Acompanhar painel, estoque, vendas, equipe, produtividade, avisos e relatorios da cooperativa | Dados da propria cooperativa com documentos mascarados em listagens; detalhe completo apenas em edicao/perfil autorizado | Nao ve outra cooperativa; nao executa recalc/debug global; nao cria recurso admin-only sem permissao server-side |
| Operador interno / gestao operacional | Gap: hoje cairia em `manager` | Propria cooperativa, subconjunto operacional | `/`, `/materials`, `/sales`, futuras filas de pendencias | Registrar pesagens/ajustes operacionais, acompanhar venda e estoque, resolver pendencias atribuidas | Dados operacionais sem PII completa e sem configuracao sensivel | Nao gerencia usuarios, PII, cooperativas, debug ou relatorios financeiros completos |
| Visualizador de relatorios | Gap: hoje cairia em `manager` | Propria cooperativa, leitura | `/`, futuras `/reports`, subconjunto de `/sales` e `/worker-productivity` | Filtrar, exportar e baixar relatorios aprovados | KPIs, relatorios e PDFs sem dados pessoais desnecessarios | Mutacoes em venda, estoque, usuario, aviso e admin retornam `403`; botoes de escrita nao aparecem |
| Suporte tecnico autorizado | Gap: hoje cairia em `admin` | Auditado, temporario e minimizado | Futura area admin/dev, `/profile`; acesso operacional sob break-glass | Diagnosticar incidente, ler logs/healthchecks, acionar ferramentas dev-only com trilha | Minimo necessario; PII redigida por padrao | Sem feature flag ou janela ativa, suporte nao acessa debug; acesso cross-cooperativa exige trilha e motivo |
| Worker / catador | `worker`, mas login web rejeita | Self/mobile-first | Web nao primaria; API self futura/mobile | Consultar apenas dados proprios em experiencias apropriadas | Somente dados proprios | Login web deve continuar rejeitando worker; rotas gerenciais nao podem ser expostas por navegacao |

## Matriz rota -> papel -> evidencia

| Rota | Admin | Gerente | Operador | Visualizador | Suporte | Worker | Evidencia de QA/browser |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/login` | Entrar | Entrar | Futuro | Futuro | Futuro | Rejeitado na web | Tentativa invalida, login fixture gerente/admin, worker rejeitado |
| `/` Dashboard | Global/filtrado | Cooperativa propria | Pendencias operacionais | KPIs leitura | Diagnostico se autorizado | Nao primario | KPIs, pendencias, estados vazio/loading/erro, console limpo |
| `/materials` | Ler e manter catalogo global | Ler estoque e solicitar/operar ajustes permitidos | Operar pesagens/ajustes permitidos | Leitura | Diagnostico | Nao primario | Busca, estoque critico, permissao negativa para mutacoes admin-only |
| `/sales` | Todas as cooperativas quando filtrado | Criar e acompanhar vendas da propria cooperativa | Criar/atualizar conforme permissao futura | Leitura/export | Diagnostico | Nao primario | Criar venda normal, estado sem estoque, cross-coop negado |
| Futura venda coletiva | Criar/participar globalmente conforme regra | Criar/participar pela cooperativa | Acompanhar operacao | Leitura | Diagnostico | Nao primario | Convite, contribuicao, cancelamento, permissao de cooperativa |
| `/manage-workers` | Gerir usuarios por cooperativa/global | Tela usa `/api/users`; S5-05 ainda deve minimizar PII e refinar UX cooperativa. | Sem acesso ou leitura limitada | Sem acesso | Redigido/auditado | Nao primario | Mascara PII, criar/editar usuario, negar outra cooperativa |
| `/worker-productivity` | Global/filtrado | Equipe propria | Equipe propria sem PII completa | Leitura agregada | Diagnostico | Nao primario | Filtro periodo/trabalhador, estado sem dados, worker fora de escopo negado |
| Futura `/notices` | Avisos globais e cooperativa | Avisos da cooperativa | Publicar operacional se permitido | Leitura | Diagnostico | Nao primario | Sanitizacao, escopo global/cooperativa, payload XSS negativo |
| Futura `/reports` | Relatorios globais/filtrados | Relatorios da cooperativa | Relatorios operacionais | Export/PDF leitura | Diagnostico | Nao primario | JSON/PDF, `no-store`, filename seguro, cross-coop negado |
| `/profile` | Proprio perfil | Proprio perfil | Proprio perfil | Proprio perfil | Proprio perfil | Nao primario | Editar dados permitidos, troca de senha, usuario invalido |

## Jornadas prioritarias

### 1. Abrir painel do dia

- Entrada: gerente acessa `/login`, autentica e cai em `/`.
- Primeira tela deve responder: estoque em risco, vendas em andamento, receita do periodo, equipe ativa, avisos recentes e proximas acoes.
- Estados obrigatorios: carregando por card, vazio acionavel, erro recuperavel por dominio e permissao negada clara.
- Fixture S0-13: gerente de cooperativa com materiais, estoque baixo, uma venda ativa, um aviso recente e equipe com produtividade parcial.
- Browser evidence: URL/title, DOM principal nao vazio, screenshot desktop/mobile, console sem logs de debug, filtro de periodo/material funcionando.

### 2. Revisar estoque critico

- Entrada: dashboard ou nav `Materiais e estoque`.
- Fluxo: filtrar materiais, identificar saldo baixo, abrir detalhes, decidir ajuste/pesagem ou encaminhar venda.
- Acoes destrutivas ou globais devem ser admin-only; gerente opera apenas a propria cooperativa.
- Fixture S0-13: material com estoque baixo, material sem estoque, material sem movimentacao.
- Teste negativo: gerente nao altera catalogo global se a API exigir admin; outra cooperativa nunca aparece em filtros.

### 3. Criar e acompanhar venda normal

- Entrada: nav `Vendas`.
- Fluxo: escolher material com estoque suficiente, comprador, peso, preco/kg e data; acompanhar ativa/historico/cancelada.
- O frontend deve explicar impacto em estoque e receita antes de confirmacoes financeiras.
- Fixture S0-13: comprador existente, material com estoque suficiente, material sem estoque suficiente.
- Teste negativo: tentativa de criar venda para cooperativa diferente retorna `403` e nao deixa rastro visual enganoso.

### 4. Criar ou participar de venda coletiva

- Entrada: futura area em `Vendas`.
- Fluxo: criar venda coletiva, convidar cooperativas, registrar contribuicao/reserva, acompanhar participantes e completar/cancelar.
- Dados precisam separar criador, participantes, contribuicoes e rateio.
- Fixture S0-13: venda coletiva aberta com duas cooperativas e uma contribuicao pendente.
- Teste negativo: gerente de cooperativa nao participante nao ve detalhes sensiveis nem altera contribuicao.

### 5. Gerenciar equipe

- Entrada: nav `Equipe`.
- Fluxo: buscar usuario, ver dados minimizados, criar/editar, desativar quando permitido, abrir produtividade.
- Linguagem: usar `equipe` e `usuarios`; `catador` ou `trabalhador` apenas em campos de tipo, produtividade ou historico.
- PII alvo: CPF/PIS/RG mascarados por padrao; revelar/editar somente em contexto explicito e permitido. Estado atual: `GET /api/users` mascara documentos e `/manage-workers` busca detalhe autorizado somente ao editar.
- Fixture S0-13: gerente, trabalhador ativo, trabalhador sem ID operacional, usuario desligado.
- Teste negativo: usuario de outra cooperativa e PII completa nao aparecem para gerente comum.

### 6. Publicar aviso

- Entrada: futura nav `Avisos`.
- Fluxo: criar aviso com titulo, conteudo, escopo global/cooperativa, prioridade e expiracao.
- Conteudo HTML deve passar por `sanitizeNoticeTitle` e `sanitizeNoticeContent`.
- Fixture S0-13: aviso global, aviso da cooperativa, aviso expirado, payload XSS bloqueado.
- Teste negativo: gerente nao publica aviso global; payload malicioso nao reaparece no DOM.

### 7. Baixar relatorio/PDF

- Entrada: futura nav `Relatorios` ou detalhe de venda.
- Fluxo: selecionar periodo/venda, ver previa JSON, baixar PDF.
- PDF deve usar `@react-pdf/renderer`, `runtime = 'nodejs'`, `Content-Disposition` seguro e `Cache-Control: no-store`.
- Fixture S0-13: venda normal concluida, venda coletiva concluida, venda cancelada.
- Teste negativo: gerente nao baixa relatorio de outra cooperativa; visualizador nao executa recalc.

### 8. Investigar pendencia operacional

- Entrada: card de alerta no dashboard, fila futura ou estado de erro de dominio.
- Fluxo: abrir pendencia, ver causa provavel, ir para tela de correcao, registrar resolucao.
- Debug cru, payload integral e endpoints `/api/debug/*` nao devem aparecer para gerente.
- Fixture S0-13: pendencia de estoque negativo bloqueado, usuario sem ID operacional, job pendente.
- Teste negativo: acoes de debug/recalc exigem admin, feature flag/dev-only e nao aparecem como comando primario.

## Arquitetura de informacao alvo

### Navegacao primaria

1. **Visao geral**: `/`, painel do dia, alertas, pendencias e proximas acoes.
2. **Operacao**: `/materials`, pesagens, estoque, vendas normais e coletivas.
3. **Equipe**: `/manage-workers`, `/worker-productivity`, PII minimizada e produtividade.
4. **Comunicacao**: futura `/notices`.
5. **Relatorios**: futura `/reports`, PDFs e exports.
6. **Conta**: `/profile`.
7. **Admin/dev**: somente admin/suporte autorizado, fora da primeira camada de gerente.

### Labels em pt-BR

- Preferir: `Visao geral`, `Materiais e estoque`, `Vendas`, `Equipe`, `Produtividade`, `Avisos`, `Relatorios`, `Meu perfil`.
- Evitar como nav primaria: `Catadores`, `Debug`, `Assign Wastepicker IDs`, `Worker tools`, `Recalcular contribuicoes`.
- Usar `catador`/`trabalhador` somente quando o gerente administra equipe, produtividade, contribuicao ou historico operacional.

### Primeira tela

| Papel | Prioridade no primeiro viewport |
| --- | --- |
| Admin | Saude geral, cooperativas com risco, incidentes, jobs e acessos pendentes. |
| Gerente | Pendencias da cooperativa, estoque critico, vendas ativas, receita do periodo, avisos e equipe. |
| Operador | Tarefas do dia, pesagens/ajustes pendentes, vendas operacionais e erros recuperaveis. |
| Visualizador | KPIs, filtros de periodo, relatorios recentes e botao de export. |
| Suporte | Incidentes autorizados, trilha de auditoria, healthchecks e logs redigidos. |

## Estados padrao por tela

| Estado | Regra |
| --- | --- |
| Loading | Skeleton ou texto curto por secao; nunca bloquear tela inteira se apenas um card carrega. |
| Empty | Explicar o que falta e oferecer proxima acao permitida pelo papel. |
| Error | Mensagem por dominio, sem stack/payload; botao de tentar novamente quando fizer sentido. |
| Permission denied | Explicar que a acao nao esta disponivel para o papel/cooperativa; sem revelar dados de outro escopo. |
| Success | Confirmar impacto operacional: estoque, venda, equipe, aviso ou relatorio. |
| Destructive/financeiro | Confirmacao explicita com material, peso, valor, cooperativa e consequencia. |

## Comparacao com RBAC atual

| Area | Codigo atual | Decisao de produto | Gap/task relacionada |
| --- | --- | --- | --- |
| Papeis tecnicos | `admin`, `manager`, `worker` em `src/lib/auth/shared.ts` | Produto precisa tambem de operador, visualizador e suporte | Criar RBAC dedicado antes de habilitar esses papeis reais; ate la, esses papeis sao personas de planejamento, nao permissoes implementadas |
| Login web | `POST /api/auth/login` rejeita `worker` | Correto: worker nao e publico primario da web | Manter teste negativo de worker |
| Pages protegidas | `src/proxy.ts` exige sessao, mas nao papel por pagina | UI deve esconder rotas por papel; API continua autoridade | S5-01 para nav role-aware |
| Admin vs gerente no frontend | Dashboard usa `role` real para ferramentas admin; APIs continuam autoridade | Nao usar `userType` sozinho para comandos admin | Monitorar nas proximas tasks de UI |
| Materiais | API cria/edita/deleta com `requireAdmin`; UI atual pode expor formulario | Gerente deve operar estoque da cooperativa, nao catalogo global sem permissao | S5-06 define UX e permissoes finas |
| Usuarios/equipe | Manager/admin podem gerir usuarios da cooperativa; `GET /api/users` mascara CPF/PIS/RG e detalhe autorizado usa `/api/user` | PII deve continuar mascarada por padrao e logs de payload devem sair | S5-05 para UX refinada e auditoria de acesso a detalhe |
| `/manage-workers` | A pagina usa `/api/users` com escopo server-side | Gerente deve usar contrato cooperativo seguro, nao endpoint global | S5-05 deve cobrir UX/PII e teste manager |
| Debug/recalc | `/api/debug/*` exige admin e bloqueio em producao sem flag; recalc/assign/debug somem da UI gerencial | Dev-only/feature flag/admin auditado | Monitorar em QA de release |
| Reports/PDF | Helpers e ADR existem; endpoints reais futuros | Reports devem exigir escopo e `runtime=nodejs` | S3-04/S3-05 |
| Notices | Sanitizacao existe; APIs/tela futuras | Avisos global/cooperativa com HTML seguro | S4-01/S4-02 |

## Plano de browser evidence para tasks dependentes

Matriz de dados S0-13: [[Planejamento/Matriz-fixtures-UAT]].

| Jornada | Rotas | Interacao principal | Teste negativo |
| --- | --- | --- | --- |
| Painel do dia | `/login`, `/` | Login gerente, filtro dashboard, abrir alerta | Sem sessao redireciona; console sem logs de debug |
| Estoque critico | `/materials` | Buscar material, abrir estado baixo/vazio | Mutacao admin-only invisivel ou `403` para gerente |
| Venda normal | `/sales` | Criar venda com estoque suficiente; validar estado sem estoque | Outra cooperativa negada |
| Venda coletiva | Futura `/sales` ou `/collective-sales` | Criar/participar/cancelar | Cooperativa nao participante negada |
| Equipe/PII | `/manage-workers`, `/worker-productivity` | Criar/editar usuario e filtrar produtividade | PII completa nao visivel por padrao; outra cooperativa negada |
| Avisos | Futura `/notices` | Criar aviso e renderizar conteudo sanitizado | XSS nao aparece no DOM; aviso global negado para gerente |
| Relatorio/PDF | Futura `/reports`, detalhe de venda | Baixar PDF e conferir headers | PDF de outra cooperativa negado |
| Pendencia operacional | `/`, rotas de dominio | Abrir pendencia e navegar para correcao | Debug/recalc invisivel ou `403` para gerente |

## Matriz S0-13 jornada -> fixture

| Jornada | Fixtures S0-13 | Lacuna aceita ate task futura |
| --- | --- | --- |
| Painel do dia | `manager-horizonte`, `cardboard-stocked`, `aluminum-low-stock`, `normal-active-horizonte` | Nenhuma para telas atuais |
| Estoque critico | `aluminum-low-stock`, `glass-empty-stock`, `leste-cardboard-stocked` | Nenhuma para telas atuais |
| Venda normal | `normal-active-horizonte`, `normal-completed-horizonte`, `normal-cancelled-horizonte` | S1-01 persiste lifecycle; S2-01 porta complete/cancel na API/UI |
| Venda coletiva | `collective-open-two-coops`, `collective-contribution-pending` | Persistencia depende de S1-02/S3-01/S3-02 |
| Equipe/PII | `manager-horizonte`, `worker-horizonte-active`, `worker-horizonte-empty`, `worker-horizonte-inactive`, `worker-leste` | UX final em S5-05 |
| Avisos | `notice-global-safe`, `notice-coop-horizonte`, `notice-xss-blocked` | Persistencia depende de S4-01/S4-02 |
| Relatorio/PDF | `normal-completed-horizonte`, `collective-open-two-coops`, `normal-cancelled-horizonte` | PDF real depende de S3-04/S3-05 |
| Pendencia operacional | `glass-empty-stock`, `worker-horizonte-empty`, `job-pending-achievements` | Fila/jobs persistidos dependem de S4/S5 |

## Criterios para proximas tasks UI

- Toda tela nova deve declarar qual papel a usa, qual dado aparece, qual acao e primaria e qual teste negativo prova escopo.
- Se a tela envolver equipe, produtividade ou documentos, PII vem mascarada por padrao. Fluxos que precisam editar documentos devem buscar detalhe por acao explicita e respeitar escopo server-side.
- Se a tela envolver venda, estoque ou relatorio, a primeira tela deve mostrar unidade (`kg`, `BRL`, periodo e cooperativa).
- Se uma acao depender de papel, esconder o botao nao basta: o endpoint deve retornar `401`/`403` corretamente.
- Operador, visualizador e suporte nao podem ser habilitados como papeis reais ate existir RBAC server-side dedicado; antes disso sao apenas personas de desenho e UAT.
- S0-13 deve criar fixtures que cubram pelo menos um cenario feliz, um vazio, um erro recuperavel e um negativo de permissao para cada jornada acima.
