# Log de melhorias

Espelho operacional de `.tony/improvement-log.md`.

| Data | Categoria | Observacao | Acao sugerida | Status |
| --- | --- | --- | --- | --- |
| 2026-04-27 | dx_friction | `DOCUMENTATION.md` descreve MongoDB/Mongoose, mas o codigo atual usa Prisma/PostgreSQL. | Atualizar a documentacao tecnica antes de usa-la como fonte em tasks futuras. | aberto |
| 2026-04-27 | missing_test | `package.json` nao declara script de testes. | Definir estrategia minima de testes ou smoke checks para fluxos criticos. | aberto |
| 2026-04-27 | convention_violation | UI mistura tokens DMS verdes com paleta vinho inline. | Consolidar tokens e reduzir estilos inline quando houver task visual. | aberto |
| 2026-04-27 | dx_friction | `npm run lint` falha no Next 16.1.4 porque `next lint` nao e mais um comando valido neste formato. | Migrar o script para ESLint direto ou para o comando recomendado pela versao atual do Next. | aberto |
| 2026-04-27 | security | `npm install` reportou 12 vulnerabilidades em dependencias, sendo 3 moderadas e 9 altas. | Rodar `npm audit` e priorizar correcao das vulnerabilidades altas. | aberto |
| 2026-04-27 | agent_improvement | Vault expandido com documentacao completa de arquitetura, API, dominio, UI, operacao, seguranca e backlog tecnico. | Manter as notas sincronizadas apos cada task que alterar contrato, schema ou fluxo. | em andamento |
| 2026-04-27 | dx_friction | O workspace `/Web` contem dois repositorios e pode confundir o Tony quando iniciado fora do repo oficial. | Manter `.tony` e `.codex` da raiz apontando para `DMS_NextJS_MGM` e executar comandos do app nesse diretório. | concluido |

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
- **Status:** pendente
