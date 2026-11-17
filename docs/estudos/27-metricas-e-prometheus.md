# 27 — Métricas e Prometheus

> **Épicos:** E6 (base); E7, E8, E9, E10, E11, E12 (métricas de cada domínio).
> **Onde:** `libs/telemetry`, Prometheus no perfil `observability`.

---

## 1. O problema

Logs dizem o que aconteceu em **uma** requisição. Para saber "quantas requisições por segundo?", "qual o p95 de latência?", "o hit rate do cache caiu?", seria preciso ler e somar milhões de logs: lento e caro. É preciso números **já agregados**, baratos de guardar e de consultar ao longo do tempo.

## 2. Como funciona

### 2.1 Série temporal

Uma métrica é uma **série temporal**: um nome + um conjunto de **labels** + uma sequência de (timestamp, valor).

```
gateway_requests_total{tenant="acme", model="gpt-x", status="200", cache="miss"}  → 15230 @ 10:05:00
```

Cada **combinação única de labels** é uma série separada, guardada separadamente.

### 2.2 Tipos de métrica

| Tipo          | Comportamento                             | Exemplos do projeto                                                        |
| ------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| **Counter**   | Só sobe (zera no restart)                 | `gateway_requests_total`, `gateway_tokens_total`, `gateway_cost_usd_total` |
| **Gauge**     | Sobe e desce                              | `gateway_circuit_state`, `gateway_queue_depth`                             |
| **Histogram** | Conta observações em **buckets** de valor | `gateway_request_duration_seconds`                                         |
| **Summary**   | Calcula quantis no cliente                | Pouco usado; não agrega entre instâncias                                   |

**Por que histogram para latência?** Média esconde a cauda: 99 requisições de 10 ms e 1 de 10 s têm média de ~110 ms, o que não descreve ninguém. Percentis (p50, p95, p99) mostram a experiência real. O histogram guarda contagens por faixa (`le="0.1"`, `le="0.5"`, `le="1"`...) e o percentil é **estimado** depois. Como os buckets são somáveis, dá para agregar entre instâncias, coisa que o summary não permite.

### 2.3 Modelo pull

O Prometheus **busca** (_scrape_) as métricas: a cada N segundos faz `GET /metrics` em cada alvo. Vantagens: o Prometheus sabe quando um alvo está fora (o scrape falha) e controla a própria carga. No projeto, o fluxo é app → OTLP → Collector, e o Prometheus raspa o Collector (ou o Collector envia via _remote write_).

### 2.4 PromQL: o essencial

```promql
# requisições por segundo, por status, nos últimos 5 min
sum by (status) (rate(gateway_requests_total[5m]))

# taxa de erro
sum(rate(gateway_requests_total{status=~"5.."}[5m])) / sum(rate(gateway_requests_total[5m]))

# p95 de latência
histogram_quantile(0.95, sum by (le) (rate(gateway_request_duration_seconds_bucket[5m])))

# hit rate do cache exato
sum(rate(gateway_cache_hits_total{type="exact"}[5m])) / sum(rate(gateway_requests_total[5m]))
```

- `rate()` transforma um counter (que só sobe) em "por segundo" e lida com reinícios.
- **Nunca** use o valor bruto de um counter num gráfico; use `rate` ou `increase`.

### 2.5 Cardinalidade: o conceito mais importante

O custo do Prometheus é proporcional ao **número de séries ativas**, e esse número é o **produto** das cardinalidades dos labels:

```
tenants (100) × modelos (10) × status (8) × cache (3) = 24.000 séries   → ok
+ request_id (milhões) = milhões de séries                               → derruba o Prometheus
```

Regras do projeto (invariante 6):

- `request_id`, `trace_id`, `user_id`, prompts e URLs com IDs **nunca** viram label.
- `tenant` é aceitável enquanto o número de tenants for moderado.
- Para "qual requisição foi lenta?", use **exemplars** (um link de um ponto do histograma para um `trace_id`, sem virar label) ou vá para traces/logs.

### 2.6 Armazenamento

O TSDB do Prometheus guarda blocos comprimidos em disco local, com retenção configurável (15 dias por padrão). Para longo prazo e alta disponibilidade, usam-se sistemas compatíveis: Thanos, Mimir, VictoriaMetrics.

## 3. Analogia

Métricas são o **painel do carro**: velocímetro (gauge), hodômetro (counter, só sobe) e um gráfico de "quantas vezes você freou bruscamente por faixa de velocidade" (histogram). O painel não registra **cada** viagem em detalhe (isso seria o log), mas mostra de relance se algo está errado. E se você quisesse um ponteiro **por passageiro que já andou no carro** (alta cardinalidade), o painel não caberia no carro.

## 4. Por que está nesta arquitetura

- Dashboards de req/s, erros, latência, custo, cache, provedores e filas (ARQUITETURA.md §9).
- Alertas baseiam-se quase sempre em métricas (baratas de avaliar continuamente).
- A lista de métricas obrigatórias está em ARQUITETURA.md §9.

## 5. Ferramentas similares

| Ferramenta                        | Diferença principal                                                              |
| --------------------------------- | -------------------------------------------------------------------------------- |
| **Prometheus**                    | Pull, PromQL, padrão de fato em cloud native. **A escolha do projeto**           |
| **Grafana Mimir, Thanos, Cortex** | Prometheus escalável e de longo prazo (multi-instância, armazenamento em objeto) |
| **VictoriaMetrics**               | Compatível com Prometheus, mais eficiente em memória e disco                     |
| **InfluxDB**                      | Banco de séries temporais, push, linguagem própria                               |
| **Datadog, New Relic**            | SaaS; cobram por série customizada, então cardinalidade vira custo direto        |
| **StatsD + Graphite**             | Geração anterior: push via UDP, agregação no servidor                            |
| **OpenTelemetry Metrics**         | A API/SDK de métricas; exporta para qualquer um dos acima                        |

## 6. Armadilhas

- **Alta cardinalidade** (seção 2.5), o erro número um.
- **Buckets mal escolhidos:** se todos os valores caem num bucket só, o percentil estimado é inútil. Escolha os buckets com base nas metas (ex.: 0,005 a 30 s para LLM).
- **Média em vez de percentil.**
- **`rate` com janela menor que 2× o intervalo de scrape** dá resultados vazios ou ruidosos.
- **Somar percentis** (p95 de instâncias diferentes não se soma); agregue os buckets e calcule depois.
- **Métrica de custo em float:** para relatórios financeiros, a fonte é o Postgres; a métrica é para visualização.

## 7. No Portunus

As métricas do ARQUITETURA.md §9 (`gateway_requests_total`, `gateway_request_duration_seconds`, `gateway_provider_duration_seconds`, `gateway_tokens_total`, `gateway_cost_usd_total`, `gateway_cache_hits_total`, `gateway_cache_savings_usd_total`, `gateway_ratelimit_rejections_total`, `gateway_circuit_state`, `gateway_queue_depth`, `gateway_dlq_size`, `gateway_event_consumer_lag`), cada uma entregue no épico do seu domínio.

## 8. Para aprofundar

- Prometheus — _Metric types_: https://prometheus.io/docs/concepts/metric_types/
- Prometheus — _Histograms and summaries_: https://prometheus.io/docs/practices/histograms/
- Prometheus — _Naming_ e _Instrumentation_ (boas práticas): https://prometheus.io/docs/practices/naming/
- PromLabs — _PromQL cheat sheet_: https://promlabs.com/promql-cheat-sheet/
