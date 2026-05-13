# Modelos Prisma

Nota de referencia rapida para os modelos definidos em `prisma/schema.prisma`. A configuracao CLI vive em `prisma.config.ts`. A documentacao detalhada dos campos e relacionamentos fica em [[Dominio/Modelo-de-dados]].

ADR vigente: [[ADR/ADR-0001-schema-prisma-baseline-rollback]]. Os modelos atuais preservam as tabelas fisicas legadas; novas tabelas da reforma devem ser adicionadas via migrations Prisma versionadas.

| Modelo Prisma | Tabela SQL | Uso principal |
| --- | --- | --- |
| `Cooperative` | `Cooperative` | Cooperativas |
| `Devices` | `Devices` | Dispositivos de medicao |
| `Groups` | `Groups` | Grupos de materiais |
| `Materials` | `Materials` | Materiais reciclaveis |
| `Buyers` | `Buyers` | Compradores de vendas |
| `Sales` | `Sales` | Vendas registradas |
| `Workers` | `Workers` | Gerentes e catadores |
| `Measurments` | `Measurments` | Medicoes/coletas |
| `Stock` | `Stock` | Estoque por cooperativa e material |
| `WorkerContributions` | `Worker_contributions` | Contribuicoes por catador/material/periodo |

## Convencoes importantes

- IDs usam `BigInt`.
- Valores monetarios/pesos usam `Decimal`.
- `CPF`, `PIS`, `RG` e `Password` usam `Bytes`.
- `WorkerContributions.period` usa `Unsupported("daterange")`, especifico de PostgreSQL.
- Tabelas e colunas usam nomes com maiusculas e underscores por mapeamento `@@map` e `@map`.
- A baseline versionada fica em `prisma/migrations/00000000000000_baseline/migration.sql`.
- Novas tabelas sem equivalente legado devem usar lower-case snake_case e `@@map` explicito.
