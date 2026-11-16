# 13 — PostgreSQL e Drizzle ORM

> **Épicos:** E2 (tenants e chaves), E4 (aliases e preços), E10 (pgvector), E11 (outbox), E12 (agregados), E14 (jobs).
> **Onde:** `libs/database` (schema, client, migrations), adapters em `infrastructure/`.

---

## 1. O problema

O gateway precisa de uma **fonte da verdade** durável para o que não pode ser perdido nem ficar inconsistente: quem são os clientes, quais chaves valem, quanto custa cada modelo e quanto cada cliente gastou. Isso pede garantias que um cache ou uma fila não dão: transações, integridade e consultas flexíveis.

## 2. Como funciona

### 2.1 PostgreSQL em conceitos essenciais

- **Relacional e ACID:**
  - **Atomicidade:** uma transação acontece inteira ou não acontece.
  - **Consistência:** constraints (`NOT NULL`, `UNIQUE`, `FOREIGN KEY`, `CHECK`) nunca são violadas.
  - **Isolamento:** transações concorrentes não se atrapalham (no nível configurado).
  - **Durabilidade:** confirmado é gravado (WAL, o *write-ahead log*).
- **MVCC (Multi-Version Concurrency Control):** cada atualização cria uma nova versão da linha. Leitores não bloqueiam escritores, e vice-versa. O efeito colateral é o `VACUUM`, que limpa as versões antigas.
- **Níveis de isolamento:** `READ COMMITTED` (padrão), `REPEATABLE READ`, `SERIALIZABLE`. Saber qual está em uso é essencial para raciocinar sobre race conditions.
- **Índices:**

| Índice | Estrutura | Bom para | Busca |
|---|---|---|---|
| **B-tree** (padrão) | Árvore balanceada | Igualdade e intervalos (`=`, `<`, `BETWEEN`, `ORDER BY`) | O(log n) |
| **Hash** | Tabela hash | Só igualdade | O(1) médio |
| **GIN** | Índice invertido | Arrays, JSONB, full-text | Depende |
| **HNSW / IVFFlat** (pgvector) | Grafo / clusters | Vizinhos vetoriais | ~O(log n) (aprox.) |

- **Extensões:** o Postgres é extensível (`vector`, `pg_trgm`, `pgcrypto`...).

### 2.2 Recursos que o projeto vai usar

- **`INSERT ... ON CONFLICT DO UPDATE` (upsert):** atualizar o agregado de uso de forma atômica, sem "ler e depois escrever" (que gera race condition).
- **`SELECT ... FOR UPDATE SKIP LOCKED`:** várias instâncias do relay do outbox pegam lotes diferentes sem se bloquear.
- **`numeric`:** valores monetários exatos ([19](./19-custo-dinheiro-e-orcamento.md)).
- **`jsonb`:** guardar a resposta em cache ou o payload do evento.
- **Vigência:** colunas `valid_from`/`valid_to` em `model_prices`.

### 2.3 Pool de conexões

Abrir uma conexão no Postgres é caro (um processo por conexão no servidor). A aplicação mantém um **pool** (ex.: 10–20 conexões) reutilizadas. Com muitas instâncias, um *pooler* externo (PgBouncer) evita esgotar o limite de conexões do banco.

### 2.4 Drizzle ORM

Drizzle é um ORM TypeScript "SQL-first": o schema é escrito em TS e as consultas parecem SQL, totalmente tipadas.

```ts
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  monthlyBudgetMicroUsd: bigint("monthly_budget_micro_usd", { mode: "bigint" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

const tenant = await db.select().from(tenants).where(eq(tenants.id, tenantId));
```

- **Sem geração de código:** os tipos vêm direto do schema TS.
- **drizzle-kit:** compara o schema TS com o estado anterior e **gera migrations SQL** (`pnpm db:generate`), que são versionadas e aplicadas em ordem (`pnpm db:migrate`).
- Consultas complexas podem cair para `sql\`...\`` com parâmetros seguros.

### 2.5 Migrations

Uma migration é um passo de evolução do schema, versionado no git. Regras de ouro:

- Nunca editar uma migration já aplicada; criar uma nova.
- Pensar em **compatibilidade**: durante um deploy, código antigo e novo convivem com o mesmo banco (padrão *expand and contract*: adicionar a coluna nova → migrar o código → remover a antiga).

## 3. Analogia

O Postgres é o **cartório**. Lento comparado a um bloco de notas, mas o que está registrado ali vale: tem carimbo (constraints), livro de protocolo (WAL), e duas pessoas não conseguem registrar o mesmo imóvel ao mesmo tempo (transações e isolamento). O Drizzle é o **despachante que fala a língua do cartório**: você preenche um formulário tipado e ele monta o requerimento exatamente como o cartório exige.

## 4. Por que está nesta arquitetura

- **Fonte da verdade** de tenants, chaves, preços, aliases, agregados de custo, jobs e outbox (ADR 004).
- **pgvector** permite usar o mesmo banco para o cache semântico ([06](./06-busca-vetorial-e-pgvector.md)).
- **Outbox** precisa de um armazenamento durável e transacional ([21](./21-outbox-e-idempotencia.md)).
- **Drizzle** por ser próximo do SQL (bom para aprender o que realmente roda no banco), leve e com migrations geradas.

## 5. Ferramentas similares

### Bancos

| Banco | Diferença principal | Quando escolher |
|---|---|---|
| **MySQL / MariaDB** | Relacional popular; menos recursos avançados (extensões, tipos) | Ecossistemas que já usam |
| **SQLite** | Banco embutido num arquivo | Apps locais, testes, edge |
| **MongoDB** | Documentos JSON, schema flexível | Dados sem relações fortes; transações mais limitadas historicamente |
| **CockroachDB, YugabyteDB** | SQL distribuído, compatível com Postgres | Escala geográfica |

### ORMs / query builders (TypeScript)

| Ferramenta | Diferença principal |
|---|---|
| **Prisma** | Schema numa DSL própria, client gerado; muito produtivo, mais "mágico" e mais distante do SQL |
| **TypeORM** | Decorators em classes, Active Record ou Data Mapper; histórico de bugs e tipagem mais fraca |
| **MikroORM** | Unit of Work e Identity Map (estilo Hibernate) |
| **Kysely** | Query builder tipado, sem ORM nem migrations geradas |
| **Knex** | Query builder veterano, tipagem limitada |
| **SQL puro (`pg`, `postgres.js`)** | Controle total, nenhum tipo automático |

## 6. Armadilhas

- **Read-modify-write:** ler o saldo, somar em JS e gravar perde atualizações concorrentes. Use `UPDATE ... SET x = x + $1` ou upsert.
- **N+1 queries:** buscar uma lista e, para cada item, fazer outra query.
- **Migrations que travam tabelas grandes** (`ALTER TABLE` com reescrita, índices sem `CONCURRENTLY`).
- **Pool esgotado** por transações longas ou conexões vazadas.
- **Fuso horário:** sempre `timestamptz`.
- **Isolamento entre tenants:** toda query com `tenant_id` (invariante 3). *Row Level Security* (RLS) do Postgres é uma defesa extra possível.

## 7. No Portunus

- `libs/database` é o **único** lugar onde o schema é definido.
- Migrations sempre via `pnpm db:generate`, exceto SQL que o Drizzle não expressa (como `CREATE EXTENSION vector`).
- Testes de integração com Postgres real via Testcontainers ([31](./31-testes-vitest-e-testcontainers.md)).

## 8. Para aprofundar

- PostgreSQL — documentação (leia *Concurrency Control* e *Indexes*): https://www.postgresql.org/docs/current/
- Drizzle ORM: https://orm.drizzle.team/docs/overview
- Use The Index, Luke! (índices explicados para devs): https://use-the-index-luke.com/
- Livro: *Designing Data-Intensive Applications* (Martin Kleppmann), caps. 3 e 7
