# 29 — Tracing distribuído e Tempo

> **Épicos:** E6 (fundação), E7 (span por tentativa), E11 (trace atravessando o RabbitMQ).
> **Onde:** `libs/telemetry`, Tempo no perfil `observability`.

---

## 1. O problema

Uma requisição lenta passou por auth, Redis, Postgres, pgvector, uma chamada de embedding, dois provedores (com retry e fallback) e, depois, por RabbitMQ e três consumidores. Métricas dizem que "está lento"; logs dizem "o que aconteceu" em cada peça, separadamente. Nenhum dos dois mostra **onde o tempo foi gasto nesta requisição específica**, nem como as peças se encadearam.

## 2. Como funciona

### 2.1 Trace e span

- **Span:** uma operação com início, fim, nome, atributos e status. Ex.: `provider.call`, 1840 ms, `provider=openai`, `attempt=2`, `status=ERROR`.
- **Trace:** a árvore de spans de uma mesma requisição, ligados por relação pai → filho. Todos compartilham o mesmo **trace id**.

```
POST /v1/chat/completions                    ████████████████████████████ 2350 ms
├─ auth                                      █ 3 ms
├─ ratelimit                                 █ 1 ms
├─ budget                                    █ 1 ms
├─ cache.exact                               █ 1 ms (miss)
├─ cache.semantic                            ███ 85 ms (miss)
│  ├─ embeddings.create                      ██ 60 ms
│  └─ pgvector.search                        █ 20 ms
├─ router
│  ├─ provider.call (openai, attempt 1)      ████████ 1000 ms (timeout)
│  ├─ provider.call (openai, attempt 2)      ███ 400 ms (503)
│  └─ provider.call (anthropic, attempt 1)   ████████ 850 ms (ok)  ← fallback
└─ event.publish                             █ 2 ms
```

Esse "diagrama de cascata" (_waterfall_) responde em segundos o que levaria horas com logs.

### 2.2 Atributos, eventos e status

- **Atributos:** pares chave-valor (`gen_ai.request.model`, `tenant.id`, `cache.result`). Aqui cardinalidade alta **é aceitável** (cada span é um registro, não uma série), mas **conteúdo sensível não** (invariante 5).
- **Eventos de span:** marcos com timestamp dentro do span (ex.: "primeiro byte recebido").
- **Status:** `OK`, `ERROR` + exceção registrada.

### 2.3 Propagação de contexto

Para que o consumidor do RabbitMQ continue o mesmo trace, o contexto viaja junto:

```
gateway: span "event.publish"  → headers da mensagem: traceparent=00-<trace_id>-<span_id>-01
indexer: lê o traceparent → cria span "indexer.process" como filho (ou como link)
```

Formato **W3C Trace Context** (`traceparent`). Em processamento assíncrono, às vezes se usa um **span link** em vez de pai/filho, porque o consumo pode acontecer muito depois e em lote.

### 2.4 Amostragem (sampling)

Guardar 100% dos traces em alto volume é caro. Estratégias:

- **Head sampling:** decide no início (ex.: 10% das requisições). Simples, mas pode descartar justamente a requisição que deu erro.
- **Tail sampling:** decide **depois** que o trace termina, no Collector (ex.: "guarde todos os com erro ou acima de 2 s, e 5% do resto"). Mais inteligente, exige memória no Collector.

Em desenvolvimento, 100%.

### 2.5 Tempo

O Grafana Tempo é um backend de traces desenhado para ser **barato**:

- Guarda traces em **armazenamento de objetos** (S3, GCS, disco local), sem um banco indexado pesado.
- A busca principal é **por trace id**, que chega via links de logs (Loki) e exemplars de métricas (Prometheus).
- **TraceQL** permite buscar por atributos: `{ span.provider = "openai" && status = error && duration > 1s }`.
- Pode gerar métricas a partir de spans (_metrics generator_: RED por serviço, grafo de serviços).

## 3. Analogia

Um trace é o **rastreamento de uma encomenda**: "postado em SP 10:00 → triagem em Campinas 12:30 → tentativa de entrega 1 falhou 15:00 → redirecionada para outra transportadora 15:10 → entregue 18:00". Cada linha é um span; o código de rastreio é o trace id. A **propagação de contexto** é a etiqueta com o código colada na caixa: toda transportadora que pega a caixa registra no mesmo código.

## 4. Por que está nesta arquitetura

- CONTEXT.md §4.9: "Acompanhar o caminho completo de uma requisição, etapa por etapa, inclusive quando houve retry ou fallback".
- Critério de portfólio: "Dá para seguir uma requisição do início ao fim nos dashboards".
- Ferramenta de aprendizado: ver retry, circuit breaker e fallback acontecendo no waterfall.

## 5. Ferramentas similares

| Ferramenta                            | Diferença principal                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| **Grafana Tempo**                     | Armazenamento em objeto, barato, busca por id + TraceQL. **A escolha do projeto**    |
| **Jaeger**                            | Open source (CNCF), UI própria, backends como Cassandra/Elasticsearch; muito popular |
| **Zipkin**                            | O pioneiro open source (inspirado no Dapper do Google), mais simples                 |
| **Honeycomb**                         | SaaS de eventos com alta cardinalidade; consultas exploratórias poderosas            |
| **Datadog APM, New Relic, Dynatrace** | SaaS completos, com perfilamento e correlação automática                             |
| **AWS X-Ray, Google Cloud Trace**     | Gerenciados nas nuvens                                                               |
| **Langfuse, LangSmith**               | Traces específicos de aplicações LLM (prompts, cadeias, custo)                       |

## 6. Armadilhas

- **Contexto perdido** em código assíncrono que sai do `AsyncLocalStorage` (callbacks de bibliotecas antigas, filas): o trace "quebra" em dois.
- **Spans demais** (um por função) poluem e custam; um por etapa significativa e por I/O basta.
- **Prompts em atributos de span:** violação de privacidade.
- **Head sampling descartando erros:** em produção, prefira tail sampling ou "sempre amostre erros".
- **Relógios desalinhados** entre máquinas distorcem o waterfall entre serviços.
- **Não fechar spans** (`span.end()`) em caminhos de erro: spans "eternos".

## 7. No Portunus

- E6: spans `auth`, `ratelimit`, `budget`, `cache.exact`, `cache.semantic`, `router`, `provider.call`, `event.publish`.
- E7: um span `provider.call` por tentativa, com `attempt` e motivo do fallback.
- E11: `traceparent` nos headers do RabbitMQ e continuação nos consumidores.

## 8. Para aprofundar

- OpenTelemetry — _Traces_ (conceitos): https://opentelemetry.io/docs/concepts/signals/traces/
- OpenTelemetry — _Sampling_: https://opentelemetry.io/docs/concepts/sampling/
- Grafana Tempo — documentação e TraceQL: https://grafana.com/docs/tempo/latest/
- Google — _Dapper, a Large-Scale Distributed Systems Tracing Infrastructure_ (artigo que originou a área): https://research.google/pubs/dapper-a-large-scale-distributed-systems-tracing-infrastructure/
