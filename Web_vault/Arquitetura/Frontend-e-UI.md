# Frontend e UI

## Contrato canonico

O contrato visual canonico do projeto continua em `.tony/design.md`. Para o Web, ele deve ser aplicado como uma adaptacao operacional dark/neon: foco em densidade informacional, contraste alto, leitura curta e interacoes claras em desktop e mobile.

Arquivos base da implementacao:

- `src/app/globals.css`: fonte unica dos tokens CSS.
- `tailwind.config.ts`: espelha tokens semanticos e aliases legados.
- `src/components/Layout.tsx`: casca visual compartilhada das telas autenticadas.
- `src/app/login/page.tsx`: entrada publica ja migrada para a mesma linguagem visual.
- `src/app/page.tsx`: dashboard inicial com migracao superficial de containers, filtros, cards e estados vazios.
- `scripts/check-visual-contract.mjs`: gate executavel para bloquear cores antigas e classes fora do contrato nos arquivos canonicos e em arquivos frontend alterados.

## Tokens web oficiais

### Cores

| Papel | Token | Valor |
| --- | --- | --- |
| Fundo principal | `background` | `#0A0E1A` |
| Superficie | `surface` | `#1A1F2E` |
| Superficie alternativa | `surface-alt` | `#1F2536` |
| Acao primaria e foco | `primary` | `#00D4FF` |
| Destaque especial | `secondary` | `#FF00D4` |
| Sucesso | `success` | `#00FF88` |
| Alerta, recompensa e valor | `warning` | `#FFD700` |
| Erro | `error` | `#FF4D6D` |
| Texto principal | `text` | `#F5F8FF` |
| Texto secundario | `text-secondary` | `#94A3C7` |
| Borda/divisor | `outline` | `#2A3441` |

### Tipografia

- `headline-lg`: 28px, peso 600, uso em titulos de tela.
- `headline-md`: 18px, peso 600, uso em cards, secoes e modais.
- `body-md`: 15px, peso 400, uso padrao do conteudo web.
- `label-md`: 14px, peso 600, uso em botoes, filtros e navegacao.
- `caption`: 12px, peso 400, uso em metadados, dicas e apoio.

Fonte base web:

- Sans: `Geist` com fallback para `Segoe UI` e `system-ui`.
- Mono: `Geist Mono` com fallback monospace.

### Spacing e radius

- Escala de espacamento: `4 / 8 / 12 / 16 / 20 / 24 / 32`.
- `radius-sm`: 6px.
- `radius-md`: 8px.
- `radius-lg`: 12px.
- `radius-xl`: 16px.
- `radius-full`: 999px.

## Semantica de uso

- `background` estrutura a pagina inteira.
- `surface` e `surface-alt` sustentam cards, barras e containers densos.
- `primary` marca a acao dominante, foco visivel, links de maior importancia e estados ativos.
- `secondary` fica restrito a destaques eventuais, badges especiais e identidade de apoio.
- `warning` nao substitui a cor primaria; use apenas para recompensa, valor ou atencao controlada.
- `error` deve aparecer com texto e iconografia, nunca isolado.
- `text-secondary` serve para apoio; nao usar em blocos longos de leitura principal.

## Estados e interacao

- Elementos focaveis devem expor `focus-visible` com anel ciano.
- Hover deve aclarar ou elevar a superficie, sem trocar para paleta vinho ou verde.
- Elementos desabilitados devem reduzir contraste e perder glow, sem parecerem ativos.
- FAB, menu e botoes precisam manter contraste suficiente no fundo escuro.
- Sombras devem usar tokens (`shadow-soft`, `shadow-glow`, `shadow-glow-hover`), nao valores inline.
- Em mobile, manter alvos de toque com minimo de 44px.

## Compatibilidade e migracao

- Classes legadas `dms-*` continuam permitidas apenas como alias para os tokens novos.
- A paleta vinho/verde antiga nao e mais base valida para novas telas ou refactors.
- Migracoes incrementais devem priorizar containers, navegacao, estados de foco e tipografia antes de ajustes locais de cada pagina.
- `surface-panel` e tokens semanticos devem ser preferidos a cores literais em Tailwind, exceto quando o valor vier diretamente do contrato.
- Antes de concluir novas telas ou refactors visuais, rodar `npm run check:visual-contract`; o script sempre cobre a superficie canonica do contrato e qualquer arquivo frontend alterado.

## Regra obrigatoria para novas telas

Nenhuma nova tela, modal, drawer, wizard, dashboard ou pagina administrativa pode ser criada fora deste contrato. Se a tela exigir excecao visual, a excecao deve ser documentada antes em ADR ou no proprio `.tony/design.md`; sem isso, a implementacao nao esta conforme.
