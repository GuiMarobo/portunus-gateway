# Review do PR: feat/mock-provider vs origin/main (52a2e08)

Veredito: APPROVE WITH NOTES

O épico E1 está sólido no conjunto. Os gates estão verdes, os critérios de aceite da spec têm código e teste, e o shutdown, o SSE e a precedência de cenários se comportam como a spec descreve. Não sobrou Blocker nem Major depois da refutação. Os dois pontos mais úteis são:

- `stream-cut` usado como cenário padrão de ambiente derruba todo o tráfego sem stream (m1).
- Atualizar o `fastify` 5.11.3, que tem advisories altos, mesmo sem nenhum ser alcançável no mock (m2).

Base: `origin/main` (52a2e08). O `main` local está desatualizado (472ad47) e incluiria o E0 no diff. São 30 commits e 87 arquivos, com cerca de 2000 linhas de produção (sem testes, docs e lockfile). `.scratch/` ficou fora do diff.

## Gates

| Gate | Resultado |
|---|---|
| typecheck | ✔ |
| lint | ✔ |
| format:check | ✔ |
| testes unitários | ✔ 266 passaram (36 arquivos) · cobertura não coletada |
| test:int (Testcontainers) | ✔ 2 passaram (imagem do mock e Postgres) |
| mutação | não rodou (só no modo thorough; Stryker não instalado) |
| audit de dependências | ✖ `fastify@5.11.3`: 4 high e 3 moderate (corrigidos em ≥5.12.5) · `ajv <8.18` moderate (transitiva); ver m2 |
| secrets | não rodou: gitleaks não instalado (`brew install gitleaks`). `infra/.env` tem só tags de imagem |
| SAST (Semgrep) | não rodou: semgrep não instalado (`brew install semgrep`) |
| falhas pré-existentes | o `fastify@5.11.3` do gateway (via `@nestjs/platform-fastify`) já existia antes do branch e não entra como achado |

## Resumo

Blocker 0 · Major 0 · Minor 8 · Nit 3 (refutados e descartados: 5)

Por lente: correctness 1 · security 1 · reliability 2 · api-contract 1 · spec 1 · tests 1 · maintainability 1 · nits 3

## Minors

### [m1] `error=stream-cut` em `MOCK_DEFAULT_SCENARIO` faz falhar todo o tráfego sem stream e todas as embeddings
- Severidade: Minor · Confiança: high · Status: CONFIRMED
- Lente: correctness / spec
- Onde: apps/mock-provider/src/scenario/scenario-pre-handler.ts:76-79 (embeddings entram por `applyWithoutStreaming`)
- Cenário: o operador sobe o mock "já instável" (história 37) com `MOCK_DEFAULT_SCENARIO="error=stream-cut;error-rate=0.1"` e tráfego misto.
  - A checagem de stream roda antes do sorteio da taxa.
  - Com isso, 100% das chamadas sem stream e de `/v1/embeddings` recebem `400`, e não ~0%.
  - A review 07 m3 já tinha aceitado o `400` como "erro de configuração" no nível da requisição. Como padrão da instância, porém, o erro só aparece em tempo de execução, em todas as chamadas, e não na subida.
- Evidência: `if (scenario.failure?.kind === 'stream-cut' && !isStreaming(request)) { await sendStreamCutWithoutStream(reply);`
- Direção da correção: há duas saídas, e a escolha deve ser registrada na spec.
  - Recusar `stream-cut` no `MOCK_DEFAULT_SCENARIO` na validação da config, para que o app nem suba.
  - Ou tratar `stream-cut` como no-op em requisições sem stream quando o cenário vem do ambiente.
- Teste de regressão: `startMock({ MOCK_DEFAULT_SCENARIO: 'error=stream-cut' })` deve falhar na construção, ou então chat sem stream e embedding devem responder `200`.

### [m2] O branch fixa `fastify@5.11.3`, que tem advisories altos
- Severidade: Minor · Confiança: high · Status: CONFIRMED
- Lente: security · Ref: GHSA (fastify <5.12.2 / <5.12.5)
- Onde: apps/mock-provider/package.json (`"fastify": "5.11.3"`)
- Cenário: hoje nenhum advisory é alcançável no mock.
  - O mock não usa JSON schema do Fastify: a validação é Zod dentro dos handlers.
  - O único not-found handler é o da raiz, sem encapsulamento.
  - A autenticação só checa se o token existe.
  - O risco real é o `pnpm audit` acusar `high` e quebrar um futuro gate de CI, além de herdar a versão vulnerável se o mock passar a usar schemas.
- Direção da correção: subir o mock para `fastify@>=5.12.5`. Abrir um ticket à parte para o gateway (`@nestjs/platform-fastify`).
- Teste de regressão: um `pnpm audit --prod --audit-level=high` no CI.

### [m3] `input` de embeddings sem teto de itens, o que trava o event loop
- Severidade: Minor · Confiança: high · Status: CONFIRMED
- Lente: reliability / performance / api-contract
- Onde: apps/mock-provider/src/embeddings/embeddings.route.ts:14 · apps/mock-provider/src/embeddings/embedding-list.ts:38-41
- Cenário: o limite padrão de 1 MiB do corpo comporta cerca de 250 mil strings curtas.
  - Cada string custa `dimensions` iterações do PRNG (até 3072), tudo síncrono.
  - Uma única requisição grande trava o processo por segundos.
  - Os timers de `latency`/`timeout` das outras requisições atrasam, e o gateway em teste vê timeouts falsos.
  - A OpenAI recusa com `400` acima de 2048 itens e também string vazia, então hoje o mock aceita o que a OpenAI recusa: falso verde em testes de lote.
- Evidência: `input: z.union([z.string(), z.array(z.string()).min(1)]),`
- Direção da correção: `.max(MAX_EMBEDDING_INPUTS)` (2048) e `min(1)` nas strings, com `400` e `param: 'input'`.
- Teste de regressão: POST com 2049 itens → `400` com `param: "input"`.

### [m4] Possível `MaxListenersExceededWarning` com mais de 10 esperas simultâneas
- Severidade: Minor · Confiança: medium · Status: PLAUSIBLE (depende do limite do EventTarget no Node 22)
- Lente: reliability
- Onde: apps/mock-provider/src/scenario/wait-unless-closed.ts:29 · apps/mock-provider/src/chat/server-sent-events.ts:94 · signal criado em apps/mock-provider/src/graceful-shutdown.ts:16
- Cenário: cada espera pendente (`latency`, `ttfb`, chunk, `timeout`, drain) registra um listener de `abort` no mesmo `AbortSignal` de shutdown.
  - Um k6 com mais de 10 VUs e `latency=...` deve imprimir o aviso de vazamento no stderr.
  - Nada quebra, mas o aviso confunde quem estiver investigando a carga.
- Evidência: `shutdown.addEventListener('abort', dropConnection, { once: true });`
- Direção da correção: `events.setMaxListeners(0, shutdown.signal)` onde o `AbortController` é criado.
- Teste de regressão: 11 requisições simultâneas com `latency=200` e nenhum `process.on('warning')`.

### [m5] Todo erro 4xx do Fastify vira "não foi possível ler o corpo", inclusive o 413
- Severidade: Minor · Confiança: medium · Status: PLAUSIBLE
- Lente: api-contract
- Onde: apps/mock-provider/src/errors/openai-error-handlers.ts:23-30 · sem `bodyLimit` em apps/mock-provider/src/mock-app.factory.ts
- Cenário: um teste do gateway com prompt de 2 MB recebe do mock um `413` com a mesma mensagem e o mesmo `code: null` de um JSON malformado.
  - A OpenAI aceitaria esse corpo.
  - O teste não consegue distinguir os dois casos.
- Direção da correção: subir o `bodyLimit` para algo próximo do da OpenAI e mapear a mensagem por status (413, 415, JSON inválido).
- Teste de regressão: corpo de 2 MB → `200`; `content-type` errado → `415` com mensagem própria.

### [m6] A spec cita uma contagem de testes desatualizada
- Severidade: Minor · Confiança: high · Status: CONFIRMED
- Lente: spec
- Onde: docs/specs/e1-provedor-mock/spec.md:330
- Cenário: o fechamento diz "262 unitários", mas o branch roda 266, porque o fix af62c6d adicionou testes depois. Isso contraria a regra da história 56 de que a documentação não pode mentir.
- Direção da correção: atualizar o número, ou trocá-lo pelo comando `pnpm test`.

### [m7] A demo do ticket 11 é frágil e nenhum CI a roda
- Severidade: Minor · Confiança: medium · Status: PLAUSIBLE
- Lente: tests
- Onde: apps/mock-provider/src/demo/ready-demo.mts:19-20 · apps/mock-provider/package.json:17 · package.json:5
- Cenário: há dois problemas.
  - A demo confere o corte do stream pela mensagem interna do undici (`'terminated'`). Uma mudança de texto no Node faz a demo acusar falha num mock correto.
  - `node src/demo/ready-demo.mts` depende do type stripping sem flag, que só existe a partir do Node 22.18. Os `engines` aceitam `>=22 <23`.
- Evidência: `const CUT_ERROR_MESSAGE = 'terminated';` · `"demo": "node src/demo/ready-demo.mts"`
- Direção da correção: verificar "o stream falhou depois de N chunks, sem `[DONE]`" em vez de comparar o texto do erro. Fixar `engines.node` em `>=22.18 <23`.

### [m8] Canal lateral oculto entre o pre-handler de cenário e as rotas
- Severidade: Minor · Confiança: medium · Status: CONFIRMED
- Lente: maintainability
- Onde: apps/mock-provider/src/scenario/scenario-pre-handler.ts:68-69, 112-115 · consumido em apps/mock-provider/src/chat/chat-completions.route.ts:62, 71
- Cenário: o plano de stream e os tokens passam por `WeakMap`s do pre-handler para a rota.
  - Uma rota nova que esqueça `preHandler: scenario.apply` recebe em silêncio `IMMEDIATE_STREAM` e os tokens padrão, sem nenhum erro.
  - `apply` e `applyWithoutStreaming` são quase idênticos.
- Evidência: `streamPlanOf: (request) => streamPlanByRequest.get(request) ?? IMMEDIATE_STREAM,`
- Direção da correção: usar `decorateRequest` tipado, ou fazer o handler chamar explicitamente uma função que devolve o plano. A falta do plano deve lançar erro, não cair no padrão.

## Nits

- [n1] apps/mock-provider/src/errors/bearer-authorization.ts:28-29: o esquema `Bearer` é comparado com distinção de maiúsculas. `bearer x` recebe `401`, mas esquemas de autenticação HTTP não distinguem maiúsculas.
- [n2] apps/mock-provider/src/request-logging.ts:11: o redact cobre só `authorization`, mas o serializer registra todos os headers (`x-api-key` e `cookie` iriam para o log).
- [n3] As respostas do mock não trazem `x-request-id`, e o `429` não traz `x-ratelimit-*`. Isso não permite testar se o gateway propaga o id do provedor (vale como ticket futuro, junto do E3).

## Refutados (5, não listados em detalhe)

- `content` só como string: Major descartado. É um adiamento registrado em spec.md:348/362 (review 02 m1).
- `n > 1` recusado: está fora de escopo na spec (spec.md:188/274).
- Arrays de tokens em embeddings: a história 42 pede só string ou lista de strings.
- O header sobrescreve o caminho sem mesclar: a precedência é por cenário inteiro, conforme spec.md:164.
- Header vazio apaga o cenário de ambiente: já reportado (review 05 m1) e adiado em spec.md:364.

## Não verificado / perguntas em aberto

- Lentes rodadas em 3 grupos com Sonnet. Só leram o código, sem executar nada.
- Cobertura e mutação não foram coletadas: os branches de `scenario.ts` não têm medição.
- Gitleaks e Semgrep não estão instalados.
- Não reconfirmei, num clone limpo, que o `pnpm deploy --prod` leva o `dist` de `libs/common` para a imagem. O `test:int` constrói a imagem e passou, o que cobre isso indiretamente.
- O limite exato de listeners para `AbortSignal` no Node 22 (m4).
- Não existe PR aberto, então não há discussão para cruzar.
