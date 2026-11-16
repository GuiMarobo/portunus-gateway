# 24 — Elasticsearch

> **Épicos:** E13.
> **Onde:** consumidor Indexer em `apps/consumers`, módulo `logs-search` no gateway, `infra/elasticsearch/` (templates e ILM).

---

## 1. O problema

"Um usuário reclamou de uma resposta estranha; ache a chamada." Isso exige **busca por texto** em milhões de prompts e respostas, combinada com filtros (tenant, período, modelo, erro, custo). Um `LIKE '%reembolso%'` no Postgres precisa varrer a tabela inteira, não entende relevância e não lida bem com variações de palavras.

## 2. Como funciona

### 2.1 O índice invertido

O coração de qualquer motor de busca. Em vez de "documento → palavras", guarda "**palavra → documentos**":

```
"reembolso" → [doc 3, doc 17, doc 42]
"prazo"     → [doc 3, doc 8]
"senha"     → [doc 5]
```

Buscar "prazo reembolso" vira **intersecção de listas**, quase sem depender do tamanho total da base. O custo é proporcional ao tamanho das listas envolvidas, e não ao número de documentos.

### 2.2 Análise de texto (analyzers)

Antes de indexar, o texto passa por um **analyzer**:

1. **Tokenizer:** quebra em termos ("Qual o prazo?" → `qual`, `o`, `prazo`).
2. **Filtros:** minúsculas, remoção de acentos (`asciifolding`), *stopwords* ("o", "de"), **stemming** (`reembolsos`, `reembolsar` → `reembols`).

O mesmo analyzer é aplicado na consulta, e é por isso que "Reembolsos" encontra "reembolso". Existe um analyzer `portuguese` pronto.

### 2.3 Relevância: BM25

O Elasticsearch ordena os resultados por **score**, usando o BM25 por padrão. A intuição:

- **TF (*term frequency*):** o termo aparece muitas vezes no documento? Mais relevante, mas com saturação (dez vezes não é dez vezes melhor).
- **IDF (*inverse document frequency*):** o termo é raro na base? Mais informativo ("reembolso" vale mais que "qual").
- **Normalização pelo tamanho:** documentos curtos com o termo pesam mais.

### 2.4 Arquitetura

- **Índice:** coleção de documentos JSON (como uma "tabela").
- **Shards:** o índice é dividido em pedaços (cada um é um índice Lucene) que podem ficar em nós diferentes, o que permite escalar horizontalmente.
- **Réplicas:** cópias dos shards, para alta disponibilidade e mais vazão de leitura.
- **Near real-time:** um documento indexado fica pesquisável após o próximo *refresh* (1 s por padrão).

### 2.5 Mapping: o "schema"

O mapping define o tipo de cada campo:

| Tipo | Uso | Campos do projeto |
|---|---|---|
| `text` | Analisado, para busca full-text | `prompt`, `response` |
| `keyword` | Exato, para filtros, agregações e ordenação | `tenant_id`, `model`, `provider`, `status`, `request_id`, `trace_id` |
| `long`, `float`, `scaled_float` | Numéricos e intervalos | `latency_ms`, `tokens_in`, `cost_usd` |
| `date` | Intervalos de tempo | `@timestamp` |
| `nested` | Arrays de objetos consultáveis individualmente | `attempts[]` |

**Dynamic mapping** (deixar o ES adivinhar os tipos) é perigoso: um campo pode virar `text` quando deveria ser `keyword`, e mudar o tipo depois exige reindexar. Por isso, ARQUITETURA.md §5.4 exige mapping explícito via **index template**.

### 2.6 Consulta típica (Query DSL)

```json
{
  "query": {
    "bool": {
      "must":   [{ "match": { "prompt": "prazo reembolso" } }],
      "filter": [
        { "term":  { "tenant_id": "t_123" } },
        { "range": { "@timestamp": { "gte": "now-7d" } } },
        { "term":  { "status": "error" } }
      ]
    }
  },
  "sort": [{ "_score": "desc" }, { "@timestamp": "desc" }]
}
```

`must` afeta o score; `filter` só filtra (e é cacheável). O filtro por tenant **sempre** vai em `filter`.

### 2.7 Ciclo de vida: índices por tempo e ILM

Logs crescem sem parar. O padrão é escrever em índices por período (`request-logs-2026.11.13`), ou num **data stream** que gerencia isso sozinho, e aplicar **ILM** (*Index Lifecycle Management*): fase *hot* (escrita), *warm*/*cold* (só leitura, recursos menores) e *delete* (após 30 dias, no projeto). Apagar um índice inteiro é instantâneo; apagar documentos um a um é caro.

## 3. Analogia

O índice invertido é o **índice remissivo no fim de um livro**: em vez de ler o livro todo procurando "reembolso", você vai no "R" e encontra "reembolso: páginas 3, 17, 42". O analyzer é o editor que decidiu que "reembolsos" e "reembolsar" ficam na mesma entrada. O ILM é a **política de arquivo** da biblioteca: livros novos na estante da frente, antigos no depósito, e os muito antigos descartados.

## 4. Por que está nesta arquitetura

- Requisito do CONTEXT.md §4.8: busca por texto com filtros.
- **Só busca, não fonte da verdade** (ADR 004): custo e orçamento ficam no Postgres. Se o ES perder dados, os relatórios financeiros não são afetados.
- **Fora do caminho crítico:** alimentado pelo Indexer a partir da fila. Se o ES cair, os eventos acumulam em `q.indexer` e são indexados quando ele voltar (CONTEXT.md §5.4).
- É o serviço mais pesado, por isso fica no perfil `search` do Compose.

## 5. Ferramentas similares

| Ferramenta | Diferença principal | Quando escolher |
|---|---|---|
| **OpenSearch** | Fork do Elasticsearch 7.10 mantido pela AWS (2021), após a mudança de licença do ES; API muito parecida | Licença Apache 2.0, AWS |
| **Postgres full-text** (`tsvector` + GIN) | Sem serviço extra; relevância e recursos mais simples | Volume moderado, busca simples |
| **Meilisearch, Typesense** | Leves, fáceis, ótimos para busca de produto com tolerância a erros de digitação | Busca de aplicação (catálogo, docs) |
| **Loki** | Indexa só **labels**, não o conteúdo; busca por conteúdo = varredura (grep distribuído) | Logs de aplicação baratos ([28](./28-logs-pino-e-loki.md)) |
| **ClickHouse** | Banco colunar analítico; busca textual possível, foco em agregações | Analytics de logs em grande volume |
| **Apache Solr** | Também sobre o Lucene; mais antigo | Legados |

Sobre a licença: o Elasticsearch saiu da Apache 2.0 em 2021 (Elastic License e SSPL) e, em 2024, voltou a oferecer uma opção open source (AGPL). Isso explica a existência do OpenSearch.

**Loki × Elasticsearch no projeto:** Loki guarda **logs de aplicação** (sem conteúdo de prompt, invariante 5) de forma barata; o Elasticsearch guarda os **registros de requisição com conteúdo**, onde a busca full-text e os filtros ricos justificam o custo.

## 6. Armadilhas

- **Mapping explosion:** campos dinâmicos ilimitados (ex.: chaves de um JSON arbitrário) estouram o limite de campos. Use mapping explícito e `dynamic: strict` ou `false`.
- **Shards demais e pequenos** desperdiçam memória.
- **Memória (heap da JVM)** é o recurso mais disputado; o ES é pesado para máquinas de desenvolvimento.
- **Deep pagination** (`from: 10000`) é cara; use `search_after`.
- **Isolamento por tenant:** esquecer o filtro de tenant numa consulta é um vazamento de dados.
- **Não é transacional nem fonte da verdade:** refresh assíncrono, eventual consistency.
- **Conteúdo sensível:** a redação de PII acontece **antes** de indexar ([25](./25-pii-e-privacidade.md)).

## 7. No Portunus

- E13: index template `request-logs-*`, ILM, Indexer (com `_id` = `event_id` para idempotência), busca no admin com filtros, relatório de prompts mais caros, demo do ES fora do ar.

## 8. Para aprofundar

- Elasticsearch — guia de referência: https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html
- Elastic — *Practical BM25*: https://www.elastic.co/blog/practical-bm25-part-2-the-bm25-algorithm-and-its-variables
- OpenSearch — documentação: https://opensearch.org/docs/latest/
- Livro: *Relevant Search* (Turnbull & Berryman)
