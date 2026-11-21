# Demo do E1 num clone limpo

- Data: 2026-11-21 · macOS (Darwin 24.3) · Docker 29.7.2
- Clone: `git clone` do repositório local em diretório novo, branch `feat/mock-provider`, commit `a1d70a6`
- A porta 5432 do host já estava em uso: o primeiro `compose up` sem `POSTGRES_HOST_PORT` falhou no Postgres (o mock subiu) e foi refeito com `POSTGRES_HOST_PORT=55432`, como manda o README.
- Na véspera, três rodadas de `pnpm test:int` estouraram o prazo de 300 s no build da imagem do mock: o `pnpm install` cru levava 5,5 s, mas o download do pnpm pelo Corepack e o `pnpm deploy` ficaram parados por quase uma hora cada, com a máquina ociosa durante a noite. De manhã, com a rede normal, o mesmo Dockerfile passou em 55 s. Tratado como falha do ambiente, sem mudança no Dockerfile.

## Instalação, checagens e testes

```console
$ git log -1 --oneline
a1d70a6 docs(mock-provider): close e1 with sdk demo, readme and epic summary
exit=0
$ node -v
v22.23.5
exit=0
$ pnpm -v
12.21.0
exit=0
$ pnpm install --frozen-lockfile
+ vitest 5.0.5

Done in 1.3s using pnpm v12.21.0
exit=0
$ pnpm typecheck
apps/gateway typecheck: Done
apps/mock-provider typecheck: Done
exit=0
$ pnpm lint
$ eslint .
exit=0
$ pnpm format:check
All matched files use Prettier code style!
exit=0
$ pnpm test
   Start at  14:40:41
   Duration  2.45s (import 51%, tests 37%, transform 12%, worker 1%)

    Isolate  35 workers spawned · ~92ms startup each (spawn + environment, per file)
             at least ~369ms faster with isolate: false — reuses workers across files instead of one per file

exit=0
$ pnpm test:int

 Test Files  2 passed (2)
      Tests  2 passed (2)
   Start at  14:40:44
   Duration  49.83s (tests 99%, import 1%)

exit=0
```

```console
$ pnpm test
 Test Files  35 passed (35)
      Tests  262 passed (262)
```

## Compose `core`

```console
$ POSTGRES_HOST_PORT=55432 docker compose -f infra/docker-compose.yml --profile core up -d --wait --build
 Container portunus-mock-provider-1 Healthy 
 Container portunus-redis-1 Healthy 
 Container portunus-postgres-1 Healthy 
exit=0
$ curl -s localhost:3001/health
{"status":"ok"}
```

## Demo com o SDK oficial e `curl`

```console
$ pnpm --filter @portunus/mock-provider demo
$ node src/demo/ready-demo.mts
OpenAI SDK -> http://localhost:3001/v1
PASS  chat completion: finish_reason=stop usage={"prompt_tokens":9,"completion_tokens":16,"total_tokens":25} content="pebble willow nectar lagoon dawn timber willow river canyon flint beacon arrow nectar tundra meadow raven"
PASS  stream with usage chunk: chunks=19 finish_reason=stop final usage={"prompt_tokens":9,"completion_tokens":16,"total_tokens":25} content="pebble willow nectar lagoon dawn timber willow river canyon flint beacon arrow nectar tundra meadow raven"
PASS  embedding: dimensions=1536 norm=1.000000 usage={"prompt_tokens":2,"total_tokens":2}
PASS  429 with Retry-After: RateLimitError status=429 retry-after=4 code=rate_limit_exceeded type=requests
PASS  500: InternalServerError status=500 code=null type=server_error
PASS  503: InternalServerError status=503 code=null type=server_error
PASS  timeout: APIConnectionTimeoutError: Request timed out. after 1007 ms (client timeout 1000 ms)
PASS  stream cut: TypeError: terminated after 4 chunks (role + 3 content), no finish_reason nor [DONE]
8/8 cases as expected
exit=0
$ curl -si -H 'x-mock-scenario: error=429;retry-after=4' .../v1/chat/completions
HTTP/1.1 429 Too Many Requests
retry-after: 4
{"error":{"message":"Rate limit reached for requests (simulated by the mock scenario). Please try again in 4s.","type":"requests","param":null,"code":"rate_limit_exceeded"}}
$ curl -si '.../scenarios/error=503/v1/chat/completions'
HTTP/1.1 503 Service Unavailable
{"error":{"message":"The engine is currently overloaded, please try again later (simulated by the mock scenario).","type":"server_error","param":null,"code":null}}
$ curl -sN -H 'x-mock-scenario: error=stream-cut;cut-after=2' (stream)
data: {"id":"chatcmpl-U7ZK8wCYoekxOiNPtgreegiB","object":"chat.completion.chunk","created":1795282897,"model":"gpt-4o-mini","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-U7ZK8wCYoekxOiNPtgreegiB","object":"chat.completion.chunk","created":1795282897,"model":"gpt-4o-mini","choices":[{"index":0,"delta":{"content":"thistle"},"finish_reason":null}]}

data: {"id":"chatcmpl-U7ZK8wCYoekxOiNPtgreegiB","object":"chat.completion.chunk","created":1795282897,"model":"gpt-4o-mini","choices":[{"index":0,"delta":{"content":" ivory"},"finish_reason":null}]}

curl exit=18
$ curl -s .../v1/embeddings (dimensions=8)
{"object":"list","data":[{"object":"embedding","index":0,"embedding":[0.31049391627311707,0.031225085258483887,0.3858262002468109,-0.5640702247619629,0.16020138561725616,0.039349209517240524,-0.5268076062202454,0.3617212772369385]}],"model":"text-embedding-3-small","usage":{"prompt_tokens":2,"total_tokens":2}}
```

O `curl exit=18` no stream cortado é `CURLE_PARTIAL_FILE`: a conexão caiu antes do fim da resposta, sem `finish_reason` nem `[DONE]`, que é exatamente o `stream-cut`.
