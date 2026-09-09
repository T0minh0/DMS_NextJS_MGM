# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Coolify

- **Instância:** Pessoal (`coolify.tominho.com`), team **UnB shared**
- **App:** `DMS managers` — UUID `uvhstmr62gtvekxuwr6fgxmz` (Coolify repo: `T0minh0/DMS_NextJS_MGM`) — https://dmsmanagers.tominho.com
- **Banco:** `DMS database` (postgres:18) — UUID `48bzltj9yysxi4vpti0vpuek`, host interno `48bzltj9yysxi4vpti0vpuek:5432`, compartilhado com o backend mobile
- **MCP read/inspeção:** server `coolify` em `.mcp.json` (tools `list_applications`, `get_application`, `list_servers`, etc.)
- **CLI write/ops/logs:** `coolify --context=pessoal-unb app <cmd> uvhstmr62gtvekxuwr6fgxmz` — `logs -f`, `restart`, `deployments`, `env` (obs: `app deploy` do CLI 1.6.x falha nesta versão do Coolify; usar `curl -X POST .../api/v1/applications/<uuid>/start`)
- **Token:** `${COOLIFY_PESSOAL_TOKEN}` (exportado em `~/.zshrc`; token do team UnB shared)
