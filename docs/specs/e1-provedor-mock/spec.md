# Spec E1 — Provedor mock

- **Marco:** M1 — Fundação
- **Épico:** E1 (ver [ROADMAP.md §4](../../../ROADMAP.md))
- **Status:** Pronta para quebrar em tickets
- **Label:** `ready-for-agent`
- **Data:** 2026-11-19

---

## Problema

"Mock primeiro" é o invariante 4 do [ARQUITETURA.md](../../../ARQUITETURA.md): desenvolvimento, testes e carga rodam contra um provedor falso. Hoje esse provedor não existe. `apps/mock-provider` é só uma pasta com `.gitkeep`.

Sem ele, cada épico seguinte fica travado ou passa a depender de um provedor real:

- **E3 (chat síncrono)** não tem para onde mandar a primeira chamada sem gastar dinheiro e sem ficar à mercê da rede.
- **E5 (streaming)** precisa de um stream que eu controle, inclusive um que **quebre no meio**, para provar que o gateway termina a resposta de forma limpa.
- **E7 (resiliência)** não tem como ser testado sem um provedor que falhe de propósito: `429` com `Retry-After`, `500`/`503`, timeout, demora até o primeiro byte. Um provedor real não falha quando eu peço.
- **E9 e E10 (cache)** precisam de respostas **determinísticas** (mesma entrada → mesma saída) e de embeddings reprodutíveis.
- **E3 e E16 (carga)** medem o overhead do gateway como "latência via gateway − latência direta ao mock". Se o mock for lento ou variar sozinho, a medida não vale nada.

Do meu ponto de vista como desenvolvedor do projeto: preciso de um servidor que fale exatamente o "dialeto" da API da OpenAI, que o SDK oficial aceite sem saber que é falso, que eu possa mandar se comportar de um jeito específico **em cada requisição**, sem que um teste interfira no outro, e que suba junto com o resto da infra no Compose.

## Solução

Um app `@portunus/mock-provider` que imita a API da OpenAI em três rotas:

- `POST /v1/chat/completions`, normal e em streaming SSE;
- `POST /v1/embeddings`;
- `GET /health` (liveness, para o healthcheck do Compose).

As respostas são **determinísticas**: o conteúdo, a contagem de tokens e os vetores de embedding são derivados de um hash da requisição. A mesma requisição gera sempre a mesma resposta, e a contagem de tokens segue uma regra simples e documentada, para os testes de custo do E4 serem previsíveis.

O comportamento é controlado por um **cenário**: uma especificação curta (latência, tempo até o primeiro byte, erro a simular, taxa de erro, ponto de corte do stream) que pode vir:

1. de um **header** da própria requisição, para testes que chamam o mock direto;
2. de um **prefixo no caminho** da URL, para que um mesmo processo de mock se passe por vários "provedores" diferentes quando o gateway for configurado com URLs base diferentes (necessário no E7);
3. de uma **variável de ambiente** com o cenário padrão da instância.

Como o cenário é por requisição e o mock não guarda estado entre chamadas, testes em paralelo não interferem entre si.

O mock entra no perfil `core` do Compose, com imagem própria e healthcheck.

A demo de pronto: um script com o **SDK oficial da OpenAI**, apontado para o mock (só trocando `baseURL` e `apiKey`), recebe uma resposta normal, um stream completo com o chunk final de `usage`, um embedding, e cada um dos erros configurados: `429` com `Retry-After`, `500`, `503`, timeout e stream cortado no meio.

## Histórias de usuário

**Compatibilidade com a API da OpenAI**

1. Como desenvolvedor do gateway, quero que o SDK oficial da OpenAI consiga chamar o mock só trocando `baseURL` e `apiKey`, para que o adapter do E3 seja testado contra algo que fala exatamente o mesmo protocolo de um provedor real.
2. Como desenvolvedor, quero que `POST /v1/chat/completions` devolva um objeto `chat.completion` com `id`, `object`, `created`, `model`, `choices` (com `message.role = "assistant"`, `message.content` e `finish_reason`) e `usage` (`prompt_tokens`, `completion_tokens`, `total_tokens`), para que o SDK faça o parse sem erro e o gateway leia o uso para calcular custo.
3. Como desenvolvedor, quero que o campo `model` da resposta repita o modelo pedido, para verificar que o gateway mandou o modelo real certo depois de resolver um apelido (E4).
4. Como desenvolvedor, quero que o mock aceite qualquer nome de modelo, para não precisar manter uma lista de modelos válidos sincronizada com a tabela de preços.
5. Como desenvolvedor, quero que campos que o mock não usa (`temperature`, `top_p`, `user`, `metadata`, `response_format` etc.) sejam aceitos e ignorados, para que o SDK e o gateway possam mandar o que mandariam a um provedor real.
6. Como desenvolvedor, quero que uma requisição sem `model` ou sem `messages`, ou com `messages` vazio, receba `400` no formato de erro da OpenAI (`error.message`, `error.type`, `error.param`, `error.code`), para testar como o gateway trata erro de validação vindo do provedor.
7. Como desenvolvedor, quero que uma requisição sem header `Authorization: Bearer <algo>` receba `401` no formato da OpenAI, para provar que o adapter do gateway envia a chave do provedor.
8. Como desenvolvedor, quero que qualquer chave não vazia seja aceita, para não precisar de segredo em teste.
9. Como desenvolvedor, quero que uma rota inexistente receba `404` no formato de erro da OpenAI, para que o gateway nunca precise tratar um formato de erro diferente vindo do mock.

**Determinismo e tokens**

10. Como desenvolvedor do cache exato (E9), quero que duas requisições idênticas produzam o mesmo `content` e o mesmo `usage`, para comparar a resposta servida do cache com a original.
11. Como desenvolvedor, quero que mudar qualquer mensagem, o modelo ou o limite de tokens mude a resposta, para não confundir uma resposta do cache com uma nova.
12. Como desenvolvedor, quero que a ordem das chaves no JSON da requisição não afete a resposta, para que o determinismo dependa do conteúdo e não da serialização.
13. Como desenvolvedor do cálculo de custo (E4), quero uma regra de contagem de tokens simples e documentada, para escrever testes com o valor esperado calculado à mão.
14. Como desenvolvedor, quero que o tamanho padrão da resposta seja fixo e configurável pelo cenário, para gerar respostas curtas em testes e longas em testes de stream.
15. Como desenvolvedor, quero que `max_tokens` (e `max_completion_tokens`) corte a resposta e devolva `finish_reason: "length"`, para testar o caminho em que o modelo para por limite.
16. Como desenvolvedor, quero que `usage.total_tokens` seja sempre a soma de `prompt_tokens` e `completion_tokens`, para que a conta do custo feche.

**Streaming**

17. Como desenvolvedor do streaming (E5), quero que `stream: true` devolva `Content-Type: text/event-stream` com eventos `data: {chunk}` no formato `chat.completion.chunk`, para que o SDK itere o stream normalmente.
18. Como desenvolvedor, quero que o primeiro chunk traga `delta.role = "assistant"`, os seguintes tragam pedaços de `delta.content` e o último traga `finish_reason`, como a OpenAI faz, para que o gateway trate a mesma sequência de um provedor real.
19. Como desenvolvedor, quero que o stream termine com `data: [DONE]`, para que o SDK saiba que acabou.
20. Como desenvolvedor, quero que, com `stream_options.include_usage: true`, o mock envie um chunk final com `choices` vazio e o `usage` preenchido, para que o gateway calcule custo de um stream (E5).
21. Como desenvolvedor, quero que a concatenação dos `delta.content` seja idêntica ao `content` da mesma requisição sem stream, para testar o replay de cache em stream (E9).
22. Como desenvolvedor, quero controlar o intervalo entre chunks, para que o stream leve um tempo visível e eu possa observar o repasse chunk a chunk.
23. Como desenvolvedor, quero que, se o cliente fechar a conexão no meio do stream, o mock pare de gerar e libere os timers daquela requisição, para que testes de cancelamento (E5) não deixem trabalho pendurado no mock.

**Cenários de latência e falha**

24. Como desenvolvedor, quero definir uma latência fixa antes da resposta, para simular um provedor lento.
25. Como desenvolvedor, quero definir uma latência aleatória dentro de um intervalo, para que a carga (E16) tenha uma distribuição de tempo parecida com a real.
26. Como desenvolvedor da resiliência (E7), quero definir o tempo até o primeiro byte de um stream separado do intervalo entre chunks, para testar o timeout até o primeiro byte.
27. Como desenvolvedor da resiliência, quero forçar um `429` com o header `Retry-After` (em segundos) configurável, para testar se o gateway respeita o tempo de espera.
28. Como desenvolvedor da resiliência, quero forçar `500` e `503` no formato de erro da OpenAI, para testar retry e fallback.
29. Como desenvolvedor da resiliência, quero forçar um timeout (o mock aceita a requisição e não responde), para testar o tempo máximo de espera do gateway.
30. Como desenvolvedor do streaming, quero forçar uma falha no meio do stream depois de N chunks (conexão encerrada sem `[DONE]`), para provar que o gateway termina a resposta com um erro limpo em vez de ficar pendurado.
31. Como desenvolvedor da carga e do caos, quero definir uma taxa de erro (ex.: 10% das requisições devolvem `503`), para ver o circuit breaker abrir sob carga.
32. Como desenvolvedor, quero que a taxa de erro e a latência aleatória possam usar uma semente, para reproduzir uma sequência que falhou.
33. Como desenvolvedor, quero que o cenário também valha para `POST /v1/embeddings` (latência e erros; corte de stream não se aplica), para testar a resiliência do cache semântico (E10).

**Controle do cenário**

34. Como desenvolvedor de testes, quero mandar o cenário num header da requisição, para que cada teste defina o próprio comportamento sem reiniciar o mock.
35. Como desenvolvedor de testes, quero que testes em paralelo com cenários diferentes não interfiram entre si, para rodar a suíte em paralelo sem flakiness.
36. Como desenvolvedor do E7, quero codificar o cenário no caminho da URL base, para configurar no gateway um "provedor A" que sempre falha e um "provedor B" saudável apontando para o mesmo processo de mock, sem depender de o gateway repassar headers do cliente.
37. Como operador do ambiente local, quero um cenário padrão por variável de ambiente, para subir o mock no Compose já lento ou instável sem mudar código.
38. Como desenvolvedor, quero que a precedência seja clara (header > caminho > ambiente), para saber qual cenário vale quando mais de um está presente.
39. Como desenvolvedor, quero que um cenário mal escrito (chave desconhecida, número inválido, taxa fora de 0–1) receba `400` com uma mensagem que diga o que está errado, para não achar que o cenário foi aplicado quando não foi.
40. Como operador, quero que latências e esperas tenham um teto configurável, para que um header com `latency=99999999` não segure uma conexão para sempre.

**Embeddings**

41. Como desenvolvedor do cache semântico (E10), quero que `POST /v1/embeddings` devolva um objeto `list` com um item `embedding` por entrada, `model` e `usage` (`prompt_tokens`, `total_tokens`), para que o SDK faça o parse.
42. Como desenvolvedor, quero que `input` aceite uma string ou uma lista de strings, como a OpenAI aceita, para testar embeddings em lote.
43. Como desenvolvedor, quero que o mesmo texto gere sempre o mesmo vetor e textos diferentes gerem vetores diferentes, para que os testes de busca vetorial sejam reprodutíveis.
44. Como desenvolvedor, quero vetores normalizados (norma 1), para que similaridade de cosseno e produto interno deem o mesmo resultado, como nos modelos reais.
45. Como desenvolvedor, quero que o número de dimensões tenha um padrão e respeite o parâmetro `dimensions`, para testar colunas `vector(N)` de tamanhos diferentes no pgvector.
46. Como desenvolvedor, quero que `encoding_format: "base64"` funcione, porque o SDK oficial pede base64 por padrão e decodifica sozinho; sem isso, o SDK receberia lixo.

**Configuração, logs e operação**

47. Como operador, quero que as variáveis de ambiente do mock sejam validadas com Zod na inicialização usando o `loadConfig` de `@portunus/common`, para que o mock não suba com configuração inválida, igual ao gateway.
48. Como operador, quero logs JSON (pino) com método, rota, status e tempo, e **sem** corpo de requisição ou resposta, para manter a mesma regra de privacidade do gateway (invariante 5).
49. Como desenvolvedor de carga, quero poder baixar o nível de log por variável de ambiente, para que o log por requisição não vire o gargalo em teste de carga.
50. Como operador, quero `GET /health` respondendo `200`, para o healthcheck do Compose saber quando o mock está pronto.
51. Como operador, quero que o mock encerre de forma limpa com SIGTERM/SIGINT, sem esperar streams lentos para sempre, para que `docker compose down` não trave.

**Infra e documentação**

52. Como desenvolvedor, quero o mock no perfil `core` do Compose, com imagem construída a partir do repositório, tag de imagem e porta do host parametrizadas, para subir tudo com um comando.
53. Como desenvolvedor, quero que o mock rode também no host com `pnpm --filter @portunus/mock-provider dev`, para iterar sem reconstruir a imagem.
54. Como desenvolvedor, quero um `.env.example` do mock com todas as variáveis aceitas, como o do gateway.
55. Como desenvolvedor, quero um README curto do mock com a gramática do cenário e exemplos de `curl` e do SDK, para não precisar ler o código para saber como forçar um `429`.
56. Como desenvolvedor, quero a seção de comandos do CLAUDE.md e o README atualizados com o mock, para que a documentação não minta (regra transversal 8 do roadmap).

## Decisões de implementação

### Framework do mock (a confirmar)

| Opção                                         | Prós                                                                                                                                                                                                                                                 | Contras                                                                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Fastify puro, sem Nest** _(recomendada)_ | Menos camadas por requisição, o que importa para o mock não ser o gargalo da carga (ponto de atenção do roadmap). Controle direto da resposta crua, necessário para cortar o stream e segurar a conexão. Mostra o que o Nest faz por cima do Fastify | Um segundo estilo de app no monorepo. Sem DI do Nest (não faz falta: o mock não tem dependências de infraestrutura)                    |
| B. Nest + Fastify, igual ao gateway           | Mesmo molde do gateway; reaproveita o padrão de logger e shutdown                                                                                                                                                                                    | Overhead de framework num app que só gera respostas; o controle de stream e socket acaba descendo para o Fastify cru de qualquer jeito |

O CLAUDE.md fala em "esqueleto de cada app Nest", mas o mock é ferramenta de teste e não tem regra de negócio a organizar em camadas. A escolha vira nota no README do mock. Se a opção A for aceita, ela também vale como "linha de base" para o ADR 008: medir o mock em Fastify puro dá a referência do custo mínimo de uma requisição HTTP na máquina.

### Organização interna

Sem as camadas de Clean Architecture dos módulos do gateway, mas com a mesma ideia de separar o que é puro do que é HTTP:

- **Núcleo puro (sem Fastify):** parse e validação do cenário, geração determinística de texto, contagem de tokens, geração de vetores de embedding e montagem dos objetos de resposta e de chunk. É aqui que fica a lógica testável por TDD.
- **Borda HTTP:** rotas, leitura do cenário (header, caminho, ambiente), aplicação de atrasos e erros, escrita do SSE e corte da conexão.
- **Montagem separada da escuta**, como no gateway: uma função que **constrói** o app a partir de uma configuração (e de uma fonte de aleatoriedade e de um relógio injetáveis) e o ponto de entrada que valida o ambiente e chama `listen`.

### Contrato do cenário (a confirmar)

Um único formato, usado igual nas três origens: pares `chave=valor` separados por `;`, validado por um schema Zod.

| Chave         | Valor                                        | Efeito                                                                                                 |
| ------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `latency`     | `N` ou `MIN-MAX` (ms)                        | Espera antes da resposta (não stream) ou antes dos headers (stream). Intervalo = uniforme no intervalo |
| `ttfb`        | `N` ou `MIN-MAX` (ms)                        | Só em stream: espera entre os headers `200` e o primeiro chunk                                         |
| `chunk-delay` | `N` (ms)                                     | Só em stream: intervalo entre chunks                                                                   |
| `tokens`      | `N`                                          | Tamanho da resposta em tokens (antes do corte por `max_tokens`)                                        |
| `error`       | `429`, `500`, `503`, `timeout`, `stream-cut` | Falha a simular                                                                                        |
| `error-rate`  | `0`–`1`                                      | Probabilidade de aplicar o `error`. Padrão `1` quando `error` está presente                            |
| `retry-after` | `N` (s)                                      | Valor do header `Retry-After` no `429`                                                                 |
| `cut-after`   | `N` (chunks)                                 | Com `error=stream-cut`: quantos chunks de conteúdo saem antes do corte                                 |
| `seed`        | inteiro                                      | Semente da aleatoriedade (latência em intervalo e `error-rate`) desta requisição                       |

- **Origens e precedência:** header `x-mock-scenario` > prefixo de caminho `/scenarios/{cenário}/v1/...` > variável `MOCK_DEFAULT_SCENARIO`. A precedência é por cenário inteiro, não chave a chave, para o resultado ser fácil de prever.
- **Cenário no caminho:** a gramática é a mesma do header. `;` e `=` podem ir crus (`/scenarios/error=429;retry-after=4/v1`): o Fastify 5 vem com `useSemicolonDelimiter: false` e não corta a URL no `;`. A forma escapada (`/scenarios/error%3D429%3Bretry-after%3D4/v1`) também funciona, porque o roteador decodifica o parâmetro. O segmento aceita até 1024 caracteres (o padrão do Fastify, 100, não comporta um cenário com todas as chaves). Cenário inválido no caminho → `400` com `error.param = "/scenarios/{scenario}"`.
- **Cenário padrão:** `MOCK_DEFAULT_SCENARIO` é validado na subida, contra o mesmo teto `MOCK_MAX_DELAY_MS`. Inválido, o mock não sobe e o erro de configuração lista o problema sem ecoar o valor. `error=stream-cut` também é recusado ali (ticket 12): como padrão da instância, ele faria falhar com `400` toda chamada sem stream e toda embedding. Por requisição (header ou caminho), continua valendo o `400` sem stream.
- **Validação:** chave desconhecida, valor inválido, intervalo invertido ou valor acima do teto configurado → `400` no formato da OpenAI com `error.param = "x-mock-scenario"` (ou o caminho), listando o problema.
- **Sem estado entre requisições:** nada de "falhe as 3 primeiras e depois funcione". Isso exigiria estado compartilhado e quebraria o isolamento entre testes paralelos. Se o E7 precisar, ele decide como (ver Notas).

### Semântica de cada falha

- **`429`:** status `429`, header `Retry-After` em segundos (padrão configurável), corpo de erro da OpenAI com `code: "rate_limit_exceeded"` e o `type` que a OpenAI usa para limite de requisições (`requests`). Os valores exatos são conferidos contra a referência da API no ticket.
- **`500` / `503`:** status e corpo de erro da OpenAI (`server_error` e indisponibilidade).
- **`timeout`:** o mock lê a requisição e não responde até o teto de espera configurado; se o cliente desistir antes, o mock libera o timer. O teto evita conexões zumbis.
- **`stream-cut`:** envia headers `200`, o chunk de `role`, `cut-after` chunks de conteúdo e **encerra a conexão abruptamente**, sem `finish_reason` e sem `[DONE]`. É o modo de falha real (provedor caiu, rede caiu). A alternativa de enviar um evento `error` dentro do SSE fica fora: a OpenAI não tem esse evento documentado no chat completions, e o gateway precisa aguentar a queda crua de qualquer jeito.
- **`error-rate`:** sorteio por requisição com a fonte de aleatoriedade injetada (com `seed`, reprodutível).
- **Em stream, os erros `429`/`500`/`503`/`timeout` acontecem antes dos headers** (o status ainda pode ser escolhido); só `stream-cut` acontece depois do primeiro byte.

### Determinismo e tokens

- **Chave de determinismo:** hash SHA-256 de uma **forma canônica** da requisição (chaves de objeto ordenadas) com `model`, `messages` e o limite de tokens. Campos ignorados (ex.: `temperature`, `user`) e o cenário **não** entram, para que a resposta normal e a resposta com latência sejam iguais.
- **Texto gerado:** palavras sorteadas de um vocabulário fixo por um gerador pseudoaleatório semeado pelo hash. Não é eco do prompt, para o mock nunca devolver conteúdo do usuário (útil quando aparecer num log por engano).
- **Regra de tokens (a confirmar):**
  - **completion:** 1 palavra gerada = 1 token = 1 chunk de stream (a primeira sem espaço antes, as outras com espaço). A conta fica trivial nos testes e o stream tem granularidade de token, como o real.
  - **prompt:** `ceil(caracteres / 4)` do conteúdo de cada mensagem, somado a um custo fixo por mensagem. É a aproximação clássica de "4 caracteres por token" em inglês; não tenta imitar um tokenizer real (decisão em aberto do roadmap, E5/E8).
  - **embeddings:** a mesma regra do prompt, somada sobre os itens de `input`.
- **`id` e `created`:** `id` com prefixo `chatcmpl-` e sufixo aleatório (único por chamada, como o real); `created` vem do relógio injetado. Não entram na garantia de determinismo.
- **`n > 1`:** recusado com `400` (fora de escopo; o gateway não usa).

### Embeddings

- Vetor gerado por um PRNG semeado pelo hash de (`model`, texto), com componentes em [-1, 1], depois normalizado para norma 1. Geração em O(d) por entrada, sem alocação além do próprio vetor.
- Dimensões: padrão por variável de ambiente (1536, o tamanho de `text-embedding-3-small`) e `dimensions` da requisição quando presente, com teto.
- `input`: string ou lista de 1 a 2048 strings (`MAX_EMBEDDING_INPUTS`, o teto da OpenAI), sem string vazia; fora disso, `400` com `param: "input"`. O teto também limita o trabalho síncrono do PRNG por requisição (ticket 12).
- `encoding_format`: `float` (lista de números) e `base64` (Float32 little-endian em base64, que é o que o SDK decodifica).
- **Sem semântica:** paráfrases geram vetores sem relação. A decisão sobre como testar o cache semântico com significado continua em aberto para o E10.

### Streaming SSE

- Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
- Cada evento: `data: <json>\n\n`. Fim: `data: [DONE]\n\n`.
- Sequência: chunk com `delta.role`; um chunk por token com `delta.content`; chunk com `delta` vazio e `finish_reason`; se `stream_options.include_usage`, chunk com `choices: []` e `usage`; `[DONE]`.
- **Fidelidade em `include_usage`:** o chunk de `usage` só sai se pedido, como na OpenAI. O roadmap fala em "chunk final de `usage`"; seguir a OpenAI obriga o gateway (E5) a pedir `include_usage` explicitamente, que é exatamente o comportamento que ele terá com um provedor real.
- Escrita respeitando backpressure (esperar o `drain` quando o buffer do socket enche) e cancelando os timers no `close` da requisição.

### Autenticação

- Exige `Authorization: Bearer <token não vazio>`, com o esquema sem distinção de maiúsculas; não valida o valor. Sem header → `401` com `type: "invalid_request_error"` e `code: "invalid_api_key"`.
- Corpo: só `application/json`, até 8 MiB (`MAX_REQUEST_BODY_BYTES`). Cada recusa tem mensagem própria no formato da OpenAI: JSON inválido `400`, corpo grande demais `413`, outro `content-type` `415` (ticket 12).

### Configuração (variáveis do mock)

`NODE_ENV`, `HOST`, `PORT` (padrão diferente do gateway, para os dois rodarem juntos no host), `LOG_LEVEL`, `LOG_PRETTY` (fora de produção), `MOCK_DEFAULT_SCENARIO` (vazio = resposta normal e imediata), `MOCK_MAX_DELAY_MS` (teto de qualquer espera, inclusive `timeout`), `MOCK_DEFAULT_COMPLETION_TOKENS`, `MOCK_DEFAULT_RETRY_AFTER_SECONDS`, `MOCK_EMBEDDING_DIMENSIONS`, `MOCK_MAX_EMBEDDING_DIMENSIONS`, `SHUTDOWN_TIMEOUT_MS`. Validação com `loadConfig` de `@portunus/common`, mesmo erro legível sem ecoar valores.

### Logs e shutdown

- Logger embutido do Fastify (pino) em JSON, com o `request_id` próprio do Fastify, no formato da OpenAI (`req_` + 32 hex) e devolvido no header `x-request-id` (ticket 12). Serializers sem corpo; `authorization`, `x-api-key` e `cookie` redigidos (o mock recebe a chave de provedor que o gateway envia).
- Shutdown: no SIGTERM/SIGINT o servidor para de aceitar conexões, **encerra os streams e timeouts simulados em andamento** (não faz sentido esperar um `timeout` de 60 s) e sai dentro de `SHUTDOWN_TIMEOUT_MS`.

### Infra

- **Dockerfile do mock** (multi-stage: instala com o lockfile congelado, compila com `tsc -b`, gera um diretório de produção só com o mock e suas dependências via `pnpm deploy`, imagem final Node 22 slim, usuário não root). É o primeiro Dockerfile do repositório e serve de molde para o do gateway.
- Serviço `mock-provider` no perfil `core` (e `full`), porta do host parametrizada (`MOCK_HOST_PORT`), healthcheck chamando `/health` com o próprio Node (a imagem slim não tem `curl`).
- A imagem base fica fixada em `infra/.env`, junto das outras tags.

### Scripts e workspace

- O mock ganha `package.json`, `tsconfig.json`, `tsconfig.build.json` e `vitest.config.mts` no formato do gateway (ADR 011), com scripts `dev`, `build`, `start`, `typecheck` e `test`.
- Entra automaticamente no `pnpm build`, `pnpm typecheck` e `pnpm test` da raiz (os scripts já são recursivos e o Vitest raiz já lê `apps/*/vitest.config.mts`).

### Dependências novas (precisam de aprovação antes da instalação)

- **`@portunus/mock-provider`:** `fastify` (direta; hoje só existe como transitiva do `@nestjs/platform-fastify`), `zod`, `@portunus/common`; dev: `pino-pretty`.
- **devDependency para os testes de contrato:** `openai` (SDK oficial). Só em teste, nunca chamado com chave real (invariante 4).
- Nenhuma dependência para SSE, hashing ou PRNG: `node:crypto` faz o SHA-256 e um PRNG pequeno (ex.: mulberry32 ou xorshift) é escrito à mão no núcleo puro.

## Decisões de teste

### O que é um bom teste aqui

- Testa **o que um cliente do mock observa**: status, headers, corpo, sequência de eventos SSE, tempo aproximado e a conexão caindo. Não testa qual função interna montou o chunk.
- **O cliente de referência é o SDK oficial da OpenAI.** Se o SDK aceita, o gateway (que vai usar o mesmo protocolo) também vai. Onde o SDK esconde detalhes (header `Retry-After` cru, enquadramento exato do SSE, `401` sem chave), o teste usa `fetch` direto.
- **Sem flakiness de tempo:** latências testadas com valores pequenos e asserção de limite inferior (`≥ N ms`), nunca de igualdade. Aleatoriedade testada com `seed` fixa ou com a fonte injetada.
- **SDK sem retry nos testes:** o SDK da OpenAI faz 2 retries automáticos em `429`/`5xx` respeitando `Retry-After`. Os testes criam o cliente com `maxRetries: 0`, senão um teste de `429` levaria segundos e mascararia o comportamento. (O mesmo vale para o adapter do gateway no E3: retry é responsabilidade do gateway, não do SDK.)
- Cada teste constrói o próprio app, escuta numa porta efêmera (`0`) em `127.0.0.1` e fecha ao final.

### Seams

1. **Seam principal: a função que constrói o app do mock**, chamada com uma configuração, uma fonte de aleatoriedade e um relógio, escutando numa porta efêmera. Os testes falam com ele pelo SDK oficial e por `fetch`. Escolhido em vez do `inject` do Fastify porque o `inject` não exercita o socket real: não dá para observar a conexão sendo cortada (`stream-cut`), o cliente abortando nem o SDK lendo o stream. Cobre:
   - chat normal: formato, `model` ecoado, `usage` coerente, determinismo (mesma entrada → mesmo conteúdo; ordem de chaves irrelevante; mudança de mensagem muda a resposta), `max_tokens` → `finish_reason: "length"`;
   - stream: sequência de chunks, `[DONE]`, `usage` só com `include_usage`, concatenação igual à resposta não stream;
   - cada cenário: `latency`, `ttfb`, `429` + `Retry-After`, `500`, `503`, `timeout` (cliente com timeout curto recebe erro de timeout), `stream-cut` (SDK lança erro de conexão depois de N chunks), `error-rate` com `seed`;
   - origens do cenário e precedência (header > caminho > ambiente); cenário inválido → `400`; valor acima do teto → `400`;
   - embeddings: formato, string e lista, determinismo, norma 1, `dimensions`, `base64` decodificado pelo SDK igual ao `float`;
   - `401` sem `Authorization`, `400` sem `messages`, `404` em rota desconhecida, tudo no formato da OpenAI;
   - cliente aborta no meio do stream → o mock não continua escrevendo (observado pelo log de fim da requisição ou por uma contagem exposta à fonte de relógio injetada);
   - configuração inválida → a construção falha listando os campos sem ecoar valores; ambiente vazio → sobe com os padrões;
   - log da requisição em JSON, sem corpo e com `authorization` redigido.
2. **Núcleo puro, só onde o TDD pede:** parser de cenário, regra de tokens, canonicalização + hash e geração de vetor têm testes unitários próprios, escritos antes do código (regra de contrato do CLAUDE.md). Isso **não** é um seam novo de comportamento: são as funções que o seam 1 usa, testadas direto porque a combinatória (gramática do cenário, casos de borda de tokens) seria cara de cobrir só via HTTP.
3. **Integração (`pnpm test:int`):** um teste com Testcontainers que constrói a imagem do mock a partir do Dockerfile, espera o healthcheck e faz uma chamada de chat pelo SDK. Prova a imagem e o Compose, não o comportamento (já coberto no seam 1).

### Prior art

- Seam de montagem separado da escuta e destino de log em memória: os testes do gateway do E0 (`createApp` + destino de log em memória).
- Validação de ambiente: os testes de configuração do gateway e o `loadConfig` de `@portunus/common`.
- Testcontainers: o teste de fumaça do pgvector em `@portunus/database`.

### Verificação manual (CLAUDE.md §5)

- Compose `core` de pé com o mock; `curl` em `/health`, chat normal, stream (`curl -N`) e cada erro; script com o SDK oficial reproduzindo a demo de pronto.

## Fora de escopo

- Semântica nos embeddings (paráfrases próximas): decisão em aberto do E10.
- Outras rotas da OpenAI: `/v1/models`, `/v1/completions` (legado), `/v1/responses`, imagens, áudio, moderação, batch, files.
- Tool calling / function calling, `logprobs`, `n > 1`, `response_format` com JSON schema (aceito e ignorado).
- Imitar a API da Anthropic ou de outro provedor. O mock fala só o dialeto da OpenAI; um mock Anthropic, se necessário, nasce no épico do adapter Anthropic.
- Tokenizer real (tiktoken): decisão em aberto do roadmap (E5/E8).
- Cenários com estado (falhar as N primeiras, alternar por tempo), endpoint de administração para trocar o cenário em tempo de execução e métricas do mock.
- Medição formal de throughput do mock com k6 (E3 faz o primeiro cenário; E16 as metas).
- Dockerfile e serviço do gateway no Compose (entram quando o gateway precisar rodar em container).
- Headers de rate limit informativos da OpenAI (`x-ratelimit-remaining-*`).

## Notas

### Pontos que um dev pleno não pode deixar passar neste épico

- **O mock não pode ser o gargalo.** A meta do ARQUITETURA.md §13 é ≥ 500 req/s no gateway; o mock precisa sobrar com folga. Por isso: sem framework por cima do Fastify, log por requisição desligável, nada síncrono e caro no caminho (SHA-256 de uma requisição pequena é barato; gerar 1536 floats é O(d) e também), e as esperas com `setTimeout`, nunca com laço ocupado.
- **Timers vazando.** Cada `latency`, `ttfb`, `chunk-delay` e `timeout` é um timer. Se o cliente aborta e o timer não é cancelado, o mock acumula trabalho e memória sob carga e caos. Todo timer é limpo no `close` da requisição.
- **Backpressure no SSE.** Escrever chunks sem respeitar o retorno de `write` enche a memória quando o cliente lê devagar. É o mesmo problema que o gateway terá no E5; aqui ele aparece primeiro em escala pequena.
- **Canonicalização antes do hash.** `JSON.stringify` depende da ordem de inserção das chaves; sem ordenar, duas requisições iguais teriam hashes diferentes e o determinismo seria falso. É a mesma armadilha da chave do cache exato (E9).
- **O SDK pede base64 nos embeddings.** O SDK oficial manda `encoding_format: "base64"` quando o usuário não especifica e decodifica a resposta. Um mock que só sabe `float` passa no `curl` e quebra no SDK.
- **Retry do SDK escondendo comportamento.** O SDK faz retry sozinho em `429` e `5xx`. Em teste, isso deixa a suíte lenta e mascara a falha; no gateway, duplicaria a política de retry do E7.
- **Header de controle é entrada não confiável.** O cenário vem do cliente: valida com Zod, limita valores com teto e nunca reflete o valor cru numa resposta ou log sem escapar.
- **Corte de stream ≠ fim de stream.** Fechar a resposta normalmente (`end`) depois de N chunks sem `[DONE]` é diferente de destruir o socket. O cenário corta a conexão de verdade, que é o que o gateway vai ver quando um provedor cair.

### Decisões a confirmar na revisão desta spec

1. **Framework:** Fastify puro (opção A) em vez de Nest + Fastify.
2. **Contrato do cenário:** gramática `chave=valor;...`, header `x-mock-scenario`, prefixo de caminho `/scenarios/{cenário}/v1` e precedência header > caminho > ambiente.
3. **Regra de tokens:** 1 palavra = 1 token = 1 chunk na resposta; `ceil(chars/4)` + custo fixo por mensagem no prompt.
4. **`include_usage`:** chunk de `usage` só quando pedido (fiel à OpenAI) em vez de sempre.
5. **`stream-cut`:** corte abrupto da conexão em vez de evento de erro no SSE.
6. **Dockerfile** do mock neste épico (primeiro do repositório) e serviço no perfil `core`.
7. **Dependências novas:** `fastify`, `zod`, `@portunus/common`, `pino-pretty` (dev) no mock; `openai` (dev) para os testes de contrato.

### Ganchos para épicos seguintes

- **E3:** o `MockAdapter` do gateway aponta para o mock; o primeiro cenário k6 mede o mock sozinho e o gateway na frente dele.
- **E7:** se cenários com estado (falhar e depois voltar) forem necessários para ver o circuit breaker fechar sozinho, a alternativa sem estado compartilhado é trocar a URL base do provedor na configuração do gateway entre dois prefixos de cenário. Decidir no E7.
- **E10:** a decisão sobre embeddings com semântica pode adicionar fixtures de paráfrases ao mock.

### Tickets

A sequência de tickets, com dependências e definição de pronto, fica em `tickets/README.md` desta pasta, criada no próximo passo.

Ao abrir o épico, atualizar o status do E1 na tabela do [ROADMAP.md §3](../../../ROADMAP.md) para `Em andamento`.

## Fechamento do épico

Escrito no ticket [11](./tickets/11-fechamento-do-epico.md). A saída da demo num clone limpo está em [.scratch/e1-provedor-mock/demo-clone-limpo.md](../../../.scratch/e1-provedor-mock/demo-clone-limpo.md).

### O que foi entregue

- **App `@portunus/mock-provider`** em Fastify puro: `POST /v1/chat/completions` (normal e SSE), `POST /v1/embeddings` e `GET /health`, com `Authorization: Bearer` obrigatório e erros sempre no formato da OpenAI (inclusive `404`, JSON inválido e corpo inválido).
- **Determinismo:** SHA-256 da forma canônica de (`model`, `messages`, limite de tokens) semeando um PRNG mulberry32; texto de vocabulário fixo, sem eco do prompt; regra de tokens documentada (1 palavra = 1 token = 1 chunk; `ceil(chars/4)` + 3 por mensagem no prompt).
- **Cenário por requisição**, sem estado: gramática `chave=valor;...` validada com Zod, com teto, vinda do header `x-mock-scenario`, do prefixo `/scenarios/{cenário}/v1` ou de `MOCK_DEFAULT_SCENARIO`, com precedência por cenário inteiro. Falhas: `429` + `Retry-After`, `500`, `503`, `timeout`, `stream-cut` (socket destruído), `error-rate` com `seed`.
- **Streaming SSE** fiel à OpenAI: chunk de `role`, um por token, `finish_reason`, `usage` só com `include_usage`, `[DONE]`; backpressure respeitada e timers cancelados no `close`.
- **Embeddings** de norma 1 em O(d), `dimensions` com teto, `float` e `base64` (o padrão do SDK).
- **Operação:** configuração validada que derruba o processo sem ecoar valores, log JSON sem corpo e com `authorization` redigido, graceful shutdown que interrompe esperas e streams simulados.
- **Infra:** primeiro Dockerfile do repositório (multi-stage, `pnpm deploy`, Node 22 slim, usuário não root), serviço `mock-provider` no perfil `core` com healthcheck em Node e porta `MOCK_HOST_PORT`.
- **Testes:** unitários em `pnpm test` (o mock testado pelo app escutando numa porta efêmera, com o SDK oficial e `fetch`) e um teste de integração em `pnpm test:int` que constrói a imagem e chama o chat pelo SDK. A contagem fica no resumo do Vitest, não aqui, para não envelhecer.
- **Demo de pronto:** `pnpm --filter @portunus/mock-provider demo` cobre os 8 casos do critério de pronto com o SDK oficial.

### O que aprendemos

- **Testar pelo socket real, não pelo `inject`:** corte de conexão, cliente abortando e o SDK lendo o stream só existem com uma porta de verdade.
- **Corte ≠ fim:** `end()` sem `[DONE]` é um fim limpo; o SDK só vê a falha (`TypeError: terminated`) quando o socket é destruído.
- **O SDK esconde comportamento:** faz retry sozinho em `429`/`5xx` (por isso `maxRetries: 0`) e pede embeddings em `base64` sem avisar.
- **Canonicalizar antes do hash:** sem ordenar as chaves, o determinismo seria falso; é a mesma armadilha da chave do cache exato (E9).
- **Toda espera é um recurso:** cada `setTimeout` precisa ser cancelado no `close` e no shutdown, senão o mock acumula timers sob carga e um `timeout` segura o fechamento do processo.
- **Achado de review é hipótese até o teste ficar vermelho:** o `MaxListenersExceededWarning` com mais de 10 esperas (review do PR, m4) não acontece, porque o Node não aplica esse aviso aos listeners de um `AbortSignal`. O teste ficou como regressão; a correção não entrou.
- **O Fastify 5 aceita `text/plain` por padrão:** sem remover esse parser, um `content-type` errado virava um `400` de parâmetro em vez de `415`.
- **Sorteios com `seed` precisam ser estáveis:** uma `latency` fixa não pode consumir um sorteio e deslocar o `error-rate` (achado da review 04).
- **Genéricos + `instanceof` viram `any`:** `error instanceof APIError` estreita para `APIError<any, any, any>`; um type guard com o tipo declarado resolve sem cast.

### Desvios em relação à spec

| Spec                                          | O que aconteceu                                                                                                                                                                                                 | Por quê                                                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `@types/node` alinhado ao runtime (implícito) | `overrides` em `pnpm-workspace.yaml` fixa `@types/node@26.6.6`                                                                                                                                                  | O `@types/node@18` do `testcontainers` (via `@types/ssh2`) quebrava os tipos de `Response.body` (ticket 10)                                |
| Corpo de chat aceito como na OpenAI           | `content` só como string; partes (`[{type:"text"}]`) e `null` são recusados com `400`                                                                                                                           | Achado m1 da review 02, adiado: o gateway ainda não manda esses formatos                                                                   |
| Demo como "um script" sem lugar definido      | `src/demo/ready-demo.mts`, rodado com o type stripping do Node 22 e fora do build de produção                                                                                                                   | Entra no typecheck e no lint sem dependência nova (`tsx`/`ts-node`) e sem ir para a imagem                                                 |
| Ordem de verificação da rota desconhecida     | `GET /v1/nope` sem chave responde `401`, não `404`                                                                                                                                                              | Auth antes do roteamento, como a OpenAI; decisão explícita do ticket 03, sem teste que a fixe                                              |
| Chave `tokens` do cenário (ticket 04)         | Parseada desde o 04, mas só passou a ter efeito no ticket 11, achado M1 da review: substitui `MOCK_DEFAULT_COMPLETION_TOKENS` (normal e stream), `max_completion_tokens` menor ainda corta, e não entra no hash | O teste do 04 cobria só o parse; nenhum teste pela rota pedia `tokens`. Lição: chave de contrato precisa de teste no seam de comportamento |

### O que o E3 herda

- **Alvo do adapter:** o `MockAdapter` aponta para o serviço `mock-provider` do Compose (`http://localhost:3001/v1` no host); o primeiro cenário k6 mede o mock sozinho e o gateway na frente dele (ADR 008).
- **Contrato a respeitar no adapter:** `maxRetries: 0` no SDK (retry é do gateway, E7), `include_usage` pedido explicitamente no stream (E5) e `Retry-After` lido do header.
- **Falhas para o E7:** o prefixo `/scenarios/{cenário}/v1` permite configurar "provedores" diferentes no mesmo processo trocando só a URL base.

### Pendências para épicos futuros

- **`@types/node` alinhado ao Node 22:** remover o `overrides` que fixa `26.6.6` quando o `testcontainers` deixar de trazer o `@types/node@18`, ou fixar a linha 22 e resolver os tipos de `Response.body` de outro jeito.
- **Mensagens em partes e `content: null`** (review 02 m1): aceitar e definir a regra de tokens antes de o gateway repassar mensagens multimodais ou com `tool_calls`.
- **`mock-image.int-spec.ts` compilado no `dist`** (review 10 m1): o `exclude` do `tsconfig.build.json` pega `*.spec.ts`, não `*.int-spec.ts`.
- **Header ou segmento de cenário vazio** (review 05 m1): decidir se conta como ausente; hoje suprime o cenário de menor prioridade.
- **Cenário no caminho acima de 1024 caracteres** responde `404`, não `400` (review 05 m2).
- **`pino-pretty` como devDependency** importado sob demanda (review 01 m2): funciona porque `LOG_PRETTY` é recusado em produção; ligar `LOG_PRETTY=true` na imagem quebraria.
- **Testes sensíveis a tempo e a timers globais** (reviews 06 e 07): candidatos a oscilar na CI.
- **Headers `x-ratelimit-*` no `429` do mock** (review do PR, n3): vão para o E3, junto do rate limit do gateway. O `x-request-id` já entrou no ticket 12.
- **`fastify` do gateway em `>=5.12.5`** (review do PR, m2): chega pelo `@nestjs/platform-fastify` e tem advisories `high`; o mock já subiu para `5.12.8` no ticket 12. Ticket próprio fora do E1.
- **`413` pelo socket:** o Fastify recusa pelo `content-length` e fecha a conexão enquanto o cliente ainda envia, então um cliente HTTP pode ver `ECONNRESET` em vez do `413`. O teste do formato usa `inject`.
