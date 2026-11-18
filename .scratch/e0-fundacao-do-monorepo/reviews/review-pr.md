# PR review: feat/config-contract vs main
Veredito: CHANGES REQUESTED
O risco geral é baixo: os gates estão todos verdes e os critérios de aceite de #06–#13 estão atendidos no código. Há um Major a corrigir antes do merge. `SHUTDOWN_TIMEOUT_MS` não tem limite superior. Com um valor acima de 2³¹−1, o Node reduz o timer para 1 ms e o graceful shutdown passa a matar o processo na hora. Os Minors são, na maioria, endurecimento do contrato de configuração e lacunas de teste que só aparecem quando se olha a branch inteira.

Base: `main` (merge-base `472ad47`). Diff: `git diff main...HEAD -- . ':(exclude).scratch'`, com 20 commits e 79 arquivos (+2702/−132; 1136 linhas são do lockfile). Não há PR aberto, então não houve discussão de PR para considerar.

## Gates
| Gate | Resultado |
|---|---|
| typecheck | ✔ no Node 22 (`nvm use`). No Node 24 do shell, o `engine-strict` aborta, o que é o comportamento esperado |
| lint | ✔ |
| format | ✔ |
| testes unitários | ✔ 48/48 (10 arquivos), sem cobertura medida |
| testes de integração | ✔ 1/1 (Testcontainers) |
| mutação | não rodou: não é modo thorough |
| auditoria de dependências | 4 high em `fastify@5.11.3` (corrigido em 5.12.2), via `@nestjs/platform-fastify`. **Já existia na main** (mesma versão no lockfile da main) |
| secrets | não rodou: gitleaks/betterleaks não instalados (`brew install gitleaks`) |
| SAST (Semgrep) | não rodou: semgrep não instalado (`brew install semgrep`) |
| duplicação | não rodou: jscpd não instalado |
| falhas pré-existentes | advisories do fastify (acima), que não contam como finding |

## Resumo
Blocker 0 · Major 1 · Minor 12 · Nit 0 (refutados e descartados: 0)
Por lente: correctness/reliability 1M + 4m · security/api-contract 2m · tests/spec/maintainability 6m. Duplicatas entre lentes foram mescladas: M1 apareceu em 2 lentes, m3 em 2 e m2 em 2.

## Blockers
Nenhum.

## Majors

### [M1] `SHUTDOWN_TIMEOUT_MS` sem limite superior: valores grandes forçam saída imediata
- Severity: Major · Confidence: high · Status: CONFIRMED (reproduzido)
- Lens: correctness/reliability · Ref: CWE-1284, CWE-20
- Where: apps/gateway/src/gateway-config.schema.ts:26
  apps/gateway/src/graceful-shutdown.ts:32-34
- Scenario:
  - O operador define `SHUTDOWN_TIMEOUT_MS=3000000000`, ou erra a unidade.
  - O schema aceita, porque só exige `.int().positive()`, e o app sobe normalmente.
  - No primeiro SIGTERM, o `setTimeout` estoura: o Node emite `TimeoutOverflowWarning` e usa 1 ms.
  - `forceExit()` chama `process.exit(1)` com requisições ainda em andamento.
  - O resultado é o oposto do que a configuração promete. Também quebra a promessa de "config inválida não sobe", porque o erro só aparece no desligamento.
- Evidence:
  ```
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(DEFAULT_SHUTDOWN_TIMEOUT_MS),
  this.deadline = setTimeout(() => { this.forceExit(); }, this.config.SHUTDOWN_TIMEOUT_MS).unref();
  ```
  Reprodução no Node 22: `setTimeout(..., 3000000000)` → `TimeoutOverflowWarning ... Timeout duration was set to 1.` → `fired after 1 ms`.
- Fix direction: `.max(MAX_SHUTDOWN_TIMEOUT_MS)` no schema, com uma constante nomeada. O teto técnico é 2_147_483_647; um teto de negócio, como alguns minutos, faz mais sentido, porque orquestradores matam o processo bem antes disso (o padrão do k8s é 30 s).
- Regression test: em `gateway-config.spec.ts`, acrescentar `['SHUTDOWN_TIMEOUT_MS', '2147483648']` à tabela "refuses to build" e esperar `ConfigValidationError`.

## Minors

### [m1] `z.coerce.number()` aceita hex, notação científica e espaços em PORT e SHUTDOWN_TIMEOUT_MS
- Severity: Minor · Confidence: high · Status: PLAUSIBLE
- Lens: correctness
- Where: apps/gateway/src/gateway-config.schema.ts:23 e 26
- Scenario: `PORT=0x1F90` vira 8080, `PORT=1e3` vira 1000 e `PORT=" 80 "` vira 80 (`Number(...)`, verificado). Um valor colado errado não falha rápido. Os testes cobrem só `abc`, `''` e `8080.5`.
- Evidence: `PORT: z.coerce.number().int().min(MIN_TCP_PORT).max(MAX_TCP_PORT)...`
- Fix direction: validar a string com `/^\d+$/` antes de converter, num helper compartilhado (por exemplo `integerFromEnv`) em `libs/common`.
- Regression test: as linhas `['PORT','0x50']`, `['PORT','1e3']` e `['PORT',' 80']` na tabela de inválidos.

### [m2] `NODE_ENV` tem default `development` (fail-open), e `pino-pretty` é só devDependency
- Severity: Minor · Confidence: medium · Status: PLAUSIBLE
- Lens: reliability/security
- Where: apps/gateway/src/gateway-config.schema.ts:10, 21 e 28
  apps/gateway/src/log-destination.ts:15
- Scenario:
  - Uma imagem de produção é instalada com `--prod` e sobe sem `NODE_ENV`, que então assume `development`.
  - Com isso, o `refine` que proíbe `LOG_PRETTY=true` em produção nunca dispara.
  - `await import('pino-pretty')` lança `MODULE_NOT_FOUND`. Como não é um `ConfigValidationError`, o erro sai como rejeição não tratada com stack cru.
  - Além disso, esquecer o `NODE_ENV` liga em silêncio os defaults de desenvolvimento.
- Evidence: `const DEFAULT_NODE_ENVIRONMENT = 'development';` e `const { prettyFactory } = await import('pino-pretty');`
- Fix direction: tornar `NODE_ENV` obrigatório, ou traduzir a falha do import em erro de configuração legível. Decidir conscientemente onde `pino-pretty` fica.
- Regression test: um teste de `resolveLogDestination` com o import simulado rejeitando.

### [m3] A config é `Readonly` só no tipo e continua mutável em runtime
- Severity: Minor · Confidence: high · Status: PLAUSIBLE
- Lens: correctness/maintainability
- Where: libs/common/src/config/config-class.ts:13
- Scenario: `GatewayConfig` é um singleton injetado. Um consumidor que use cast ou JS altera `PORT` ou `LOG_LEVEL` para todos os módulos. A garantia de "parse, don't validate" passa a depender de convenção.
- Evidence: `Object.assign(this, loadConfig(schema, environment));`
- Fix direction: chamar `Object.freeze(this)` no construtor.
- Regression test: um spec do `configClass` em que atribuir a uma propriedade lança `TypeError`.

### [m4] `pnpm dev` não recompila as libs depois do primeiro build
- Severity: Minor · Confidence: medium · Status: PLAUSIBLE
- Lens: reliability
- Where: apps/gateway/package.json (script `dev`)
  libs/common/package.json (`exports`)
- Scenario:
  - Em runtime, `@portunus/common` resolve para `dist` pela condição `default`. Uma edição em `libs/common` com o watch ativo não tem efeito até reiniciar.
  - O Vitest resolve `src` pela condição `@portunus/source`. Os testes passam enquanto o app em execução está desatualizado.
  - O problema piora quando events, database e telemetry ganharem código.
- Evidence: `"dev": "pnpm --filter \"@portunus/gateway^...\" build && nest start --watch ..."`
- Fix direction: rodar `tsc -b -w` das libs em paralelo, ou usar `--conditions=@portunus/source` com um loader TS no dev.

### [m5] Ainda não há fronteira de erro no formato OpenAI (invariante 10)
- Severity: Minor · Confidence: medium · Status: PLAUSIBLE
- Lens: api-contract · Ref: CLAUDE.md invariante 10
- Where: apps/gateway/src/app.factory.ts:25-31
- Scenario: `GET /nope` devolve o formato padrão do Nest (`{"statusCode":404,"message":"Cannot GET /nope",...}`), e um JSON malformado devolve o formato padrão do Fastify. Hoje só existe `/health`, então o impacto é baixo. Se isso estiver deliberadamente adiado para outro épico, registrar na spec.
- Fix direction: um filtro global junto com `setNotFoundHandler` que produza `{error:{message,type,param,code}}`, antes da primeira rota pública.

### [m6] O CI não tem gate de auditoria de dependências
- Severity: Minor · Confidence: medium · Status: PLAUSIBLE
- Lens: security · Ref: A03:2025
- Where: .github/workflows/ci.yml:33-38
- Scenario: os 4 advisories high do fastify já entraram na main sem alarme. A branch adiciona cerca de 8 pacotes, alguns de runtime.
- Fix direction: um passo `pnpm audit --prod --audit-level=high`, ou um job agendado. Atualizar o fastify para 5.12.2, ou registrar um ignore explícito.

### [m7] `.env.example` não está amarrado ao schema (#07, CA "todas as variáveis aceitas")
- Severity: Minor · Confidence: high · Status: PLAUSIBLE
- Lens: spec/tests
- Where: apps/gateway/.env.example:1-6
  apps/gateway/src/gateway-config.schema.ts:19-27
- Scenario: a próxima variável (no E2) entra no schema e fica fora do exemplo sem nada falhar. O README manda copiar esse arquivo.
- Fix direction: um spec que lê o `.env.example` (com `util.parseEnv`), compara as chaves com as do schema e passa o resultado pelo `loadConfig`.

### [m8] Os testes de tabela do schema sobem Nest e Fastify inteiros a cada caso válido
- Severity: Minor · Confidence: high · Status: PLAUSIBLE
- Lens: tests
- Where: apps/gateway/src/gateway-config.spec.ts:57 e 87-108
- Scenario: cada linha válida chama `createApp(...)` só para comparar valores parseados. Os testes ficam lentos, e as falhas aparecem como erro de boot em vez de erro de config.
- Fix direction: testar `new GatewayConfig(env)` ou o schema diretamente. Manter 1–2 casos via `createApp` para provar a DI e os metadados do SWC.

### [m9] O comportamento de `@portunus/common` só é testado através do gateway
- Severity: Minor · Confidence: high · Status: PLAUSIBLE
- Lens: tests
- Where: libs/common/src/config/load-config.spec.ts:1-18
- Scenario:
  - O formato `variável → motivo`, a regra de não ecoar valores (segredos) e o próprio `configClass` só são verificados em `apps/gateway`.
  - O próximo app a usar a lib (consumers, no E11) depende de comportamento que a lib não testa.
- Fix direction: `config-validation-error.spec.ts` e `config-class.spec.ts` dentro da lib.

### [m10] O helper de teste entra no build de produção
- Severity: Minor · Confidence: high · Status: PLAUSIBLE
- Lens: maintainability
- Where: apps/gateway/tsconfig.build.json:8
  apps/gateway/src/testing/memory-log-destination.ts
- Scenario: o `exclude` cobre só `src/**/*.spec.ts`, então `src/testing/` vai para `dist/`.
- Evidence: `"exclude": ["node_modules", "dist", "src/**/*.spec.ts"]`
- Fix direction: acrescentar `src/testing/**` ao `exclude`.

### [m11] O CA "referência circular falha o build" (#06, ADR 011) não tem verificação executável
- Severity: Minor · Confidence: medium · Status: PLAUSIBLE
- Lens: spec
- Where: docs/adr/011-resolucao-de-pacotes-do-workspace.md:49
- Scenario: o ADR só afirma que o TS6202 pega o ciclo, e o CA está marcado `[x]` sem evidência registrada.
- Fix direction: registrar no ticket o experimento manual (criar o ciclo, ver o TS6202, reverter).

### [m12] #13: o CA "saída registrada no PR" está marcado mas ainda não pode estar cumprido
- Severity: Minor · Confidence: high · Status: PLAUSIBLE
- Lens: spec
- Where: docs/specs/e0-fundacao-do-monorepo/tickets/13-fechamento-do-epico.md:11
- Scenario: não existe PR. A demo está em `.scratch/e0-fundacao-do-monorepo/demo-clone-limpo.md`.
- Fix direction: colar a saída da demo na descrição do PR ao abri-lo, ou reescrever o CA.

## Nits
Nenhum.

## Não verificado / perguntas em aberto
- Gates não rodados: gitleaks, semgrep e jscpd (não instalados), cobertura (não pedida) e mutação (não é modo thorough).
- A refutação foi feita pelo orquestrador, sem subagente: só havia um Major, e ele foi reproduzido diretamente no Node 22.
- `x-request-id` enviado pelo cliente é aceito e ecoado (charset seguro, 128 caracteres) e pode colidir com o de outra requisição. Isso se sobrepõe ao #09 m3 já reportado.
- Não há `trustProxy`, `bodyLimit` nem `requestTimeout` configurados. O body padrão de 1 MiB pode ser pequeno para prompts. É escopo de épicos futuros.
- `/health` continua respondendo 200 durante o shutdown (não há sinal de readiness). Fica para um ticket futuro.
- Se o `listen` falhar (por exemplo com EADDRINUSE), o erro é relançado sem fechar o app. O exit 1 padrão é aceitável.
- Não foi verificado se `no-restricted-properties` pega `const { env } = process`.
- Não foi confirmado que builds Docker e de produção resolvem sempre a condição `default` (`dist`) e nunca `@portunus/source`.
- A precisão do log da demo não foi conferida.

## Resolução
- M1: fixed em e2793f3. Teto `MAX_SHUTDOWN_TIMEOUT_MS = 300_000` (5 min). Testes: `300000` aceito, `300001` recusado (RED → GREEN).
- m1: fixed em e2793f3. `integerFromEnv` em `@portunus/common` (regex `^-?\d+$`), usado em PORT e SHUTDOWN_TIMEOUT_MS. Testes na lib (`0x50`, `1e3`, `' 80 '`, `''`) + ligação no gateway (`PORT=0x1F90`, `SHUTDOWN_TIMEOUT_MS=1e3`).
- m3: fixed em e2793f3. `Object.freeze(this)` no `configClass`. Teste: atribuição lança `TypeError`.
- Verificação: typecheck ✔ · lint ✔ · format ✔ · unit 61/61 ✔ · int 1/1 ✔ · build ✔ · app subiu, `/health` → `{"status":"ok"}`, SIGTERM limpo; `PORT=0x1F90` e `SHUTDOWN_TIMEOUT_MS=3000000000` recusados na inicialização.
- Demais Minors (m2, m4–m6, m8, m9, m11): em aberto, decisão do usuário.
- m10: fixed em 1b226d3. `src/testing/**` excluído do `tsconfig.build.json`; build limpo não gera mais `dist/testing`.
- m7: fixed em ccaf628. Spec compara as chaves do `.env.example` com `gatewayConfigSchema.shape` e valida os valores com `GatewayConfig`. Verde de primeira (guarda contra drift, sem bug atual).
- m12: fixed na abertura do PR. A saída da demo num clone limpo foi colada na descrição.
