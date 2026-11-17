# 06 — Busca vetorial e pgvector

> **Épicos:** E10 (cache semântico).
> **Módulos:** `cache` (infraestrutura), `libs/database`.
> **ADR:** 003 (pgvector para cache semântico); decisão HNSW × IVFFlat.

---

## 1. O problema

Com embeddings ([05](./05-embeddings.md)), "achar a pergunta mais parecida" vira "achar o vetor mais próximo". Fazer isso comparando com **todos** os vetores (força bruta) custa O(n·d) por consulta e fica inviável quando _n_ cresce. É preciso um índice que encontre vizinhos próximos rápido, aceitando uma pequena imprecisão.

## 2. Como funciona

### 2.1 kNN exato × ANN

- **kNN exato** (_k nearest neighbors_): garante os _k_ mais próximos. Custo O(n·d).
- **ANN** (_approximate nearest neighbors_): encontra vizinhos **quase sempre** corretos, muito mais rápido. A qualidade é medida pelo **recall**: de 10 vizinhos verdadeiros, quantos o índice achou.

Todo índice vetorial é um trade-off entre **velocidade, recall, memória e tempo de construção**.

### 2.2 IVFFlat (Inverted File with Flat compression)

1. Na criação, roda um **k-means** sobre os vetores existentes e define `lists` centroides (agrupamentos).
2. Cada vetor é guardado na lista do centroide mais próximo.
3. Na busca, compara a consulta com os centroides, escolhe os `probes` mais próximos e faz força bruta só dentro dessas listas.

- **Complexidade de busca:** ~O(lists·d + probes·(n/lists)·d).
- **Prós:** construção rápida, pouca memória.
- **Contras:** precisa de dados **antes** de criar o índice (os centroides são aprendidos); se a distribuição dos dados mudar, o recall cai até reconstruir. Vizinhos que estão na fronteira entre listas podem ser perdidos.

### 2.3 HNSW (Hierarchical Navigable Small World)

1. Monta um **grafo em camadas**: as camadas de cima têm poucos nós e ligações longas ("rodovias"); as de baixo têm todos os nós e ligações curtas ("ruas").
2. A busca começa no topo, anda de forma gulosa em direção à consulta, desce de camada e refina.
3. Parâmetros: `m` (ligações por nó), `ef_construction` (esforço na construção) e `ef_search` (esforço na busca; maior = mais recall e mais lento).

- **Complexidade de busca:** ~O(log n) na prática.
- **Prós:** melhor relação velocidade/recall; pode ser criado com a tabela vazia e cresce com inserções.
- **Contras:** construção mais lenta e mais memória (o grafo).

|                     | IVFFlat                     | HNSW                             |
| ------------------- | --------------------------- | -------------------------------- |
| Velocidade de busca | Boa                         | Melhor                           |
| Recall típico       | Bom (depende de `probes`)   | Melhor                           |
| Memória             | Menor                       | Maior                            |
| Construção          | Rápida, exige dados prévios | Lenta, funciona com tabela vazia |
| Inserções contínuas | Degrada com o tempo         | Lida bem                         |

Para um cache que começa vazio e cresce continuamente, **HNSW tende a ser a escolha natural**. Isso precisa ser confirmado com medição no E10.

### 2.4 pgvector na prática

pgvector é uma **extensão do PostgreSQL** que adiciona o tipo `vector`, operadores de distância e índices.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE semantic_cache_entries (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  context_hash text NOT NULL,
  embedding vector(1536) NOT NULL,
  response jsonb NOT NULL
);

CREATE INDEX ON semantic_cache_entries USING hnsw (embedding vector_cosine_ops);

SELECT id, 1 - (embedding <=> $1) AS similarity
FROM semantic_cache_entries
WHERE tenant_id = $2 AND context_hash = $3
ORDER BY embedding <=> $1
LIMIT 1;
```

Operadores: `<->` (distância L2), `<=>` (distância de cosseno), `<#>` (produto interno negativo). **Similaridade de cosseno = 1 − distância de cosseno.**

### 2.5 O problema do filtro + ANN

A consulta acima filtra por `tenant_id` e `context_hash` **e** ordena por vetor. O índice HNSW percorre os vizinhos globais e só **depois** aplica o `WHERE` (_post-filtering_). Se os vizinhos mais próximos forem de outros tenants, o resultado pode vir vazio mesmo existindo um bom candidato do tenant. Saídas:

- Versões recentes do pgvector (0.8+) têm **iterative index scans**, que continuam buscando até satisfazer o filtro.
- **Índices parciais** ou particionamento por tenant.
- Aumentar `ef_search`.

Esse é exatamente o tipo de coisa que passa despercebida e só aparece em produção.

## 3. Analogia

- **Força bruta:** perguntar a cada pessoa de um estádio se ela é parecida com você.
- **IVFFlat:** o estádio foi dividido em setores por "tipo de pessoa"; você vai só aos setores mais parecidos. Se você estiver na divisa entre dois setores, pode perder alguém.
- **HNSW:** você pergunta a um conhecido que "conhece gente de todo lugar"; ele te passa para alguém mais parecido com você, que te passa para outro ainda mais parecido... Em poucos saltos você chega à pessoa certa (é o efeito "mundo pequeno", dos seis graus de separação).

## 4. Por que está nesta arquitetura

- O cache semântico precisa de busca por vizinho mais próximo.
- **pgvector reaproveita o Postgres** que já existe no projeto: sem um serviço a mais para operar, com transações, backups e `WHERE tenant_id = ...` no mesmo lugar (ADR 003).
- Para o volume de um cache de gateway (milhares a poucos milhões de entradas por tenant), o Postgres dá conta.

## 5. Ferramentas similares

| Ferramenta                           | Tipo                           | Diferença principal                                  | Quando escolher                                       |
| ------------------------------------ | ------------------------------ | ---------------------------------------------------- | ----------------------------------------------------- |
| **pgvector**                         | Extensão do Postgres           | Vetores junto dos dados relacionais, SQL, transações | Já usa Postgres; volume moderado                      |
| **Redis (Redis Stack / RediSearch)** | Busca vetorial em memória      | Latência muito baixa; tudo em RAM                    | O cache exato já está no Redis e a latência é crítica |
| **Qdrant**                           | Banco vetorial dedicado (Rust) | Filtros ricos durante a busca, quantização           | Volume grande, filtros complexos                      |
| **Weaviate, Milvus**                 | Bancos vetoriais dedicados     | Escala horizontal, vários tipos de índice            | Bilhões de vetores                                    |
| **Pinecone**                         | SaaS gerenciado                | Zero operação                                        | Não quer operar infraestrutura                        |
| **Elasticsearch / OpenSearch (kNN)** | Busca textual + vetorial       | Busca híbrida (palavras + vetores)                   | Já usa ES e quer busca híbrida                        |
| **FAISS**                            | Biblioteca (Meta)              | Não é banco: índice em memória dentro do processo    | Pesquisa, lotes offline                               |

## 6. Armadilhas

- **Filtro + ANN** (seção 2.5).
- **IVFFlat criado em tabela vazia** gera centroides inúteis.
- **Memória do HNSW:** o índice precisa caber na memória para ser rápido; monitore.
- **Dimensão fixa na coluna:** trocar de modelo de embedding exige migração.
- **`VACUUM` e inserções/remoções frequentes** afetam índices; o expurgo do cache precisa ser pensado.
- **Recall não aparece em erro:** um índice ruim simplesmente "não acha", e o hit rate cai sem nenhum alarme. Meça recall comparando com a busca exata numa amostra.

## 7. No Portunus

- E10: migration com `CREATE EXTENSION vector` (um dos poucos SQLs escritos à mão, pois o Drizzle não o expressa), tabela `semantic_cache_entries`, índice e consulta com escopo por tenant.
- Adapter `SemanticCacheRepository` na camada de infraestrutura, atrás de um port do domínio.

## 8. Para aprofundar

- pgvector (README completo, com guias de índices): https://github.com/pgvector/pgvector
- Malkov & Yashunin — artigo original do HNSW: https://arxiv.org/abs/1603.09320
- Pinecone Learn — _Vector indexes_ (explicações visuais de IVF e HNSW): https://www.pinecone.io/learn/series/faiss/
- Supabase — _pgvector: HNSW vs IVFFlat_: https://supabase.com/docs/guides/ai/vector-indexes
