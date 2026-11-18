# Demo do E0 num clone limpo

- Data: 2026-11-18 · macOS (Darwin 24.3) · Docker 29.7.2
- Clone: `git clone` do repositório local em diretório novo, commit `87ccf40`
- Antes do `nvm use`, o `pnpm install` com Node 24 falhou por `engineStrict` (esperado).
- A porta 5432 do host já estava em uso, então o Compose subiu com `POSTGRES_HOST_PORT=55432`.

## Instalação, checagens e testes

```console
$ git log -1 --oneline
87ccf40 docs(specs): mark e0-fundacao-do-monorepo#12 done
$ node -v
v22.23.5
$ pnpm -v
12.21.0
$ pnpm install --frozen-lockfile
+ typescript-eslint 8.72.2
+ unplugin-swc 2.0.0
+ vitest 5.0.5

Done in 730ms using pnpm v12.21.0
exit=0
$ pnpm typecheck
libs/events typecheck: Done
libs/common typecheck: Done
apps/gateway typecheck$ tsc --noEmit -p tsconfig.json
libs/database typecheck: Done
apps/gateway typecheck: Done
exit=0
$ pnpm lint
$ eslint .
exit=0
$ pnpm test
 Test Files  10 passed (10)
      Tests  48 passed (48)
   Start at  15:30:05
   Duration  1.36s (import 67%, tests 20%, transform 12%)

exit=0
$ pnpm test:int
 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  15:30:06
   Duration  2.02s (tests 86%, import 14%, transform 1%)

exit=0
```

## Compose `core`, `pnpm dev` e `curl /health`

```console
$ POSTGRES_HOST_PORT=55432 docker compose -f infra/docker-compose.yml --profile core up -d --wait
 Container portunus-demo-postgres-1 Waiting 
 Container portunus-demo-redis-1 Waiting 
 Container portunus-demo-redis-1 Healthy 
 Container portunus-demo-postgres-1 Healthy 
postgres pgvector/pgvector:0.8.7-pg18-trixie Up 5 seconds (healthy)
redis redis:8.8.4-alpine3.23 Up 5 seconds (healthy)
$ curl -i localhost:3000/health
HTTP/1.1 200 OK
x-request-id: 90bca179-cc55-4d8c-8ca2-45e4b9095c02
content-type: application/json; charset=utf-8
content-length: 15
Date: Wed, 18 Nov 2026 18:30:37 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"status":"ok"}
$ curl -i -H "x-request-id: demo-e0-123" localhost:3000/health
HTTP/1.1 200 OK
x-request-id: demo-e0-123
content-type: application/json; charset=utf-8
content-length: 15
Date: Wed, 18 Nov 2026 18:30:37 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"status":"ok"}
```

## Log do gateway (`pnpm dev`)

```json
{"level":30,"time":1795026636949,"pid":43340,"hostname":"Mac","context":"NestFactory","msg":"Starting Nest application..."}
{"level":30,"time":1795026636949,"pid":43340,"hostname":"Mac","context":"InstanceLoader","msg":"GatewayConfigModule dependencies initialized"}
{"level":30,"time":1795026636949,"pid":43340,"hostname":"Mac","context":"InstanceLoader","msg":"LoggingModule dependencies initialized"}
{"level":30,"time":1795026636949,"pid":43340,"hostname":"Mac","context":"InstanceLoader","msg":"AppModule dependencies initialized"}
{"level":30,"time":1795026636949,"pid":43340,"hostname":"Mac","context":"InstanceLoader","msg":"LoggerModule dependencies initialized"}
{"level":30,"time":1795026636951,"pid":43340,"hostname":"Mac","context":"RoutesResolver","msg":"HealthController {/health}:"}
{"level":30,"time":1795026636953,"pid":43340,"hostname":"Mac","context":"RouterExplorer","msg":"Mapped {/health, GET} route"}
{"level":30,"time":1795026636954,"pid":43340,"hostname":"Mac","context":"NestApplication","msg":"Nest application successfully started"}
{"level":30,"time":1795026637032,"pid":43340,"hostname":"Mac","req":{"method":"GET","url":"/health","headers":{"host":"localhost:3000","user-agent":"curl/8.7.1","accept":"*/*"}},"request_id":"b5030d9e-89f7-419a-9d10-d7be905119c4","res":{"statusCode":200,"headers":{"x-request-id":"b5030d9e-89f7-419a-9d10-d7be905119c4","content-type":"application/json; charset=utf-8","content-length":"15"}},"responseTime":4,"msg":"request completed"}
{"level":30,"time":1795026637037,"pid":43340,"hostname":"Mac","req":{"method":"GET","url":"/health","headers":{"host":"localhost:3000","user-agent":"curl/8.7.1","accept":"*/*"}},"request_id":"90bca179-cc55-4d8c-8ca2-45e4b9095c02","res":{"statusCode":200,"headers":{"x-request-id":"90bca179-cc55-4d8c-8ca2-45e4b9095c02","content-type":"application/json; charset=utf-8","content-length":"15"}},"responseTime":0,"msg":"request completed"}
{"level":30,"time":1795026637043,"pid":43340,"hostname":"Mac","req":{"method":"GET","url":"/health","headers":{"host":"localhost:3000","user-agent":"curl/8.7.1","accept":"*/*","x-request-id":"demo-e0-123"}},"request_id":"demo-e0-123","res":{"statusCode":200,"headers":{"x-request-id":"demo-e0-123","content-type":"application/json; charset=utf-8","content-length":"15"}},"responseTime":0,"msg":"request completed"}
{"level":30,"time":1795026637075,"pid":43340,"hostname":"Mac","context":"GracefulShutdown","msg":"Graceful shutdown started"}
{"level":30,"time":1795026637076,"pid":43340,"hostname":"Mac","context":"GracefulShutdown","msg":"Graceful shutdown completed"}
```
