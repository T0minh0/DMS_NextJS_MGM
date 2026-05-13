---
version: alpha
name: DMS Web Manager Design Contract
description: Contrato visual canonico para a web DMS usada por gerentes e operadores de cooperativas.
sourceFiles:
  - src/app/globals.css
  - tailwind.config.ts
  - src/components/Layout.tsx
  - src/app/layout.tsx
  - src/app/login/page.tsx
  - src/app/page.tsx
  - src/app/sales/page.tsx
  - src/app/materials/page.tsx
  - src/app/manage-workers/page.tsx
  - src/app/worker-productivity/page.tsx
  - src/app/profile/page.tsx
  - scripts/check-visual-contract.mjs
  - Web_vault/Arquitetura/Frontend-e-UI.md
audience:
  primary:
    - gerente de cooperativa
    - operador de gestao da cooperativa
    - administrador do sistema
  secondary:
    - visualizador de relatorios
    - suporte tecnico autorizado
  notPrimary:
    - catador como usuario final
productPrinciples:
  density: operacional, escaneavel e orientada a decisao
  tone: profissional, direto e em pt-BR
  dataSafety: mostrar apenas o necessario por papel e cooperativa
  firstViewport: priorizar estado operacional, pendencias e proximas acoes
colors:
  primary: "#00D4FF"
  on-primary: "#0A0E1A"
  secondary: "#FF00D4"
  warning: "#FFD700"
  success: "#00FF88"
  energy: "#FF6B35"
  error: "#FF4D6D"
  neutral: "#65708D"
  background: "#0A0E1A"
  surface: "#1A1F2E"
  surface-alt: "#1F2536"
  surface-elevated: "#243049"
  card: "#1A1F2E"
  outline: "#2A3441"
  text: "#F5F8FF"
  on-surface: "#F5F8FF"
  text-secondary: "#94A3C7"
typography:
  headline-lg:
    fontFamily: Geist, Segoe UI, system-ui, sans-serif
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0
  headline-md:
    fontFamily: Geist, Segoe UI, system-ui, sans-serif
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: 0
  body-md:
    fontFamily: Geist, Segoe UI, system-ui, sans-serif
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  label-md:
    fontFamily: Geist, Segoe UI, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: 0
  caption:
    fontFamily: Geist, Segoe UI, system-ui, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: 0
rounded:
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  full: 999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  xxl: 32px
components:
  app-shell:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    padding: 16px 24px
  top-nav:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    height: adaptive
  surface-panel:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  table:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 44px
  table-header:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    height: 44px
  report-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
    height: 44px
    padding: 12px 16px
  button-secondary:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
    height: 44px
    padding: 12px 16px
  button-danger:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
    height: 44px
    padding: 12px 16px
  special-badge:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.background}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: 4px 8px
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 44px
    padding: 0 12px
  status-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.background}"
    typography: "{typography.label-md}"
  status-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.background}"
    typography: "{typography.label-md}"
  status-danger:
    backgroundColor: "{colors.error}"
    textColor: "{colors.background}"
    typography: "{typography.label-md}"
  neutral-chip:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: 4px 8px
  energy-indicator:
    backgroundColor: "{colors.energy}"
    rounded: "{rounded.full}"
    height: 8px
  muted-label:
    textColor: "{colors.text-secondary}"
    typography: "{typography.caption}"
  divider:
    backgroundColor: "{colors.outline}"
    height: 1px
routes:
  "/":
    purpose: dashboard gerencial com KPIs, pendencias e proximas acoes
    evidence: desktop/mobile screenshot, filtros, console limpo
  "/login":
    purpose: entrada publica segura
    evidence: tentativa invalida e login com fixture
  "/sales":
    purpose: vendas normais, coletivas e relatorios
    evidence: criar/filtrar/validar permissao e estado vazio
  "/materials":
    purpose: materiais, estoque e pesagens sob gestao
    evidence: busca, estado vazio, erro e dados reais de fixture
  "/manage-workers":
    purpose: gestao de equipe e usuarios com minimizacao de PII
    evidence: mascaramento, formulario, permissao negativa
  "/worker-productivity":
    purpose: analytics de produtividade da equipe
    evidence: filtros por periodo/trabalhador e estado sem dados
  "/profile":
    purpose: perfil do usuario autenticado
    evidence: leitura/edicao permitida e validacao de senha
browserEvidence:
  requiredForUiTasks: true
  backendDefault: Browser
  minimum:
    - URL e title da pagina
    - DOM principal nao vazio
    - console sem erros e sem logs de debug de producao
    - screenshot desktop
    - screenshot mobile
    - uma interacao principal validada
    - teste negativo de permissao quando a tela depender de papel, cooperativa ou PII
---

## Overview

A interface web do DMS deve ser uma ferramenta de gestao para gerentes de cooperativas, operadores internos e administradores autorizados. Ela deve ajudar a responder rapidamente: como esta a cooperativa hoje, quais pendencias exigem acao, quais vendas e estoques estao em risco, quais equipes precisam atencao e quais relatorios sustentam decisao.

O app mobile pode ter uma experiencia mais gamificada para catadores; a web nao deve tratar catadores como publico primario. Na web, catadores/trabalhadores aparecem como registros de equipe, produtividade ou contribuicao administrados pelo gerente.

## Information Architecture

A primeira camada de navegacao deve refletir rotinas de gestao:

- Dashboard: KPIs, alertas, pendencias e proximas acoes.
- Materiais e estoque: saldos, ajustes, materiais, grupos e risco operacional.
- Vendas: venda normal, venda coletiva, convites, historico e relatorios.
- Equipe: usuarios, papeis, documentos mascarados, entrada/saida e produtividade.
- Avisos: comunicacao global ou da cooperativa, prioridade e expiracao.
- Perfil: dados do usuario autenticado e seguranca da conta.

Rotas ou acoes indisponiveis para o papel atual nao devem aparecer como comandos primarios. A UI pode esconder a navegacao, mas a protecao final precisa continuar no backend.

## Colors

Use `background`, `surface`, `surface-alt` e `surface-elevated` para estrutura operacional escura. Use `primary` para acao principal, foco visivel, estados ativos e dados que precisam de atencao imediata. Use `secondary` apenas para destaque pontual, nunca como base dominante. Use `warning` para alerta, risco, recompensa ou valor financeiro que precise destaque controlado. Use `success` para conclusao, saude operacional e resultados positivos. Use `error` com texto e icone para erro, risco destrutivo ou bloqueio.

A paleta vinho/verde antiga nao e base valida para novas telas. Classes `dms-*` podem existir somente como compatibilidade temporaria mapeada para tokens oficiais.

## Typography

Use a escala definida no frontmatter e implementada em `src/app/globals.css`. Reserve `headline-lg` para titulo de tela ou painel principal. Use `headline-md` para secoes, cards, tabelas e modais. Use `body-md` para conteudo operacional. Use `label-md` para botoes, filtros, tabs e navegacao. Use `caption` para metadados, hints, datas, IDs e textos auxiliares.

Nao usar letter-spacing negativo ou classes locais de tracking. Texto em botoes, chips, tabelas e cards precisa caber no container em desktop e mobile.

## Layout

A web deve ser desktop-first para operacao repetida, mantendo mobile funcional. Use layouts densos, organizados e escaneaveis, com largura maxima previsivel e bandas/painéis sem aninhar cards dentro de cards. Cards servem para itens repetidos, modais e blocos de informacao independentes, nao para transformar cada secao em uma landing page.

Tabelas e listas precisam ter header claro, coluna de acao previsivel, estado vazio acionavel, loading visivel e erro recuperavel. Graficos devem sempre ter fallback textual, legenda legivel e unidade explicita.

## Components

`Layout` e a casca compartilhada da experiencia autenticada. Ele deve expor identidade do produto, cooperativa/papel do usuario, navegacao permitida e logout claro.

Botoes devem usar icone quando o comando for recorrente ou compacto. Inputs, selects, toggles, tabs e menus precisam ter labels visiveis, foco acessivel e erro inline. Modais devem ser usados para criacao/edicao curta; fluxos longos ou com consequencia operacional devem preferir pagina dedicada ou wizard claro.

Confirmacoes destrutivas ou financeiras precisam explicar impacto antes da acao: estoque reservado/devolvido, venda completada/cancelada, relatorio gerado, usuario desativado ou PII alterada.

## States

Toda tela gerencial deve cobrir:

- loading sem deslocar layout de forma incoerente;
- empty state com proxima acao clara;
- erro com mensagem pt-BR, acao de retry ou orientacao;
- sucesso com feedback temporario e persistente quando necessario;
- estado desabilitado sem parecer ativo;
- permissao negada com texto claro, sem vazar dados de outra cooperativa.

Nao usar `alert()` como unico feedback em fluxos centrais. Alertas nativos podem aparecer apenas como confirmacao temporaria enquanto a UI definitiva ainda nao existe, e devem virar debito explicitado.

## Data Safety

PII como CPF, PIS, RG, email e telefone deve ser minimizada na UI. Documentos pessoais aparecem mascarados por padrao e so podem ser revelados/editados quando o papel e o fluxo exigirem. Dados de outra cooperativa nao devem aparecer em tabelas, filtros, autocomplete, graficos ou mensagens de erro.

Logs de producao nao devem expor payloads, PII, estados internos extensos ou respostas completas de APIs. Tasks UI devem registrar console limpo como evidencia.

## Browser Evidence

Qualquer task que toque UI, frontend, UAT ou fluxo web deve registrar evidencia via `$browser-tony`:

- URL e title;
- DOM principal nao vazio;
- console sem erros e sem logs indevidos;
- screenshot desktop;
- screenshot mobile;
- uma interacao principal;
- teste negativo de acesso quando houver papel, cooperativa, PII, venda, estoque ou relatorio.

As rotas minimas para cobertura do pacote sao `/login`, `/`, `/sales`, `/materials`, `/manage-workers`, `/worker-productivity` e `/profile`, alem de novas rotas de avisos, relatorios ou vendas coletivas quando implementadas.

## Do's and Don'ts

- Do construir para leitura gerencial rapida e operacao repetida.
- Do priorizar dados acionaveis, pendencias e riscos operacionais na primeira tela.
- Do usar tokens semanticos de cor, espaçamento, sombra e radius.
- Do mascarar PII e testar permissao negativa por cooperativa.
- Do atualizar este contrato quando criar padrao reutilizavel novo.
- Don't criar hero, landing page ou experiencia editorial para fluxos administrativos.
- Don't tratar catadores como publico primario da web gerencial.
- Don't usar paleta vinho/verde antiga, gradientes decorativos ou cores literais fora dos tokens.
- Don't esconder problema de permissao apenas removendo link da navegacao.
- Don't concluir task UI sem browser evidence minima.
