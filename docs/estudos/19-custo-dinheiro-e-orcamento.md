# 19 — Custo, dinheiro e orçamento

> **Épicos:** E4 (preços e custo), E8 (orçamento), E12 (agregados e reconciliação).
> **Módulos:** `pricing`, `budget`.
> **ADRs:** representação de dinheiro; 004 (Postgres como fonte da verdade de custo).

---

## 1. O problema

"Custo sem dono" é a primeira dor do CONTEXT.md. Para resolvê-la, o gateway precisa calcular o custo de **cada** chamada, somá-lo por cliente, por modelo e por dia, e bloquear quem estoura o orçamento. Parece só multiplicação, mas tem três armadilhas clássicas: **ponto flutuante**, **preços que mudam com o tempo** e **concorrência**.

## 2. Como funciona

### 2.1 A fórmula

```
custo = tokens_entrada × preço_entrada_por_token + tokens_saída × preço_saída_por_token
```

Preços são publicados por **1 milhão de tokens**, separados para entrada e saída (a saída costuma custar várias vezes mais; ver [02](./02-tokens-e-tokenizacao.md)). Alguns provedores têm preços diferentes para tokens de entrada em cache, para lotes e para contextos longos.

### 2.2 Por que não usar `number` (float)

```js
0.1 + 0.2 === 0.30000000000000004
```

Floats (IEEE 754) não representam exatamente a maioria das frações decimais. Somar milhões de custos pequenos acumula erro. Para dinheiro, as opções são:

| Opção | Como | Prós | Contras |
|---|---|---|---|
| **Inteiro em unidades mínimas** | Guardar **micro-dólares** (1 USD = 1.000.000) como `bigint` | Exato, rápido, simples de somar | Definir a unidade com folga para preços muito pequenos por token |
| **Decimal** | `numeric` no Postgres + biblioteca decimal no JS (`decimal.js`, `big.js`) | Exato e flexível | Mais lento; dependência nova |
| **Float** | `number` | Simples | **Errado para dinheiro** |

Um **value object `Money`** no domínio esconde a escolha e impede misturar dinheiro com números soltos ([11](./11-clean-architecture-e-padroes.md)).

Preço por token pode ser menor que um micro-dólar (ex.: US$ 0,15 por 1M tokens = 0,15 micro-USD por token). Por isso é comum guardar o **preço por 1M tokens** e calcular `tokens × preço_por_1M ÷ 1.000.000` só no final, arredondando uma vez, com regra de arredondamento definida.

### 2.3 Preços com vigência (dados temporais)

Invariante 9: **mudar um preço nunca altera custos passados.**

```
model_prices
  model_id | input_per_1m | output_per_1m | valid_from          | valid_to
  gpt-x    | 0.15         | 0.60          | 2026-01-01 00:00    | 2026-06-01 00:00
  gpt-x    | 0.10         | 0.40          | 2026-06-01 00:00    | null
```

- O custo é calculado com o preço **vigente no momento da chamada** e **gravado** no evento. Relatórios somam o custo gravado, nunca recalculam.
- Nunca se faz `UPDATE` num preço; insere-se uma nova linha e fecha-se a anterior (*effective dating*).
- Um `EXCLUDE` constraint (ou validação) impede vigências sobrepostas para o mesmo modelo.

### 2.4 Orçamento mensal

- Cada tenant tem um teto mensal e um **modo**: bloquear ou só alertar.
- **Contador quente** no Redis: `budget:{tenant}:{aaaamm}`, incrementado pelo gateway logo após calcular o custo (`INCRBY` em micro-dólares, atômico).
- **Verificação** na esteira, antes do cache e do provedor: consumo atual ≥ teto? → bloqueia (`402`/`429` com erro específico, a definir na spec) ou segue com alerta.
- **Limiar de aviso** (ex.: 80%): ao cruzar, gera um evento `budget.threshold` (uma vez só).
- **Reconciliação (E12):** o Aggregator soma os eventos no Postgres (fonte da verdade) e corrige o contador do Redis se divergir.

### 2.5 Concorrência no orçamento

Duas requisições chegam juntas com US$ 1 de saldo, e cada uma custará US$ 0,80. Ambas leem "saldo OK" e passam: o orçamento estoura. Opções:

- **Aceitar um pequeno estouro** (o custo só é conhecido no fim da chamada, então algum estouro é inevitável sem reserva).
- **Reservar** o custo estimado antes da chamada e ajustar depois (como no rate limit de tokens).

Essa decisão precisa ser consciente e documentada.

### 2.6 Economia do cache

Num hit, o custo é zero, mas a **economia** é o custo que a chamada **teria tido**: tokens da resposta guardada × preço vigente. Essa métrica (`gateway_cache_savings_usd_total`) mostra o valor do cache.

## 3. Analogia

- **Float para dinheiro** é como medir o caixa de uma loja com uma balança de cozinha: cada pesagem erra um pouquinho, e no fim do mês a conta não fecha.
- **Preço com vigência** é a **nota fiscal**: ela registra o preço do dia da compra. Se o produto encarece amanhã, a nota de ontem não muda.
- **Contador no Redis + reconciliação** é o **saldo no app do banco** (rápido, às vezes um pouco defasado) e o **extrato oficial** (a verdade, consolidada depois).

## 4. Por que está nesta arquitetura

- Resolve a dor "custo sem dono" e habilita relatórios para gestão/finanças.
- O orçamento protege o caixa da empresa contra bugs e abusos.
- É um ótimo exercício de modelagem de domínio (value objects, dados temporais, concorrência).

## 5. Ferramentas similares

| Ferramenta | Diferença |
|---|---|
| **LiteLLM** (budgets e spend tracking) | Orçamento por chave/time e tabela de preços mantida pela comunidade |
| **Helicone, Langfuse** | Rastreamento de custo por chamada, sem bloqueio |
| **Painéis dos provedores** (OpenAI, Anthropic) | Custo agregado por projeto, com atraso; sem visão por cliente seu |
| **OpenCost / Kubecost, FinOps** | Custo de infraestrutura, não de tokens; mesma disciplina de alocar custo por dono |
| **Bibliotecas de dinheiro** (`dinero.js`, `decimal.js`, `big.js`) | Representação monetária e aritmética decimal em JS |

## 6. Armadilhas

- **Float** em qualquer etapa (inclusive no JSON de resposta, ao serializar).
- **Recalcular custo passado** com o preço atual.
- **Fuso horário do "mês" e do "dia":** UTC ou o fuso do tenant? Defina e seja consistente.
- **Read-modify-write** no contador em vez de `INCRBY` atômico.
- **Custo de embeddings e retries** também é custo (o cache semântico e o fallback gastam).
- **Divergência Redis × Postgres** sem uma regra de quem vence.

## 7. No Portunus

- E4: tabelas `providers` e `model_prices` com vigência, cálculo de custo (TDD), header de custo.
- E8: contador no Redis, modos de orçamento, limiar de aviso.
- E12: `usage_aggregates`, reconciliação e relatórios.

## 8. Para aprofundar

- *What Every Computer Scientist Should Know About Floating-Point Arithmetic* (Goldberg): https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html
- Martin Fowler — *Money* (padrão): https://martinfowler.com/eaaCatalog/money.html
- Martin Fowler — *Temporal Patterns*: https://martinfowler.com/eaaDev/timeNarrative.html
- PostgreSQL — tipo `numeric`: https://www.postgresql.org/docs/current/datatype-numeric.html
