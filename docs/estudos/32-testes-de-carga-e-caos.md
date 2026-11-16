# 32 — Testes de carga e de caos (k6)

> **Épicos:** E3 (medição inicial de overhead), E16 (carga, caos e números do README).
> **Onde:** `load-tests/`.

---

## 1. O problema

"O gateway é rápido" não é uma afirmação; "p95 de 14 ms de overhead a 500 req/s numa máquina X" é. Sem medir sob carga, não se sabe onde o sistema satura, se o cache realmente ajuda nem se a promessa "Elasticsearch fora não afeta as respostas" é verdadeira. Testes funcionais não respondem a nenhuma dessas perguntas.

## 2. Como funciona

### 2.1 Tipos de teste de desempenho

| Tipo | Pergunta |
|---|---|
| **Smoke** | Funciona com carga mínima? |
| **Carga (load)** | Aguenta o volume esperado dentro das metas? |
| **Estresse** | Onde quebra? Como degrada? |
| **Pico (spike)** | Aguenta um salto repentino? |
| **Resistência (soak)** | Aguenta horas sem vazar memória ou conexões? |

### 2.2 k6

Ferramenta de testes de carga da Grafana Labs: o motor é escrito em Go (eficiente) e os cenários em JavaScript.

```js
import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    steady: {
      executor: "constant-arrival-rate",
      rate: 500,
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 200,
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<200"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const res = http.post(`${__ENV.BASE_URL}/v1/chat/completions`, JSON.stringify({
    model: "rapido",
    messages: [{ role: "user", content: "Qual o prazo de reembolso?" }],
  }), { headers: { "Content-Type": "application/json", Authorization: `Bearer ${__ENV.API_KEY}` } });
  check(res, { "status 200": (r) => r.status === 200 });
}
```

- **VU (virtual user):** um "usuário" executando o script em loop.
- **Thresholds:** critérios de aprovação. O k6 sai com código ≠ 0 se forem violados, o que permite rodá-lo no CI.
- **Executors:** como a carga é gerada.

### 2.3 Modelo aberto × fechado (e coordinated omission)

- **Fechado** (N VUs em loop): cada VU só envia a próxima requisição quando a anterior termina. Se o sistema fica lento, a carga **diminui** sozinha, e o teste mascara o problema.
- **Aberto** (`constant-arrival-rate`): requisições chegam a uma taxa fixa, como usuários reais, independentemente da lentidão. É o modelo correto para medir latência sob uma vazão alvo.

Medir só o tempo das requisições que conseguiram ser enviadas, ignorando as que "deveriam" ter sido enviadas durante uma lentidão, é o **coordinated omission**: subestima a cauda da latência.

### 2.4 Medindo o overhead do gateway

A meta (p95 < 20 ms) é sobre o que o gateway **adiciona**:

```
overhead ≈ latência(cliente → gateway → mock) − latência(cliente → mock)
```

Os dois cenários rodam com a mesma latência configurada no mock. Os resultados vão para o README **com a descrição da máquina**.

### 2.5 Engenharia do caos

Experimentos controlados que **injetam falhas** para verificar que o sistema se comporta como o projeto promete:

1. **Hipótese:** "Com o Elasticsearch fora, as respostas continuam com p95 inalterado e os eventos acumulam em `q.indexer`".
2. **Experimento:** com carga constante, `docker compose stop elasticsearch`.
3. **Observação:** métricas, alertas e respostas.
4. **Volta:** sobe o ES; os eventos são indexados.

Cada linha da tabela do ARQUITETURA.md §8 vira um experimento (provedor, Redis, Postgres, RabbitMQ, Elasticsearch, OTel Collector).

Para falhas mais finas que "derrubar o container" (latência, perda de pacotes, conexão cortada no meio), existe o **Toxiproxy**, um proxy TCP que injeta "toxinas" programaticamente.

## 3. Analogia

- **Teste de carga:** o **teste de esforço na esteira** do cardiologista: aumenta-se a velocidade aos poucos e mede-se a frequência cardíaca em cada estágio, para saber até onde o coração vai bem.
- **Coordinated omission:** um cronometrista que, quando o corredor tropeça, pausa o cronômetro.
- **Caos:** o **simulado de incêndio** do prédio: você aciona o alarme de propósito, num horário controlado, para descobrir se as rotas de fuga funcionam **antes** do incêndio real.

## 4. Por que está nesta arquitetura

- Critério de portfólio: "Existe medição real de desempenho documentada".
- Critério de portfólio: "registro/busca pode ficar fora do ar sem afetar as respostas", provado por experimento, e não por afirmação.
- ADR 008 (Fastify) e as metas do ARQUITETURA.md §13 dependem de números.

## 5. Ferramentas similares

### Carga

| Ferramenta | Diferença |
|---|---|
| **k6** | Scripts JS, motor Go, thresholds, integração com Grafana. **A escolha do projeto** |
| **Gatling** | Scala/Java/Kotlin (e JS), relatórios HTML ricos |
| **Apache JMeter** | Veterano, GUI, Java; pesado para alta carga |
| **Locust** | Cenários em Python, distribuído |
| **Artillery** | Node, YAML + JS, foco em serverless |
| **autocannon** | Node, benchmark HTTP simples e rápido (bom para micro-benchmarks do Fastify) |
| **wrk / wrk2, Vegeta, oha** | CLIs de benchmark; o wrk2 corrige o coordinated omission |

### Caos

| Ferramenta | Diferença |
|---|---|
| **`docker compose stop/kill`** | O mais simples: derrubar dependências. Suficiente para a tabela do §8 |
| **Toxiproxy** (Shopify) | Proxy que injeta latência, cortes e limites de banda via API |
| **Chaos Monkey** (Netflix) | Pioneiro: derruba instâncias aleatoriamente em produção |
| **Chaos Mesh, LitmusChaos** | Caos em Kubernetes (CNCF) |
| **Gremlin, AWS FIS** | Plataformas comerciais/gerenciadas |

## 6. Armadilhas

- **Gerador de carga e sistema na mesma máquina** competindo por CPU: os números ficam distorcidos. Descreva o ambiente e, se possível, separe.
- **Sem aquecimento:** as primeiras requisições pagam JIT, pools e caches frios.
- **Médias** em vez de percentis.
- **Cache inflando resultados:** prompts iguais em todos os VUs medem o cache, não o gateway. Separe os cenários (miss × hit exato × hit semântico).
- **O mock como gargalo:** ele precisa ser mais rápido que o gateway.
- **Limites do sistema operacional** (arquivos abertos, portas efêmeras) aparecem antes dos do app.
- **Caos sem hipótese** é só destruição.

## 7. No Portunus

- E3: um cenário simples de overhead (base para o ADR 008).
- E16: cenários para cada meta do ARQUITETURA.md §13, um experimento de caos por dependência e os números no README.

## 8. Para aprofundar

- k6 — documentação: https://grafana.com/docs/k6/latest/
- k6 — *Open and closed models*: https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/
- Gil Tene — *How NOT to Measure Latency* (palestra sobre coordinated omission, YouTube)
- Principles of Chaos Engineering: https://principlesofchaos.org/
- Toxiproxy: https://github.com/Shopify/toxiproxy
