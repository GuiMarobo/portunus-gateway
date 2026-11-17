# 28 — Logs estruturados, pino e Loki

> **Épicos:** E0 (pino), E6 (envio ao Loki e correlação com traces).
> **Onde:** logger compartilhado (`libs/telemetry` ou `libs/common`), Loki no perfil `observability`.

---

## 1. O problema

`console.log("erro ao chamar provedor " + err)` gera texto livre. Em produção, com várias instâncias e milhares de linhas por segundo, é impossível filtrar "todos os erros do tenant X no provedor Y nos últimos 10 minutos" ou ligar uma linha de log ao trace da requisição. E logs mal pensados vazam dados (prompts, chaves).

## 2. Como funciona

### 2.1 Log estruturado

Cada linha é um **objeto JSON** com campos fixos e consultáveis:

```json
{
  "level": 30,
  "time": 1763030400123,
  "msg": "provider call failed",
  "request_id": "req_8f3a",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "tenant_id": "t_123",
  "provider": "openai",
  "attempt": 2,
  "status": 503,
  "duration_ms": 1840
}
```

Filtrar por `tenant_id` ou `provider` vira uma consulta exata, e não um grep frágil.

### 2.2 Níveis

| Nível             | Uso                                                      |
| ----------------- | -------------------------------------------------------- |
| `fatal`           | O processo vai cair                                      |
| `error`           | Uma operação falhou e precisa de atenção                 |
| `warn`            | Algo inesperado, mas tratado (fallback, fail-open)       |
| `info`            | Eventos de negócio relevantes (início/fim de requisição) |
| `debug` / `trace` | Detalhes para investigação, desligados em produção       |

### 2.3 pino

Um logger para Node focado em **desempenho**:

- Escreve JSON em `stdout` o mais rápido possível; formatação bonita (`pino-pretty`) e envio a destinos (_transports_) acontecem em **outra thread** (worker thread), sem bloquear o event loop.
- **Child loggers:** `logger.child({ request_id, tenant_id })` cria um logger que inclui esses campos em toda linha. É assim que o contexto da requisição entra em todos os logs dela.
- **`redact`:** remove ou mascara caminhos conhecidos (`req.headers.authorization`).
- Integração com Nest via `nestjs-pino` e com OpenTelemetry (injeção de `trace_id`/`span_id`).

### 2.4 Por que `stdout`?

O princípio dos _12-factor apps_: a aplicação não gerencia arquivos de log; escreve num fluxo, e a infraestrutura (Docker, um agente, o Collector) coleta e envia. Isso desacopla o app do destino.

### 2.5 Loki

Sistema de agregação de logs da Grafana Labs, desenhado para ser **barato**:

- Indexa **só os labels** (ex.: `service="gateway"`, `level="error"`), **não o conteúdo** da linha.
- O conteúdo fica em _chunks_ comprimidos (geralmente em armazenamento de objetos).
- A consulta seleciona os streams pelos labels e depois **filtra o conteúdo por varredura** (como um grep distribuído e paralelo).

```logql
{service="gateway", level="error"} | json | tenant_id="t_123" | provider="openai"
```

O mesmo cuidado de cardinalidade do Prometheus vale aqui: **labels com baixa cardinalidade** (serviço, nível, ambiente); `tenant_id` e `request_id` ficam **no corpo** JSON, filtrados com `| json`.

### 2.6 Correlação logs ↔ traces

Com `trace_id` em cada linha, o Grafana cria um link do log para o trace no Tempo e, do trace, de volta para os logs. É a "costura" entre os sinais ([26](./26-observabilidade-e-opentelemetry.md)).

## 3. Analogia

Log em texto livre é um **diário escrito à mão**: tem tudo, mas achar "todas as vezes que o carro deu problema na estrada X em março" exige ler o diário inteiro. Log estruturado é um **formulário de ocorrência** com campos (data, local, tipo, placa). O **Loki** é um arquivo que organiza as pastas só pela **etiqueta da capa** (serviço, gravidade); para achar algo dentro, abre as pastas certas e folheia rápido. É barato porque não precisa de um índice remissivo de cada palavra (isso seria o Elasticsearch).

## 4. Por que está nesta arquitetura

- **pino:** o logger mais rápido do ecossistema Node; o gateway está no caminho crítico, então logar não pode custar caro.
- **Loki:** barato e integrado ao Grafana e ao Tempo. Como os logs técnicos **não têm conteúdo de prompt** (invariante 5), não há necessidade de busca full-text neles; o Elasticsearch fica reservado para os registros de requisição.

## 5. Ferramentas similares

### Loggers Node

| Logger             | Diferença                                                                |
| ------------------ | ------------------------------------------------------------------------ |
| **pino**           | JSON, rapidíssimo, transports em worker thread. **A escolha do projeto** |
| **winston**        | Muito flexível (formatos, vários destinos), mais lento                   |
| **bunyan**         | JSON, antecessor espiritual do pino, pouco mantido                       |
| **Logger do Nest** | Simples; geralmente substituído por pino/winston                         |

### Agregação de logs

| Ferramenta                                                      | Diferença                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Loki**                                                        | Indexa só labels; barato; integrado ao Grafana. **A escolha do projeto** |
| **ELK / Elastic Stack** (Elasticsearch, Logstash/Beats, Kibana) | Indexa todo o conteúdo; busca poderosa; mais caro e pesado               |
| **OpenSearch**                                                  | Equivalente open source do ELK                                           |
| **Datadog Logs, Splunk**                                        | SaaS/enterprise; poderosos e caros por GB                                |
| **CloudWatch Logs, Google Cloud Logging**                       | Gerenciados nas nuvens                                                   |
| **Vector, Fluent Bit, Promtail/Alloy**                          | **Coletores/encaminhadores** (não armazenam); levam logs de A para B     |

## 6. Armadilhas

- **Logar conteúdo** (prompt, resposta, chave de API, headers inteiros). É a armadilha número um deste projeto.
- **Labels de alta cardinalidade no Loki.**
- **Logar demais em `info`** no caminho crítico: custa CPU, disco e dinheiro.
- **Erros sem contexto:** `error` sem `request_id`, `tenant_id`, `provider` e a stack não ajuda ninguém.
- **Serializar objetos gigantes** (o request inteiro) em cada linha.
- **Logs como métrica:** contar erros varrendo logs é caro; use uma métrica.
- **`console.log` perdido** fora do logger configurado.

## 7. No Portunus

- E0: pino com `request_id` por requisição e `redact` de headers sensíveis.
- E6: `trace_id`/`span_id` injetados, envio ao Loki via Collector, link log → trace no Grafana.

## 8. Para aprofundar

- pino — documentação: https://getpino.io/
- nestjs-pino: https://github.com/iamolegga/nestjs-pino
- Grafana Loki — documentação (e _Label best practices_): https://grafana.com/docs/loki/latest/
- The Twelve-Factor App — _Logs_: https://12factor.net/logs
