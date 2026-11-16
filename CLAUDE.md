# CLAUDE.md — Portunus Gateway

**Portunus Gateway**: gateway compatível com a API da OpenAI que fica entre as aplicações e os provedores de LLM (custo, cache, limites, resiliência, observabilidade, evals).

- **O quê e por quê:** [CONTEXT.md](./CONTEXT.md)
- **Como:** [ARQUITETURA.md](./ARQUITETURA.md) e [arquitetura.mermaid](./arquitetura.mermaid)
- **Decisões firmes:** `docs/adr/`
- **Specs de features e tickets:** `docs/specs/`

Em caso de conflito entre o código e esses documentos, **pergunte** antes de seguir. Decisão nova ou alterada vira ADR.

---

## 0. Este é um projeto de aprendizado

Projeto pessoal cujo objetivo principal é **eu aprender** a construir esse tipo de sistema e entender tudo o que um dev pleno deveria saber ao desenvolvê-lo. Entregar rápido é secundário; entender cada passo é o objetivo.

**Como trabalhar comigo:**

- **Spec-driven development.** Sigo um fluxo baseado em specs e tenho skills/contextos de workflow que vão guiar as etapas. Não comece a implementar sem uma spec ou ticket definido em `docs/specs/`.
- **Tickets curtos e incrementais.** Cada ticket é uma mudança pequena, que eu consiga ler e entender inteira. Nada de despejar um módulo completo de uma vez. Ao fim de cada ticket, pare e espere eu revisar antes de seguir.
- **Explique sempre de duas formas:**
  1. **Técnica:** o que o código faz, conceitos envolvidos, nomes corretos dos padrões e mecanismos.
  2. **Didática:** uma analogia ou referência concreta do mundo real que mostre o funcionamento (ex.: circuit breaker como o disjuntor de casa).
- **Sempre o porquê.** Toda decisão vem com a justificativa e as alternativas descartadas, com seus trade-offs.
- **Complexidade e fundamentos.** Quando houver algoritmo ou estrutura de dados (janela deslizante/token bucket, hashing da chave de cache, busca vetorial HNSW vs. IVFFlat, backoff com jitter etc.), explique a complexidade de tempo/espaço (Big-O) e o impacto prático.
- **Pense como pleno.** Aponte o que costuma passar despercebido: concorrência e race conditions, idempotência, modos de falha, cardinalidade de métricas, segurança, custo, testabilidade.

---

## 1. Stack e ferramentas

| Área | Escolha |
|---|---|
| Runtime | **Node 22 LTS** (fixado em `.nvmrc` e `engines`) |
| Linguagem | **TypeScript** em modo `strict`, **CommonJS** |
| Gerenciador de pacotes | **pnpm** com **workspaces** (não usar npm nem yarn) |
| Framework | **NestJS** com adapter **Fastify** |
| Validação e schemas | **Zod** (fonte única dos tipos via `z.infer`; pipe de validação próprio no Nest) |
| Banco | **PostgreSQL + pgvector** via **Drizzle ORM** e **drizzle-kit** (migrations), tudo em `libs/database` |
| Cache, rate limit, jobs | **Redis** + **BullMQ** |
| Eventos | **RabbitMQ** (exchange `gateway.events`, padrão outbox) |
| Busca de logs | **Elasticsearch** |
| Logs | **pino** (JSON estruturado) |
| Telemetria | **OpenTelemetry** → Prometheus, Loki, Tempo, Grafana |
| Testes | **Vitest** (com plugin SWC para decorators) + **Testcontainers** nos testes de integração |
| Lint e formatação | **ESLint** (typescript-eslint strict) + **Prettier** |
| Carga | **k6** |
| Infra local | **Docker Compose** com perfis `core`, `search`, `observability`, `full` |

### Estrutura de pastas

```
apps/
  gateway/        # API de inferência, admin e async (NestJS)
  consumers/      # Indexer, Aggregator, Alerter e worker BullMQ (processo separado)
  evals-cli/      # CLI de avaliação de qualidade
  mock-provider/  # servidor HTTP que imita a API da OpenAI, com latência e falhas configuráveis
libs/
  common/         # tipos, erros no formato OpenAI, utilitários
  telemetry/      # setup do OpenTelemetry e métricas
  events/         # contratos (schemas Zod) dos eventos e publisher
  database/       # schema Drizzle, client e migrations; único lugar onde o schema do banco é definido
infra/            # docker-compose.yml, otel/, grafana/, elasticsearch/
load-tests/       # cenários k6
evals/            # suites de exemplo
docs/adr/         # decisões de arquitetura
docs/specs/       # specs de features e tickets
```

Pacotes do workspace usam o escopo `@portunus/*` (ex.: `@portunus/gateway`, `@portunus/events`).

### Camadas dentro de cada módulo (Clean Architecture)

Módulos do gateway: `auth`, `tenants`, `inference`, `ratelimit`, `budget`, `cache`, `routing`, `providers`, `resilience`, `async`, `events`, `logs-search`, `admin`, `pricing`.

```
apps/gateway/src/modules/<modulo>/
├── domain/           # entidades, value objects, regras puras, ports (interfaces)
├── application/      # use cases que orquestram o domínio via ports
├── infrastructure/   # adapters: Drizzle, Redis, RabbitMQ, HTTP de provedores
├── presentation/     # controllers, schemas de request/response (só se houver rota)
└── <modulo>.module.ts
```

**Regra de dependência:** as dependências apontam para dentro. `domain/` é TypeScript puro e **não importa** Nest, Drizzle, ioredis, amqplib nem nada de infraestrutura. `application/` depende só de `domain/` (inclusive dos ports). A ligação entre port e adapter é feita no `*.module.ts` via injeção de dependência do Nest.

---

## 2. Comandos

> Já existem na raiz: `dev`, `build`, `typecheck` e `test`. Os demais comandos são alvos, criados nos tickets seguintes. **Mantenha esta seção em sincronia com o `package.json` raiz.**

```bash
pnpm install                                   # instalar dependências
docker compose -f infra/docker-compose.yml --profile core up -d   # Postgres, Redis, RabbitMQ, mock

pnpm dev                                       # gateway em modo watch
pnpm --filter @portunus/consumers dev       # consumidores e worker

pnpm typecheck                                 # tsc --noEmit em todos os pacotes
pnpm lint                                      # ESLint
pnpm format                                    # Prettier --write
pnpm test                                      # unitários (Vitest: *.spec.ts de todos os pacotes, sem Docker nem build)
pnpm test:int                                  # integração (Vitest + Testcontainers, exige Docker)
pnpm build                                     # build de produção de todos os apps

pnpm db:generate                               # drizzle-kit generate (gera migration a partir do schema)
pnpm db:migrate                                # aplica migrations

pnpm --filter @portunus/evals-cli start -- run evals/<suite>.yaml
k6 run load-tests/<cenario>.js
```

Para rodar só um pacote: `pnpm --filter <pacote> <script>`.

### Scaffolding: o que é à mão e o que é gerado

- **À mão:** arquivos da raiz do workspace (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`) e o esqueleto de cada app Nest (`package.json`, `tsconfig.json`, `nest-cli.json`, `main.ts`, `app.module.ts`). Cada linha deve ser explicada.
- **Não usar:** `nest new` (gera Express, Jest e um `.git` próprio), `nest g app`/`nest g library` (monorepo nativo do Nest, incompatível com pnpm workspaces) e `nest g resource` (gera class-validator e estrutura sem camadas).
- **Usar `nest g` para peças repetitivas** dentro dos módulos, sempre apontando para a camada certa. `@nestjs/cli` é devDependency de cada app Nest, e o `nest-cli.json` tem `"generateOptions": { "spec": false }`, porque os testes são Vitest e escritos à parte.

```bash
pnpm --filter @portunus/gateway exec nest g module modules/cache
pnpm --filter @portunus/gateway exec nest g controller modules/inference/presentation/chat-completions --flat
```

- **Dependências:** `pnpm add [-D] <pkg> --filter <pacote>`, sempre no pacote que usa a dependência (nunca na raiz, exceto ferramentas de lint, format e test compartilhadas).
- **Migrations:** sempre geradas por `pnpm db:generate` (drizzle-kit) a partir do schema em `libs/database`; nunca escritas à mão, salvo SQL que o Drizzle não expressa (ex.: `CREATE EXTENSION vector`).

---

## 3. Convenções de código

### Geral

- **Código 100% em inglês** (identificadores, nomes de arquivos, mensagens de erro, logs).
- **Documentos Markdown em português** (README, ADRs, specs, docs).
- **Sem comentários no código.** Se algo parece precisar de comentário, melhore o nome, extraia uma função ou crie um tipo. O "porquê" vai na explicação para mim, na spec ou no ADR.
- **Clean Code:** funções pequenas com uma responsabilidade, nomes que revelam intenção, early return, sem números mágicos (constantes nomeadas ou configuração), sem `any`.
- **Design patterns quando resolvem um problema real**, não por antecipação. Os que o projeto naturalmente pede: Adapter (provedores), Strategy (critérios de eval, algoritmo de rate limit), pipeline/Chain of Responsibility (esteira da requisição), Circuit Breaker, Repository, Outbox. Ao usar um padrão, diga qual é e por que ele foi escolhido.
- Schemas Zod são a fonte da verdade dos tipos de entrada, eventos e configuração; não duplique tipos à mão.
- Variáveis de ambiente validadas com Zod na inicialização; app não sobe com config inválida.

### Nomenclatura de arquivos

kebab-case com sufixo do papel, no estilo Nest:

- `lookup-cache.use-case.ts`, `rate-limit.service.ts`, `openai.adapter.ts`, `semantic-cache.repository.ts`, `chat-completions.controller.ts`, `cache.module.ts`
- Testes unitários ao lado do arquivo: `*.spec.ts`
- Testes de integração: `*.int-spec.ts`

### Invariantes de arquitetura (não violar)

Vêm do [ARQUITETURA.md](./ARQUITETURA.md); qualquer desvio precisa ser discutido antes.

1. **Inferência primeiro.** Nada secundário (eventos, indexação, métricas, logs) pode bloquear ou derrubar a resposta. Publicação de eventos fica fora do caminho crítico.
2. **Ordem da esteira:** auth → rate limit → orçamento → cache exato → cache semântico → router/provedor → custo → resposta → evento.
3. **Isolamento por tenant.** Toda chave de Redis, query e entrada de cache inclui o tenant.
4. **Mock primeiro.** Testes e carga rodam contra o provedor mock. Nunca chamar provedor real em teste. Chaves de provedor só em variáveis de ambiente.
5. **Logs de aplicação nunca contêm prompts nem respostas.** Conteúdo só no Elasticsearch, com redação de PII.
6. **`request_id` e `trace_id` nunca viram label** de métrica.
7. **Consumidores idempotentes** pelo `event_id` (entrega at-least-once).
8. **Streaming:** fallback só antes do primeiro byte.
9. **Preços com vigência:** mudar um preço nunca altera custos passados.
10. **Erros no formato da OpenAI** na fronteira da API.

---

## 4. Git

- **Conventional Commits em inglês**, com escopo = módulo ou app: `feat(cache): add exact cache lookup`, `fix(router): respect retry-after header`, `test(budget): ...`, `docs(adr): ...`.
- **Trunk-based:** `main` protegida; branches curtas `feat/...`, `fix/...`, `chore/...`, `docs/...`; PR com CI verde e squash merge.
- Claude **pode** criar branches, commitar, fazer push e abrir PRs.
- **Nunca** incluir `Co-Authored-By`, "Generated with Claude Code" ou qualquer menção ao Claude em commits, descrições de PR ou código. Sem rastros de autoria de IA.
- Descrição de PR em português, explicando o que mudou, por quê e como foi verificado.

---

## 5. Fluxo de trabalho e autonomia

### Ciclo de um ticket

1. Partir da spec/ticket em `docs/specs/` (seguindo minhas skills de workflow).
2. Explicar a abordagem (técnica + didática + porquê) antes de codar algo não trivial.
3. **TDD em regras de negócio e contratos** (chave de cache, cálculo de custo, rate limit, orçamento, fallback, circuit breaker, schemas de eventos): teste primeiro, ciclo red-green-refactor. Infraestrutura e código de cola podem ter testes escritos depois.
4. Implementar em passos pequenos.
5. **Verificar antes de dizer que terminou** (ver abaixo).
6. Resumir o que foi feito, o que aprendemos e o que vem a seguir. Parar para minha revisão.

### Verificação obrigatória antes de concluir

Rodar e reportar o resultado real de:

1. `pnpm typecheck` e `pnpm lint`
2. `pnpm test` (unitários)
3. `pnpm test:int` (integração; exige Docker)
4. Subir o app contra o provedor mock e chamar a rota afetada (curl ou SDK da OpenAI)

Se algum passo não puder rodar (Docker parado, rota ainda inexistente), diga explicitamente qual e por quê. Nunca declare sucesso sem ter rodado.

### O que Claude decide sozinho vs. o que consulta

**Pode fazer sem perguntar** (dentro do escopo do ticket): criar e editar arquivos, escrever testes, refatorações locais, formatação, rodar comandos de verificação, commits e PRs.

**Pergunte antes de:**

- adicionar uma dependência nova;
- criar ou alterar schema de banco/migration;
- mudar contrato de API, de evento ou de configuração;
- desviar do ARQUITETURA.md, de um ADR ou de um invariante acima;
- qualquer decisão de arquitetura. Como o objetivo é aprender, apresente as opções com trade-offs e deixe eu decidir.

---

## 6. Workflow

Convenções lidas pelas skills `tdd`, `review-ticket`, `review-pr` e `implement-epic` (chaves em inglês, valores livres).

- Specs: docs/specs/<feature>/spec.md
- Tickets: docs/specs/<feature>/tickets/<NN>-<slug>.md
- Reviews: .scratch/<feature>/reviews/
- ADRs: docs/adr/
- Glossary: CONTEXT.md
- Language: pt-BR
- Pause after each ticket: yes
