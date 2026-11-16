# Spec E0 — Fundação do monorepo

- **Marco:** M1 — Fundação
- **Épico:** E0 (ver [ROADMAP.md §4](../../../ROADMAP.md))
- **Status:** Pronta para quebrar em tickets
- **Label:** `ready-for-agent`
- **Data:** 2026-11-16

---

## Problema

O Portunus tem a visão ([CONTEXT.md](../../../CONTEXT.md)), a arquitetura ([ARQUITETURA.md](../../../ARQUITETURA.md)), o roadmap e as notas de estudo, mas nenhuma linha de código executável. A estrutura de pastas existe só como `.gitkeep`.

Sem uma fundação, cada épico seguinte teria de resolver ao mesmo tempo o problema de negócio (auth, cache, custo) e o problema de ferramental (como um pacote importa outro, como os decorators do Nest funcionam nos testes, como o CI sobe Postgres). Esses dois tipos de problema se misturariam e o aprendizado ficaria confuso. Além disso, convenções que não são impostas pela ferramenta desde o primeiro commit (strict, lint, formato, regra de dependência entre camadas, logs sem conteúdo) se perdem rapidamente.

Do meu ponto de vista como desenvolvedor do projeto: preciso de um repositório onde `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm test:int` funcione localmente e no CI, onde exista um gateway Nest + Fastify respondendo `GET /health` com logs estruturados e configuração validada, e onde as próximas features sejam só código de domínio, sem retrabalho de infraestrutura.

## Solução

Montar à mão, peça por peça e entendendo cada linha, a raiz de um monorepo pnpm com TypeScript strict em CommonJS, ESLint + Prettier, Vitest com SWC e a separação entre testes unitários e de integração. Sobre essa base:

- um `apps/gateway` mínimo (Nest + Fastify) com `GET /health`, configuração validada por Zod na inicialização, logger pino em JSON com `request_id` por requisição e graceful shutdown;
- quatro bibliotecas `@portunus/*` (common, telemetry, events, database) como pacotes reais do workspace, com a resolução entre pacotes funcionando em typecheck, testes, build e runtime;
- um `infra/docker-compose.yml` com o perfil `core` inicial (Postgres + pgvector e Redis);
- um workflow de CI no GitHub Actions que roda tudo isso a cada PR e protege a `main`;
- o ADR 008 (Fastify em vez de Express) registrado.

Ao final, a demo é: clonar, `pnpm install`, subir o Compose `core`, `pnpm dev`, `curl /health` responde `200` e o log mostra uma linha JSON com o `request_id` da chamada.

## Histórias de usuário

**Ambiente e workspace**

1. Como desenvolvedor do Portunus, quero que a versão do Node seja fixada em `.nvmrc` e em `engines`, para que minha máquina, a de outra pessoa e o CI usem o mesmo runtime.
2. Como desenvolvedor, quero que a instalação falhe se eu usar uma versão de Node ou um gerenciador diferente do esperado, para descobrir o problema na hora e não com um bug estranho depois.
3. Como desenvolvedor, quero que a versão do pnpm fique fixada no `package.json` raiz (campo `packageManager`), para que todo mundo gere o mesmo lockfile.
4. Como desenvolvedor, quero que `apps/*` e `libs/*` sejam pacotes do workspace com escopo `@portunus/*`, para que um contrato compartilhado mude no mesmo commit que quem o usa.
5. Como desenvolvedor, quero que um pacote só enxergue as dependências que declarou, para não criar dependências fantasma.
6. Como desenvolvedor no Windows, quero que o repositório normalize finais de linha para LF, para que diffs e o Prettier não acusem mudanças falsas entre Windows e o CI em Linux.

**TypeScript e resolução entre pacotes**

7. Como desenvolvedor, quero um `tsconfig.base.json` com `strict` e flags extras de segurança, estendido por todos os pacotes, para que o rigor seja o mesmo em todo o monorepo.
8. Como desenvolvedor, quero importar `@portunus/common` dentro do gateway pelo nome do pacote, e não por caminho relativo, para que as fronteiras entre pacotes sejam explícitas.
9. Como desenvolvedor, quero que esse import funcione igual no editor, no `pnpm typecheck`, no Vitest, no build e no processo Node em execução, para não cair no "funciona no editor, quebra no build".
10. Como desenvolvedor, quero que `pnpm typecheck` verifique todos os pacotes de uma vez e falhe se qualquer um tiver erro de tipo.
11. Como desenvolvedor, quero que `pnpm build` gere o JavaScript de produção de todos os pacotes na ordem certa de dependência.

**Qualidade de código**

12. Como desenvolvedor, quero ESLint com typescript-eslint em modo strict com checagem de tipos, para pegar promessas não tratadas, `any` implícito e outros erros que o compilador deixa passar.
13. Como desenvolvedor, quero que o lint proíba `console.*`, para que nenhum log escape do logger configurado (e da redação de dados sensíveis).
14. Como desenvolvedor, quero que o lint impeça a camada `domain/` de importar Nest, Drizzle, ioredis, amqplib e outros pacotes de infraestrutura, para que a regra de dependência da Clean Architecture seja imposta pela ferramenta e não só pela memória.
15. Como desenvolvedor, quero que o lint impeça `application/` de importar `infrastructure/` e `presentation/`, pelo mesmo motivo.
16. Como desenvolvedor, quero Prettier como única fonte de formatação e um `pnpm format:check` que falhe no CI se algo não estiver formatado, para que revisões de PR discutam código e não espaços.
17. Como desenvolvedor, quero que ESLint e Prettier não briguem entre si (ESLint não aplica regras de estilo), para que um não desfaça o outro.

**Testes**

18. Como desenvolvedor, quero `pnpm test` rodando só testes unitários (`*.spec.ts`), rápidos e sem Docker, para usar no ciclo red-green-refactor.
19. Como desenvolvedor, quero `pnpm test:int` rodando só testes de integração (`*.int-spec.ts`) com Testcontainers, para separar o que é rápido do que precisa de Docker.
20. Como desenvolvedor, quero que o Vitest compile com SWC emitindo metadados de decorators, para que a injeção de dependência do Nest funcione dentro dos testes.
21. Como desenvolvedor, quero que um teste de integração de fumaça prove que o Testcontainers sobe a mesma imagem de Postgres + pgvector do Compose e que a extensão `vector` está disponível, para que o ferramental de integração esteja validado antes do primeiro épico que precisa dele.
22. Como desenvolvedor, quero que o Vitest resolva os pacotes `@portunus/*` sem exigir um build prévio, para que os testes rodem logo após o `pnpm install`.

**Gateway: inicialização e configuração**

23. Como operador do gateway, quero que todas as variáveis de ambiente sejam validadas por um schema Zod na inicialização, para que o app não suba com configuração inválida.
24. Como operador, quero que, quando a configuração for inválida, o processo termine com código diferente de zero e uma mensagem que liste cada variável problemática e o motivo, sem imprimir o valor de nenhuma delas, para corrigir rápido sem vazar segredos.
25. Como operador, quero valores padrão sensatos para desenvolvimento (porta, host, nível de log), para que `pnpm dev` funcione sem um `.env`.
26. Como desenvolvedor, quero um `.env.example` versionado com todas as variáveis aceitas, para saber o que configurar; o `.env` real continua fora do git.
27. Como desenvolvedor, quero que o resto do código receba a configuração já tipada (inferida do schema Zod), e não leia `process.env` diretamente, para que exista uma única fonte da verdade.

**Gateway: health, logs e shutdown**

28. Como operador, quero `GET /health` respondendo `200` com um corpo JSON simples, sem autenticação, para que o Compose, um orquestrador ou eu mesmo com `curl` saibamos que o processo está vivo.
29. Como operador, quero que cada requisição tenha um `request_id`, devolvido no header de resposta `x-request-id`, para correlacionar o que o cliente viu com o que o gateway registrou.
30. Como cliente do gateway, quero que um `x-request-id` válido enviado por mim seja reaproveitado, para correlacionar a chamada com os logs do meu próprio sistema.
31. Como operador, quero que um `x-request-id` recebido que seja inválido (grande demais ou com caracteres fora do permitido) seja descartado e substituído por um id gerado, para evitar injeção de logs e lixo nas buscas.
32. Como operador, quero logs em JSON de uma linha (pino), com `request_id` em toda linha emitida durante uma requisição, inclusive as de serviços internos, para que o Loki (E6) consiga filtrá-los.
33. Como operador, quero que os headers sensíveis (`authorization`, `x-api-key`, `cookie`, `set-cookie`) sejam sempre redigidos nos logs, para que nenhuma credencial vaze já no primeiro épico, antes mesmo de existir autenticação.
34. Como operador, quero que os logs internos do próprio Nest (bootstrap, rotas mapeadas) também saiam em JSON pelo mesmo logger, para que não haja dois formatos de log no mesmo processo.
35. Como operador, quero controlar o nível de log por variável de ambiente, para aumentar o detalhe ao investigar sem mudar código.
36. Como desenvolvedor, quero logs legíveis (pretty) só em desenvolvimento local, se eu pedir, sem que isso vire o padrão em nenhum outro ambiente.
37. Como operador, quero que, ao receber SIGTERM ou SIGINT, o gateway pare de aceitar conexões, termine as requisições em andamento e encerre dentro de um prazo máximo configurado, para que um deploy ou um `Ctrl+C` não corte requisições pela metade.
38. Como operador, quero que, se o prazo de shutdown estourar, o processo termine mesmo assim com um log de aviso, para que um shutdown travado não segure o deploy para sempre.

**Bibliotecas compartilhadas**

39. Como desenvolvedor, quero `@portunus/common`, `@portunus/telemetry`, `@portunus/events` e `@portunus/database` existindo como pacotes reais (com `package.json`, tsconfig e ponto de entrada), para que os próximos épicos só adicionem código.
40. Como desenvolvedor, quero que `@portunus/common` já ofereça o utilitário genérico de carregamento de configuração com Zod (receber um schema e um ambiente, devolver a configuração tipada ou um erro legível), para que gateway, consumers e mock-provider validem config da mesma forma.
41. Como desenvolvedor, quero que dependências circulares entre pacotes do workspace sejam proibidas desde o início, para que o grafo de pacotes continue sendo uma árvore.

**Infra local**

42. Como desenvolvedor, quero `docker compose -f infra/docker-compose.yml --profile core up -d` subindo Postgres com pgvector e Redis, para ter as dependências do dia a dia com um comando.
43. Como desenvolvedor, quero que as imagens tenham tag fixa (nunca `latest`), para que o ambiente não mude sozinho.
44. Como desenvolvedor, quero healthchecks em cada serviço do Compose, para saber quando ele está pronto, não só iniciado.
45. Como desenvolvedor, quero volumes nomeados e credenciais só de desenvolvimento no Compose, para que os dados sobrevivam a reinícios e nada sensível seja versionado.
46. Como desenvolvedor, quero poder trocar as portas expostas por variável de ambiente, para contornar conflitos com um Postgres ou Redis já instalado na máquina.

**CI e fluxo de git**

47. Como revisor de PR, quero que todo PR rode install (com lockfile congelado), typecheck, lint, format:check, test e test:int no GitHub Actions, para não aprovar nada quebrado.
48. Como revisor, quero que testes unitários e de integração rodem em jobs separados, para ter feedback rápido do que é rápido e isolar falhas de Docker.
49. Como desenvolvedor, quero cache do store do pnpm no CI, para que o pipeline não baixe tudo a cada execução.
50. Como mantenedor, quero que as actions de terceiros estejam fixadas por SHA de commit e que o workflow tenha permissões mínimas (`contents: read`), para reduzir o risco de cadeia de suprimentos.
51. Como desenvolvedor, quero que um novo push no mesmo PR cancele a execução anterior do CI, para não desperdiçar minutos.
52. Como mantenedor, quero a `main` protegida, exigindo PR com os checks do CI verdes e squash merge, para que o histórico da `main` seja linear e sempre verde.
53. Como desenvolvedor, quero a seção de comandos do CLAUDE.md em sincronia com os scripts do `package.json` raiz, para que a documentação não minta.

**Decisões registradas**

54. Como futuro leitor do projeto, quero o ADR 008 (Fastify em vez de Express) registrado com status "A validar" e a medição prevista para o E3, para saber por que a escolha foi feita e quando ela será confirmada.
55. Como futuro leitor, quero um ADR sobre a estratégia de resolução de pacotes do workspace, para entender por que os imports entre pacotes funcionam do jeito que funcionam.

## Decisões de implementação

### Workspace e runtime

- **Node 22 LTS**, fixado em `.nvmrc` e em `engines` de todos os pacotes; `engineStrict: true` no `pnpm-workspace.yaml` para a instalação falhar com a versão errada (a partir do pnpm 10, as configurações do pnpm ficam no `pnpm-workspace.yaml`, não no `.npmrc`).
- **pnpm fixado via `packageManager`** e ativado pelo Corepack. Workspace com `apps/*` e `libs/*`. Dependências internas usam o protocolo `workspace:*`.
- Todos os pacotes são `private: true`; nenhum é publicado no npm.
- `.gitattributes` com `eol=lf` e `.editorconfig`, porque o desenvolvimento acontece no Windows e o CI em Linux.
- **Só os pacotes que o E0 precisa ganham `package.json`:** gateway e as quatro libs. `consumers`, `evals-cli` e `mock-provider` continuam como pastas vazias até seus épicos (E1, E11/E12, E15), para não manter pacotes vazios.

### TypeScript

- `tsconfig.base.json` com `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `experimentalDecorators` e `emitDecoratorMetadata`; saída **CommonJS**, alvo ES2023 (suportado pelo Node 22).
- Cada pacote estende a base e só define o que é seu (`rootDir`, `outDir`, `include`, referências).

### Resolução entre pacotes do workspace (vira ADR 011, a confirmar)

Este é o principal "ponto de atenção" do E0. Opções consideradas:

| Opção | Como funciona | Trade-off |
|---|---|---|
| **A. `paths` no tsconfig** | O TS mapeia `@portunus/x` para o código-fonte | Só o compilador entende; o Node em runtime não lê `paths` e o build quebra sem um bundler ou `tsconfig-paths`. Esconde as fronteiras do pnpm |
| **B. Pacote interno "just-in-time"** | `main`/`exports` apontam direto para `src/index.ts` | Simples para o Vitest, mas o Node em CommonJS não executa `.ts` de dentro de `node_modules` (o type stripping do Node 22 não vale para dependências nem cobre decorators). Exigiria bundler no build |
| **C. Pacotes compilados + project references + condição de export para o código-fonte** *(recomendada)* | Cada lib é compilada para `dist` (`tsc -b` respeita a ordem pelas references). O `exports` do `package.json` tem uma condição customizada que aponta para `src` e um `default` que aponta para `dist`. O typecheck (via `customConditions`) e o Vitest (via `resolve.conditions`) usam a condição de código-fonte; o Node em runtime usa `dist` | Um pouco mais de configuração, mas cada ferramenta resolve do jeito certo, o runtime é Node puro e o grafo de build é explícito |

A opção C exige `module`/`moduleResolution` `node16` (que mantém CommonJS quando o pacote não declara `"type": "module"`), porque `customConditions` não funciona com a resolução `node10` antiga.

### Ferramentas de qualidade

- **ESLint em flat config**, com `typescript-eslint` no preset strict com checagem de tipos, mais:
  - `no-console` como erro;
  - `no-restricted-imports` por camada: em `**/domain/**`, proibir `@nestjs/*`, `drizzle-orm`, `ioredis`, `amqplib`, `bullmq`, `fastify` e imports de `application/`, `infrastructure/` e `presentation/`; em `**/application/**`, proibir imports de `infrastructure/` e `presentation/`. Isso impõe a regra de dependência sem adicionar plugin.
- **Prettier** como formatador único; o ESLint não aplica regras de estilo (config de compatibilidade do Prettier). `format` escreve, `format:check` só verifica (usado no CI).
- **Ciclos entre pacotes:** o próprio `tsc -b` recusa referências circulares entre projetos, o que já cobre o nível de pacote sem ferramenta extra. Ciclos entre arquivos dentro de um pacote ficam para quando aparecerem (fora de escopo).

### Testes

- **Vitest** na raiz com um arquivo de configuração por tipo de teste (ou projetos do Vitest): `test` inclui `*.spec.ts` e exclui `*.int-spec.ts`; `test:int` faz o contrário e tem timeout maior.
- Plugin **SWC** (`unplugin-swc`) para emitir metadados de decorators, que o esbuild padrão do Vitest não emite.
- **Testcontainers** apenas em `test:int`. O teste de fumaça usa a mesma imagem e a mesma tag do Compose (fonte única da tag a definir no ticket) e verifica `CREATE EXTENSION vector` executando `psql` dentro do container, sem adicionar driver de Postgres ao projeto antes do E2.

### `apps/gateway`

- **Nest com `FastifyAdapter`**, esqueleto escrito à mão (sem `nest new`), `@nestjs/cli` como devDependency e `nest-cli.json` com `generateOptions.spec: false`.
- **Separação entre montar e escutar:** a inicialização é dividida em uma função que **constrói** a aplicação a partir de uma configuração e de um destino de log, e o ponto de entrada, que carrega o ambiente, chama essa função e faz o `listen`. É essa função que os testes usam (ver Decisões de teste).
- **Configuração:**
  - Schema Zod das variáveis do gateway no próprio app; o utilitário genérico de carregamento fica em `@portunus/common`.
  - Variáveis do E0: `NODE_ENV` (`development` | `test` | `production`), `HOST`, `PORT`, `LOG_LEVEL` (níveis do pino), `LOG_PRETTY` (booleano, só aceito fora de `production`) e `SHUTDOWN_TIMEOUT_MS`.
  - Erro de configuração: lista `caminho → motivo` de cada campo inválido, **sem ecoar valores**, e o processo sai com código `1`.
  - A configuração validada é registrada no container do Nest como um provider tipado; nenhum outro código lê `process.env`.
  - `.env` local carregado pelo próprio Node (`--env-file-if-exists`), sem adicionar `dotenv`.
- **Logger (dependência a confirmar):** `nestjs-pino` sobre pino.
  - Motivo: substitui o logger do Nest (os logs de bootstrap também saem em JSON) e propaga o contexto da requisição via `AsyncLocalStorage`, então um log emitido dentro de um use case no E3 já sai com `request_id` sem passar o id manualmente.
  - Alternativa descartada: o logger embutido do Fastify. Dispensa a dependência e usa o `request.id` nativo, mas os logs internos do Nest continuam fora do pino e não há propagação de contexto para serviços, que precisaria ser construída à mão.
  - O logger embutido do Fastify fica desligado, para não haver duas linhas por requisição.
  - `redact` para `req.headers.authorization`, `req.headers["x-api-key"]`, `req.headers.cookie` e `res.headers["set-cookie"]`.
  - `pino-pretty` só como devDependency, ativado apenas por `LOG_PRETTY`.
  - Corpo de requisição e de resposta **nunca** é serializado no log (invariante 5).
- **`request_id`:**
  - Header de entrada e saída: `x-request-id`.
  - Valor de entrada aceito só se tiver no máximo 128 caracteres e casar com `[A-Za-z0-9._-]`; caso contrário (ou ausente), gera um UUID v4 (`crypto.randomUUID`).
  - O id efetivo é devolvido no header de resposta, inclusive em `404` e erros.
  - Nunca vira label de métrica (invariante 6; relevante a partir do E6).
- **`GET /health` (contrato novo, a confirmar):**
  - Responde `200` com `{"status":"ok"}`, sem autenticação.
  - É um **liveness**: não verifica Postgres nem Redis, porque o gateway ainda não usa nenhum dos dois.
  - Readiness com checagem de dependências entra no épico que introduzir a primeira dependência obrigatória (E2).
  - Não fica em `/v1`, porque não faz parte da API compatível com a OpenAI.
- **Rotas inexistentes:** no E0 continuam com a resposta padrão do Nest. O formato de erro da OpenAI (invariante 10) entra no E3 com o exception filter.
- **Graceful shutdown:**
  - `enableShutdownHooks` para SIGTERM e SIGINT. O `close` do Nest fecha o servidor Fastify, que para de aceitar conexões e espera as requisições em andamento.
  - Um temporizador de segurança (`SHUTDOWN_TIMEOUT_MS`) força a saída com log de aviso se o fechamento travar.
  - Os hooks `onModuleDestroy`/`onApplicationShutdown` passam a ser o lugar padrão para fechar conexões nos próximos épicos.

### Bibliotecas

- `@portunus/common`: utilitário de carregamento de configuração com Zod (genérico sobre o schema), com o erro de configuração legível.
- `@portunus/telemetry`, `@portunus/events`, `@portunus/database`: pacotes compiláveis com ponto de entrada vazio. Ganham conteúdo no E6, no E11 e no E2, respectivamente.

### Infra local

- Perfil `core` com **Postgres + pgvector** (imagem oficial `pgvector/pgvector` com tag fixa de major do Postgres) e **Redis** (tag fixa).
- Healthchecks (`pg_isready`, `redis-cli ping`), volumes nomeados, credenciais de desenvolvimento e portas do host parametrizadas com padrão.
- O gateway roda no host via `pnpm dev` no E0. O serviço do gateway, o mock (E1) e o RabbitMQ (E11) entram no perfil `core` nos seus épicos.

### CI

- Um workflow `ci` disparado em `pull_request` e em `push` na `main`.
- `permissions: contents: read`, `concurrency` com `cancel-in-progress`, actions fixadas por SHA.
- Node a partir do `.nvmrc`, pnpm via `pnpm/action-setup` (lê `packageManager`), cache do store do pnpm, `pnpm install --frozen-lockfile`.
- Jobs: **quality** (typecheck, lint, format:check, test) e **integration** (test:int, no runner Ubuntu, que já tem Docker).
- Branch protection na `main` exigindo os dois jobs, PR obrigatório e squash merge. É configurado no GitHub (não no código) e documentado no README.

### Scripts raiz

`dev`, `build`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:int`.

- `db:generate` e `db:migrate` ficam para o E2, quando o Drizzle entrar. A seção de comandos do CLAUDE.md é ajustada para refletir isso.

### ADRs

- **008 — Fastify em vez de Express no NestJS:** status "A validar"; contexto, decisão e a medição prevista para o E3 (k6, overhead do gateway contra o mock).
- **011 — Resolução de pacotes do workspace:** a opção escolhida na tabela acima.

### Dependências novas (precisam de aprovação antes da instalação)

- **Raiz (ferramentas compartilhadas):** `typescript`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-config-prettier`, `prettier`, `vitest`, `unplugin-swc`, `@swc/core`, `testcontainers`, `@types/node`.
- **Gateway:** `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-fastify`, `reflect-metadata`, `rxjs`, `zod`, `nestjs-pino`, `pino`, `pino-http`; dev: `@nestjs/cli`, `pino-pretty`.
- **`@portunus/common`:** `zod`.

## Decisões de teste

### O que é um bom teste aqui

- Testa **comportamento observável na fronteira**: o que uma requisição HTTP devolve, o que aparece no log, se a aplicação sobe ou não. Não testa qual método interno foi chamado nem como o módulo do Nest está montado.
- Não depende de rede real, porta fixa nem ordem de execução. Cada teste constrói a própria instância da aplicação e a fecha ao final.
- Sem `setTimeout` real para testar o shutdown: o prazo é injetado pela configuração e os testes usam um valor pequeno ou fake timers.

### Seams

1. **Seam principal: a função que constrói a aplicação do gateway.** Ela recebe uma configuração (ou um ambiente cru, para testar a validação) e um destino de log em memória, e devolve a aplicação pronta, sem escutar porta. Os testes chamam as rotas com o `inject` do Fastify, que injeta a requisição em memória. Cobre:
   - `GET /health` → `200`, corpo `{"status":"ok"}`, header `x-request-id` presente;
   - `x-request-id` válido enviado é devolvido igual; inválido (longo demais, caracteres proibidos) é substituído por um UUID;
   - a linha de log da requisição é JSON válido, contém o `request_id` devolvido e mostra `authorization`/`x-api-key`/`cookie` redigidos;
   - nenhum log contém o corpo da requisição;
   - ambiente inválido (porta não numérica, `LOG_LEVEL` desconhecido, `LOG_PRETTY` em produção) → a construção falha com um erro que nomeia cada campo e não contém os valores enviados;
   - ambiente vazio → a aplicação sobe com os padrões;
   - fechar a aplicação com uma requisição em andamento deixa a requisição terminar.
2. **Seam de integração: Testcontainers.** Um único teste de fumaça que sobe a imagem do Postgres + pgvector e cria a extensão `vector`. Prova o ferramental (Docker, Testcontainers, CI) e a tag da imagem, não comportamento do gateway.

O utilitário de configuração de `@portunus/common` é exercitado pelo seam 1. Ele só ganha testes próprios se crescer além de "parse + formatar erro", para não criar um segundo seam sem necessidade.

### Fora dos testes automatizados (verificação manual documentada)

- **SIGTERM real no processo:** no Windows, `SIGTERM` não é entregue como sinal (o processo é encerrado à força), então o teste automatizado com sinal real não seria confiável na máquina de desenvolvimento. O comportamento é coberto pelo `close` no seam 1 e verificado manualmente com `Ctrl+C` (SIGINT) local e, se quiser, com `kill -TERM` num container ou no WSL.
- `curl /health` com o Compose `core` de pé (verificação obrigatória do CLAUDE.md §5).

### Prior art

Não há testes no repositório; esta spec estabelece o padrão. Referências: [docs/estudos/31-testes-vitest-e-testcontainers.md](../../estudos/31-testes-vitest-e-testcontainers.md) e a receita de SWC da documentação do NestJS.

## Fora de escopo

- Qualquer rota de negócio (`/v1/chat/completions`, admin, async).
- Banco com tabelas, Drizzle, drizzle-kit, migrations e os scripts `db:*` (E2).
- Formato de erro da OpenAI, exception filter e pipe de validação Zod para requisições (E3).
- Limite de tamanho de corpo configurado por rota (E3, junto com a primeira rota com corpo).
- Readiness com checagem de dependências (E2).
- OpenTelemetry, `trace_id` nos logs, métricas e envio ao Loki (E6).
- `apps/mock-provider` e o serviço do mock no Compose (E1).
- RabbitMQ, Elasticsearch e os perfis `search`, `observability` e `full` do Compose.
- Dockerfile e imagem do gateway.
- Orquestrador de tarefas (Turborepo, Nx), hooks de pre-commit (husky, lint-staged) e commitlint.
- Detecção de ciclos de import dentro de um mesmo pacote.
- README completo (só o mínimo de "como rodar"; o README cresce a cada marco).

## Notas

### Pontos que um dev pleno não pode deixar passar neste épico

- **Resolução de módulos:** cada ferramenta (tsc, Vitest, Node, ESLint com type-check) resolve pacotes de um jeito. Validar o import de `@portunus/common` nos quatro antes de seguir.
- **`emitDecoratorMetadata`:** sem o SWC no Vitest, a injeção de dependência do Nest falha em silêncio (o provider chega `undefined`), não com um erro claro.
- **`request_id` vindo do cliente é entrada não confiável:** sem validação, vira vetor de injeção de log.
- **Redação antes de existir auth:** a redação de `authorization` precisa existir antes do E2, porque o primeiro log com chave de API seria o vazamento.
- **Shutdown no Windows:** o sinal que funciona localmente é o SIGINT; o SIGTERM só pode ser exercitado de verdade em Linux (CI, container, WSL).
- **Cache do CI:** o cache do store do pnpm é indexado pelo hash do lockfile; sem `--frozen-lockfile`, o CI pode "consertar" o lockfile em vez de falhar.

### Decisões a confirmar na revisão desta spec

1. Estratégia de resolução de pacotes: **opção C** (ADR 011).
2. Logger: **`nestjs-pino`** em vez do logger embutido do Fastify.
3. Contrato do `GET /health` (liveness, `{"status":"ok"}`, fora de `/v1`) e do header `x-request-id`.
4. Lista de dependências novas.

### Tickets

A sequência de tickets, com dependências e definição de pronto, está em [tickets/README.md](./tickets/README.md).

Ao abrir o épico, atualizar o status do E0 na tabela do [ROADMAP.md §3](../../../ROADMAP.md) para `Em andamento`.
