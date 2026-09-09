# API - Onboarding (importacao historica via CSV)

Ferramenta administrativa oculta para carregar dados historicos de coleta a partir de um CSV padrao. Nao aparece na navegacao; a pagina `/admin/onboarding` renderiza "Pagina nao encontrada" para quem nao e `admin` e as APIs respondem `403 ADMIN_REQUIRED`.

## Seguranca e escopo

- `requireStrictAdmin()` (`src/lib/auth/server.ts`): somente `role === 'admin'`. `requireAdmin` legado continua aceitando gerente e **nao** e usado aqui.
- `requireScopedPermission(session, 'stock', 'manage', 'global')`: gerentes so tem escopo `cooperative`, entao nunca passam.
- `cooperative_id` e obrigatorio em todas as chamadas (nunca assume a cooperativa do admin). Toda linha precisa referenciar um catador dessa cooperativa.
- Nenhum CPF/RG/PIS transita: o coletor e identificado por `WP005`/id ou nome.

## Contrato do CSV

Modelo com BOM UTF-8, linha `sep=;` e cabecalho `data_coleta;coletor;material;peso_kg;estado_sacola;observacao`. O parser aceita `;`, `,` ou tab (detectado pelo cabecalho), aspas RFC 4180 e CRLF.

| Coluna | Obrig. | Formato | Destino |
| --- | --- | --- | --- |
| `data_coleta` | sim | `DD/MM/AAAA` (aceita `D/M/AAAA`, `AAAA-MM-DD`); >= 01/01/2000; nao futura | `Measurments.Time_stamp` = meia-noite UTC |
| `coletor` | sim | `WP005`, `wp5`, `5`; fallback nome exato (sem acento/caixa) se unico na cooperativa | `Measurments.Wastepicker` |
| `material` | sim | id ou nome (sem acento/caixa) | `Measurments.Material` |
| `peso_kg` | sim | > 0, ate 2 casas; aceita `12,5`, `12.5`, `1.234,56` | `Measurments.Weight_KG` (delta coletado) |
| `estado_sacola` | sim | `cheia`/`vazia` (tambem `sim/nao`, `1/0`) | `Measurments.Bag_filled` somente |
| `observacao` | nao | livre | nao gravada |

Erros de arquivo: `MISSING_COLUMN`, `ENCODING_INVALID` (mojibake `Ã.`/U+FFFD: "Salve o arquivo como CSV UTF-8"), `CSV_PARSE_ERROR`. Colunas extras geram aviso e sao ignoradas. O modelo traz uma linha de exemplo com `WP000`, que sempre reprova (catador inexistente), evitando importacao acidental do exemplo.

Codigos por linha: erros `MISSING_REQUIRED`, `INVALID_DATE`, `DATE_IN_FUTURE`, `DATE_TOO_OLD`, `WORKER_NOT_FOUND`, `WORKER_AMBIGUOUS`, `WORKER_OUTSIDE_COOPERATIVE`, `WORKER_NOT_WASTEPICKER`, `MATERIAL_NOT_FOUND`, `MATERIAL_AMBIGUOUS`, `INVALID_WEIGHT`, `INVALID_BAG_STATE`; avisos `DUPLICATE_IN_DATABASE`, `DUPLICATE_IN_FILE`, `DATE_OUTSIDE_WORKER_TENURE`, `WORKER_EXITED` (catadores desligados sao aceitos: dado historico).

## Semantica de escrita (decisoes)

- **Linhas historicas ja sao deltas**: nao passam por `calculateBagStateDelta` e **nunca tocam `material_bag_state`** (rebobinar `last_updated` bloquearia as pesagens ao vivo do app).
- **Estoque**: modo padrao `collected_only` soma apenas `Total_collected_KG` (`addHistoricalCollected` em `src/lib/stock/ledger.ts`); `Current_stock_KG` fica igual, logo o historico **nao aparece em "Estoque total"** da visao geral. O modo `collected_and_current` usa `addToStock` e tambem aumenta o saldo atual.
- Dispositivo: `resolveCooperativeDevice` (primeiro `Devices` da cooperativa, criado se faltar).
- Tudo-ou-nada: `apply` so roda com `invalid_rows = 0`. Duplicatas contra o banco (mesmo catador, material, data e peso) exigem `force: true`; se 100% das linhas ja existirem, `409 ONBOARDING_ALREADY_IMPORTED` (nao contornavel).
- Uma transacao (`timeout 60s`) com `pg_advisory_xact_lock` por cooperativa, recontagem de duplicatas dentro do lock, `createManyAndReturn` em lotes de 1.000 e um upsert de estoque por material.
- Apos o commit, `rebuildWorkerContributions` (`src/lib/contributions/rebuild.ts`) reconstroi `Worker_contributions` de **todas as cooperativas** (global e destrutivo, agora atomico). Falha vira `applied_with_warnings` com instrucao para rodar `POST /api/recalculate-contributions`.
- Gamificacao nao e disparada: a resposta lista os `POST /api/jobs/achievement-evaluation` por `yearMonth` afetado e os snapshots (so periodos fechados; Bearer `DMS_JOB_SECRET`).

## Endpoints

### `GET /api/admin/onboarding/template?cooperative_id=<id>&kind=template|referencia`

`text/csv; charset=utf-8`, `Content-Disposition: attachment` (nome ASCII), `Cache-Control: no-store`. `kind=template` devolve o modelo; `kind=referencia` devolve `tipo;id;nome;detalhe` com coletores (`ativo`/`desligado em ...`) e materiais (grupo) da cooperativa.

### `GET /api/admin/onboarding/import`

Probe: `{ enabled: true, limits: { max_bytes, max_rows, ok_rows_preview_limit }, stock_modes, columns }`.

### `POST /api/admin/onboarding/import`

Body: `{ cooperative_id, csv, mode: 'validate' | 'apply', stock_mode?, confirmation_token?, force? }` (CSV enviado como texto; a UI le o arquivo com `FileReader`).

- `validate` -> `200 { mode, cooperative, file{delimiter,row_count,sha256}, file_errors, file_warnings, summary{total_rows, valid_rows, invalid_rows, warning_rows, duplicate_rows, total_kg, date_range, affected_year_months, by_material, by_worker, stock_mode}, rows[{line, status, errors, warnings, input, resolved}], rows_truncated, can_apply, requires_force, confirmation_token, confirmation_expires_at }`. Linhas `ok` sao limitadas a 500 no preview; erros/avisos sempre aparecem.
- `apply` **revalida tudo no servidor** e exige `confirmation_token` (HMAC do sha256 + cooperativa + modo, TTL 30 min). Retorna `200 { mode, status: 'applied' | 'applied_with_warnings', import{cooperative_id, device_id, measurement_count, total_kg, stock_mode, weighting_id_range, weighting_ids, by_material[{material_id, added_collected_kg, stock_after}]}, contributions_rebuild{status, statistics?, message?}, gamification{affected_year_months, jobs[]} }`.
- Erros: `400 INVALID_JSON_BODY | ONBOARDING_COOPERATIVE_REQUIRED | ONBOARDING_INVALID_MODE | ONBOARDING_INVALID_STOCK_MODE | ONBOARDING_CSV_REQUIRED | ONBOARDING_CONFIRMATION_REQUIRED`, `403 ADMIN_REQUIRED | FORBIDDEN`, `404 COOPERATIVE_NOT_FOUND`, `409 ONBOARDING_CONFIRMATION_MISMATCH | ONBOARDING_CONFIRMATION_EXPIRED | ONBOARDING_DUPLICATES_REQUIRE_FORCE | ONBOARDING_ALREADY_IMPORTED`, `413 ONBOARDING_FILE_TOO_LARGE | ONBOARDING_TOO_MANY_ROWS`, `422 ONBOARDING_INVALID_ROWS` (com `summary` e linhas com erro), `500 ONBOARDING_IMPORT_FAILED`.
- Logs: apenas contagens, ids e kg (`onboarding.import.validated|rejected|applied|failed`, `onboarding.contributions.rebuilt|failed`).

## Operacao em producao

1. Rodar antes o reconcile de estoque (`npm run stock:reconcile-orphan-measurements`) por cooperativa: ele recusa materiais que ja tenham linha em `Stock`, e o import cria linhas (`collected = X`, `current = 0`) para materiais sem estoque. Nunca apontar o reconcile para os intervalos importados (ele trata `Weight_KG` como leitura acumulada).
2. `pg_dump` antes do primeiro `apply`; importar fora do horario de pesagem para que `weighting_id_range` fique contiguo (a lista `weighting_ids` do comprovante e a fonte autoritativa).
3. Validar, revisar `by_material`/`by_worker`, confirmar, guardar o comprovante JSON.
4. Rodar os jobs de gamificacao listados na resposta.

## Rollback (sem migracao)

```sql
DELETE FROM "Measurments" WHERE "Weighting_id" = ANY(ARRAY[<ids do comprovante>]);
UPDATE "Stock" SET "Total_collected_KG" = "Total_collected_KG" - <added_collected_kg>
  WHERE "Cooperative" = <coop> AND "Material" = <material>;
-- se o modo foi collected_and_current, subtrair tambem de "Current_stock_KG" (garantindo >= 0)
```

Depois: `POST /api/recalculate-contributions` e os jobs de gamificacao.

## Testes

`tests/onboarding-import-csv.test.ts`, `tests/onboarding-import-validation.test.ts`, `tests/onboarding-import-apply.test.ts`, `tests/onboarding-import-template.test.ts`, `tests/onboarding-import-auth.test.ts`, `tests/onboarding-import-ui.test.ts`, `tests/contributions-rebuild.test.ts`.
