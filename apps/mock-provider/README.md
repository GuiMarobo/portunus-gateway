# @portunus/mock-provider

Servidor HTTP que imita a API da OpenAI, com respostas determinísticas e falhas sob demanda. É o "provedor" de desenvolvimento, testes e carga do Portunus (invariante 4, **mock primeiro**): o SDK oficial da OpenAI fala com ele trocando só `baseURL` e `apiKey`, sem saber que é falso.

Rotas:

| Rota                        | O que faz                                                       |
| --------------------------- | --------------------------------------------------------------- |
| `POST /v1/chat/completions` | Chat normal ou em streaming SSE (`stream: true`)                |
| `POST /v1/embeddings`       | Vetores determinísticos de norma 1, em `float` ou `base64`      |
| `GET /health`               | Liveness (`{"status":"ok"}`), usado pelo healthcheck do Compose |
| `/scenarios/{cenário}/v1/…` | As mesmas rotas `/v1`, com o cenário no caminho (ver abaixo)    |

Toda rota `/v1` exige `Authorization: Bearer <qualquer token não vazio>` (o esquema aceita qualquer caixa); o valor não é validado. Sem o header, a resposta é `401 invalid_api_key`. Erros saem sempre no formato da OpenAI (`{"error":{"message","type","param","code"}}`). O corpo é só JSON, até 8 MiB (`413` acima, `415` com outro `content-type`); em embeddings, `input` aceita até 2048 itens, sem string vazia. Toda resposta traz `x-request-id` (`req_` + 32 hex).

## Como rodar

**No Compose** (perfil `core`, junto do Postgres e do Redis), na porta `3001` do host:

```bash
docker compose -f infra/docker-compose.yml --profile core up -d --wait
docker compose -f infra/docker-compose.yml --profile core up -d --wait --build   # depois de mudar o código do mock
MOCK_HOST_PORT=3101 docker compose -f infra/docker-compose.yml --profile core up -d --wait   # se 3001 estiver ocupada
```

**No host**, para iterar sem reconstruir a imagem (compila com `tsc -b` em watch e reinicia com `node --watch`):

```bash
cp apps/mock-provider/.env.example apps/mock-provider/.env   # opcional: sem .env valem os padrões
pnpm --filter @portunus/mock-provider dev
```

**Demo do critério de pronto** (SDK oficial contra um mock de pé; imprime `PASS`/`FAIL` por caso e sai com código `1` se algum falhar). Roda o TypeScript direto com o _type stripping_ do Node, ligado por padrão a partir do **Node 22.18** (`nvm install` instala a última 22):

```bash
pnpm --filter @portunus/mock-provider demo                              # http://localhost:3001/v1
pnpm --filter @portunus/mock-provider demo http://localhost:3101/v1     # outra URL base
```

## Variáveis de ambiente

Validadas com Zod na subida (`loadConfig` de `@portunus/common`). Inválidas, o processo sai com código `1` listando os campos, sem ecoar os valores. A lista completa está em [.env.example](./.env.example).

| Variável                           | Padrão             | Efeito                                                                                         |
| ---------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `NODE_ENV`                         | `development`      | `development`, `test` ou `production`                                                          |
| `HOST` / `PORT`                    | `0.0.0.0` / `3001` | Endereço de escuta. A porta difere da do gateway (`3000`) para os dois rodarem juntos          |
| `LOG_LEVEL`                        | `info`             | Nível do pino (`silent` desliga o log por requisição em testes de carga)                       |
| `LOG_PRETTY`                       | `false`            | Log legível no terminal; recusado em `production`                                              |
| `MOCK_DEFAULT_SCENARIO`            | vazio              | Cenário da instância (vazio = resposta normal e imediata; `error=stream-cut` é recusado)       |
| `MOCK_MAX_DELAY_MS`                | `30000`            | Teto de qualquer espera (`latency`, `ttfb`, `chunk-delay`) e duração do `timeout`              |
| `MOCK_DEFAULT_COMPLETION_TOKENS`   | `16`               | Tamanho da resposta quando o cenário não traz `tokens` (o `max_tokens` da requisição só corta) |
| `MOCK_DEFAULT_RETRY_AFTER_SECONDS` | `1`                | `Retry-After` do `429` quando o cenário não traz `retry-after`                                 |
| `MOCK_EMBEDDING_DIMENSIONS`        | `1536`             | Dimensões do vetor sem `dimensions` na requisição (tamanho do `text-embedding-3-small`)        |
| `MOCK_MAX_EMBEDDING_DIMENSIONS`    | `3072`             | Teto de `dimensions` aceito na requisição                                                      |
| `SHUTDOWN_TIMEOUT_MS`              | `8000`             | Prazo do graceful shutdown; estourado, o processo sai com código `1`                           |

## Cenário: como mandar o mock se comportar mal

Um cenário é uma lista de pares `chave=valor` separados por `;`. O mock não guarda estado entre requisições: cada chamada traz o seu cenário, e testes em paralelo não interferem entre si.

| Chave         | Valor                                        | Efeito                                                                                                                         |
| ------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `latency`     | `N` ou `MIN-MAX` (ms)                        | Espera antes da resposta (ou antes dos headers, em stream). Intervalo = sorteio uniforme                                       |
| `ttfb`        | `N` ou `MIN-MAX` (ms)                        | Só em stream: espera entre os headers `200` e o primeiro chunk                                                                 |
| `chunk-delay` | `N` (ms)                                     | Só em stream: intervalo entre chunks                                                                                           |
| `tokens`      | `N` (até 4096)                               | Tamanho da resposta em tokens (também em stream), no lugar de `MOCK_DEFAULT_COMPLETION_TOKENS`; `max_tokens` menor ainda corta |
| `error`       | `429`, `500`, `503`, `timeout`, `stream-cut` | Falha a simular                                                                                                                |
| `error-rate`  | `0` a `1`                                    | Probabilidade de aplicar o `error` (padrão `1`)                                                                                |
| `retry-after` | `N` (s, até 3600)                            | Header `Retry-After` do `429`                                                                                                  |
| `cut-after`   | `N` (chunks)                                 | Com `stream-cut`: quantos chunks de conteúdo saem antes do corte (padrão `0`)                                                  |
| `seed`        | inteiro de `0` a `2³²−1`                     | Semente dos sorteios desta requisição: `latency` e `ttfb` em intervalo e `error-rate`                                          |

O que cada falha faz:

- **`429`:** status `429`, header `Retry-After` e `code: "rate_limit_exceeded"`, `type: "requests"`.
- **`500` / `503`:** o status, com `type: "server_error"`.
- **`timeout`:** lê a requisição e não responde nada; fecha a conexão ao atingir `MOCK_MAX_DELAY_MS`. Se o cliente desistir antes, o timer é liberado.
- **`stream-cut`:** só com `stream: true` (sem stream, `400`). Envia `200`, o chunk de `role`, `cut-after` chunks de conteúdo e **destrói o socket**: sem `finish_reason` e sem `[DONE]`. É a queda real de um provedor, não um fim limpo.
- Em stream, `429`, `500`, `503` e `timeout` acontecem **antes dos headers**; só `stream-cut` acontece depois do primeiro byte.

**Origens e precedência:** header `x-mock-scenario` > prefixo de caminho `/scenarios/{cenário}/v1` > `MOCK_DEFAULT_SCENARIO`. A precedência é do cenário inteiro, não chave a chave. No caminho, `;` e `=` podem ir crus ou escapados (`%3B`, `%3D`), até 1024 caracteres. Chave desconhecida, valor inválido, intervalo invertido ou valor acima do teto → `400` com `param` = `x-mock-scenario` ou `/scenarios/{scenario}`.

### Exemplos com `curl`

```bash
AUTH='authorization: Bearer demo'
BODY='{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello!"}]}'

curl -s localhost:3001/v1/chat/completions -H "$AUTH" -H 'content-type: application/json' -d "$BODY"

curl -i localhost:3001/v1/chat/completions -H "$AUTH" -H 'content-type: application/json' \
  -H 'x-mock-scenario: error=429;retry-after=4' -d "$BODY"

curl -i 'localhost:3001/scenarios/error=503/v1/chat/completions' -H "$AUTH" -H 'content-type: application/json' -d "$BODY"

curl -N localhost:3001/v1/chat/completions -H "$AUTH" -H 'content-type: application/json' \
  -H 'x-mock-scenario: chunk-delay=200' \
  -d '{"model":"gpt-4o-mini","stream":true,"stream_options":{"include_usage":true},"messages":[{"role":"user","content":"Hello!"}]}'

curl -N localhost:3001/v1/chat/completions -H "$AUTH" -H 'content-type: application/json' \
  -H 'x-mock-scenario: error=stream-cut;cut-after=3' \
  -d '{"model":"gpt-4o-mini","stream":true,"messages":[{"role":"user","content":"Hello!"}]}'

curl -s localhost:3001/v1/embeddings -H "$AUTH" -H 'content-type: application/json' \
  -d '{"model":"text-embedding-3-small","input":"Hello!","dimensions":8}'
```

### Exemplo com o SDK oficial

```ts
import OpenAI from 'openai';

const client = new OpenAI({ baseURL: 'http://localhost:3001/v1', apiKey: 'demo', maxRetries: 0 });

await client.chat.completions.create(
  { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Hello!' }] },
  { headers: { 'x-mock-scenario': 'latency=200-400;error=500;error-rate=0.3;seed=7' } },
);

const providerB = new OpenAI({
  baseURL: 'http://localhost:3001/scenarios/error=503/v1',
  apiKey: 'demo',
  maxRetries: 0,
});
```

Use `maxRetries: 0`: o SDK refaz sozinho `429` e `5xx` (2 vezes por padrão, respeitando `Retry-After`), o que deixa os testes lentos e esconde a falha que se queria ver. O prefixo de caminho existe para o gateway enxergar "provedores" diferentes num mesmo processo de mock, trocando só a URL base.

## Determinismo e regra de tokens

A mesma requisição gera sempre o mesmo conteúdo, os mesmos tokens e o mesmo vetor. A chave é o SHA-256 de uma forma canônica (chaves ordenadas) de `model`, `messages` e do limite de tokens; campos ignorados (`temperature`, `user`…) e o cenário não entram, então a resposta com latência é igual à normal. O texto vem de um vocabulário fixo sorteado por um PRNG semeado pelo hash: o mock **nunca ecoa o prompt**. `id` e `created` não entram na garantia.

| Uso            | Regra                                                                    |
| -------------- | ------------------------------------------------------------------------ |
| **completion** | 1 palavra gerada = 1 token = 1 chunk de stream                           |
| **prompt**     | soma, por mensagem, de `ceil(caracteres / 4)` + 3 tokens fixos           |
| **embeddings** | soma de `ceil(caracteres / 4)` sobre os itens de `input`, sem custo fixo |

Exemplo: `"Hello, mock provider!"` tem 21 caracteres → `ceil(21 / 4) + 3 = 9` tokens de prompt. É a aproximação clássica de 4 caracteres por token, sem tokenizer real; serve para os testes de custo serem previsíveis, não para imitar a contagem da OpenAI.

No stream, o chunk de `usage` (com `choices: []`) só sai quando a requisição pede `stream_options.include_usage`, como na OpenAI. `n > 1` é recusado com `400`.

## Por que Fastify puro, sem Nest

O gateway é Nest + Fastify; o mock é **Fastify puro**. Ele é ferramenta de teste, sem regra de negócio a organizar em camadas nem dependências de infraestrutura para injetar, então a DI e os módulos do Nest não pagariam o custo. Duas razões concretas:

- **O mock não pode ser o gargalo** dos testes de carga: menos camadas por requisição, e o custo de uma requisição no mock serve de linha de base para o ADR 008.
- **Controle da resposta crua:** cortar o stream destruindo o socket, segurar a conexão no `timeout` e respeitar backpressure no SSE exigem chegar ao `reply.raw`; no Nest, isso desceria para o Fastify de qualquer jeito.

A separação de responsabilidades segue a do gateway sem as pastas de Clean Architecture: núcleo puro (cenário, tokens, hash, vetores, montagem de respostas) testado direto, borda HTTP (rotas, esperas, SSE) testada pelo app escutando numa porta efêmera, e montagem (`createMockApp`) separada da escuta (`main.ts`).
