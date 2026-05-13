# Seed e dados locais

Arquivo: `prisma/seed.ts`.

## Aviso destrutivo

O seed comeca com:

```sql
TRUNCATE TABLE "Worker_contributions", "Stock", "Measurments", "Sales", "Devices", "Workers", "Buyers", "Materials", "Groups", "Cooperative" RESTART IDENTITY CASCADE;
```

Isso apaga dados existentes das tabelas listadas.

## Dados criados

### Cooperativas

- `Cooperativa Central Horizonte`
- `Cooperativa Vale do Leste`

### Grupos

- `Papéis`
- `Plásticos`

### Materiais

- `Papelão Ondulado` no grupo `Papéis`
- `Papel Branco` no grupo `Papéis`
- `Plástico PET Cristal` no grupo `Plásticos`

### Dispositivos

- 2 dispositivos vinculados a `Cooperativa Central Horizonte`.

### Compradores

- `Recicla Cidades LTDA`
- `Eco Verde Comercial`

### Usuarios

| Nome | Tipo | CPF | Senha | Cooperativa |
| --- | --- | --- | --- | --- |
| Rosa Almeida | Gerente `0` | `12345678901` | `manager123` | Cooperativa Central Horizonte |
| João Carvalho | Catador `1` | `98765432100` | `worker123` | Cooperativa Central Horizonte |
| Maria Oliveira | Catador `1` | `56473829100` | `worker123` | Cooperativa Central Horizonte |
| Pedro Santos | Catador `1` | `43210987654` | `worker123` | Cooperativa Vale do Leste |

## Medicoes

O seed cria 5 medicoes em fevereiro de 2024:

- Joao / Papelão Ondulado / 135.50 kg / saco cheio.
- Maria / Plástico PET Cristal / 92.40 kg / saco cheio.
- Joao / Papel Branco / 48.10 kg / saco cheio.
- Maria / Plástico PET Cristal / 76.35 kg / saco nao cheio.
- Pedro / Papelão Ondulado / 88.60 kg / saco cheio.

## Vendas

O seed cria 2 vendas:

- Papelão Ondulado, 120.00 kg, R$ 1.35/kg, comprador Recicla Cidades LTDA.
- Plástico PET Cristal, 85.00 kg, R$ 2.40/kg, comprador Eco Verde Comercial.

## Estoque

O seed cria estoque para a Cooperativa Central Horizonte:

- Papelão Ondulado: coletado 350.00 kg, vendido 180.00 kg, atual 170.00 kg.
- Plástico PET Cristal: coletado 260.00 kg, vendido 95.00 kg, atual 165.00 kg.

## Contribuicoes

Insere 3 contribuicoes em `Worker_contributions` com periodo `daterange('2024-01-01', '2024-01-31', '[]')`.

## Comando

O `package.json` declara:

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

Comando esperado:

```bash
npx prisma db seed
```
