# ADR-0003: Contrato visual web dark/neon

## Status

Aceito em 2026-04-26.

## Contexto

O projeto web acumulou duas bases visuais concorrentes:

- tokens verdes em `globals.css` e `tailwind.config.ts`;
- casca vinho inline em `src/components/Layout.tsx` e em varias telas.

Ao mesmo tempo, o contrato canonico do produto passou a existir em `.tony/design.md`, com direcao dark/neon mobile-first. Sem uma adaptacao explicita para web, novas telas tenderiam a repetir a fragmentacao visual atual.

## Decisao

O Web adota um contrato dark/neon operacional derivado de `.tony/design.md`, com:

- fundo `#0A0E1A`;
- superficies `#1A1F2E` e `#1F2536`;
- acao primaria ciano `#00D4FF`;
- destaque secundario magenta `#FF00D4`;
- sucesso `#00FF88`;
- alerta/recompensa `#FFD700`;
- erro `#FF4D6D`;
- texto principal `#F5F8FF`;
- texto secundario `#94A3C7`.

Os tokens devem existir em CSS global e em Tailwind. Classes `dms-*` legadas ficam permitidas apenas como camada de compatibilidade temporaria, sempre mapeadas para os novos valores semanticos.

A primeira aplicacao pratica cobre a casca autenticada (`Layout`), a tela publica de login e uma migracao superficial do dashboard inicial para que as evidencias desktop/mobile nao exponham a paleta antiga como base visual.

O gate executavel `npm run check:visual-contract` deve rodar em refactors visuais e novas telas. Ele cobre a superficie canonica do contrato e os arquivos frontend alterados, bloqueando cores vinho/verde legadas, classes Tailwind cruas fora dos tokens semanticos, letter-spacing local, gradientes radiais decorativos e sombras inline.

## Regra de governanca

Fica proibido criar nova tela, pagina, modal, drawer ou fluxo visual usando a paleta vinho/verde como base, ou introduzir nova paleta local fora dos tokens oficiais. Excecoes precisam de registro previo em ADR ou atualizacao explicita do contrato em `.tony/design.md`.

## Consequencias

- O `Layout` compartilhado se torna a referencia visual minima para o restante das paginas.
- Refactors futuros podem migrar telas aos poucos sem quebrar compatibilidade com classes antigas.
- Revisao de UI passa a ter uma regra objetiva: se nao usa tokens oficiais ou excecao documentada, a implementacao esta fora do contrato.
