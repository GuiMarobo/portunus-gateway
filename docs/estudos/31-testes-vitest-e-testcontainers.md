# 31 — Testes: Vitest, TDD e Testcontainers

> **Épicos:** todos (E0 monta a base).
> **Onde:** `*.spec.ts` ao lado do código (unitários), `*.int-spec.ts` (integração).

---

## 1. O problema

O gateway tem regras em que um erro custa dinheiro ou vaza dados: cálculo de custo, chave de cache com tenant, rate limit, circuit breaker. Testar só "na mão" com curl não escala nem pega regressões. Mas testes ruins (lentos, frágeis, cheios de mocks que não refletem a realidade) são quase tão ruins quanto não ter testes.

## 2. Como funciona

### 2.1 A pirâmide (e por que ela importa aqui)

```
          /\        E2E / demo contra o mock (poucos, lentos, alta confiança)
         /  \
        /----\      Integração com Testcontainers (Postgres, Redis, RabbitMQ reais)
       /      \
      /--------\    Unitários: domínio e use cases com fakes (muitos, rápidos)
```

- **Unitários:** testam regras puras e use cases com **fakes** dos ports. Milissegundos, sem Docker. É onde a Clean Architecture ([11](./11-clean-architecture-e-padroes.md)) se paga.
- **Integração:** testam os **adapters** contra a tecnologia real: a query do Drizzle no Postgres de verdade, o script Lua no Redis de verdade.
- **Ponta a ponta:** sobe o gateway e chama com o SDK da OpenAI contra o mock (a verificação obrigatória do CLAUDE.md §5).

### 2.2 TDD (Test-Driven Development)

O ciclo **red → green → refactor**:

1. **Red:** escreva um teste para o próximo comportamento; ele falha (e falha pelo motivo certo).
2. **Green:** escreva o **mínimo** de código para passar.
3. **Refactor:** melhore o código com a rede de segurança dos testes.

No projeto, TDD é obrigatório em **regras de negócio e contratos** (custo, chave de cache, rate limit, orçamento, fallback, circuit breaker, schemas de eventos). Ganhos: design guiado pelo uso, casos de borda pensados antes, e testes que de fato testam (você os viu falhar).

### 2.3 Dublês de teste (test doubles)

| Tipo      | O que é                                     | Exemplo                                            |
| --------- | ------------------------------------------- | -------------------------------------------------- |
| **Dummy** | Preenche um parâmetro, nunca é usado        | Um logger vazio                                    |
| **Stub**  | Retorna respostas prontas                   | Port de preços que sempre devolve US$ 0,15/1M      |
| **Fake**  | Implementação funcional simplificada        | `InMemoryExactCache` com um `Map`                  |
| **Spy**   | Registra como foi chamado                   | Verificar que o evento foi publicado uma vez       |
| **Mock**  | Expectativas pré-programadas sobre chamadas | Usar com moderação: acopla o teste à implementação |

Prefira **fakes** dos ports a mocks de bibliotecas: testam comportamento, não detalhes.

### 2.4 Vitest

Framework de testes moderno, com API compatível com a do Jest (`describe`, `it`, `expect`, `vi.fn()`):

- Rápido (transformação com esbuild, execução paralela, _watch_ inteligente).
- Suporte nativo a TypeScript.
- **Por que o plugin SWC?** O NestJS depende de `emitDecoratorMetadata` (metadados de tipo dos decorators, usados pela DI). O esbuild não emite esses metadados; o SWC sim. Sem o plugin, a injeção de dependência quebra nos testes.
- **Fake timers** (`vi.useFakeTimers()`): essenciais para testar backoff, TTL, janelas de rate limit e o circuit breaker sem esperar de verdade.

### 2.5 Testcontainers

Biblioteca que **sobe containers Docker de verdade a partir do código do teste** e os destrói no fim:

```ts
const postgres = await new PostgreSqlContainer('pgvector/pgvector:pg17').start();
const db = createDb(postgres.getConnectionUri());
await migrate(db);
// ... testes contra um Postgres real com pgvector ...
await postgres.stop();
```

- Cada execução tem um ambiente limpo e isolado (porta aleatória, sem conflito com o Compose local).
- Testa o comportamento **real**: constraints, `ON CONFLICT`, scripts Lua, filas, extensões.
- Custo: segundos para subir; por isso fica em `pnpm test:int`, separado dos unitários.

## 3. Analogia

- **Unitário com fake:** testar o motor de um carro numa **bancada de testes** da fábrica, com combustível e sensores simulados. Rápido e repetível.
- **Integração com Testcontainers:** montar o motor num **carro de verdade numa pista fechada**. Mais lento, mas pega o que a bancada não pega (vibração real, combustível real).
- **TDD:** escrever a **ficha de inspeção** antes de montar a peça. Você sabe exatamente o que a peça precisa cumprir, e a ficha prova que ela cumpre.

## 4. Por que está nesta arquitetura

- Regras críticas (dinheiro, isolamento, resiliência) exigem testes automatizados.
- "Mock primeiro" (invariante 4): nunca chamar provedor real em teste.
- Testcontainers dá confiança de que os adapters funcionam com as tecnologias reais, sem manter um ambiente de teste compartilhado.

## 5. Ferramentas similares

| Ferramenta                                       | Categoria                    | Diferença                                                                                         |
| ------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| **Vitest**                                       | Test runner                  | Rápido, TS nativo, API Jest. **A escolha do projeto**                                             |
| **Jest**                                         | Test runner                  | O mais usado historicamente; padrão do `nest new`; mais lento, configuração de TS mais trabalhosa |
| **`node:test`**                                  | Test runner nativo do Node   | Zero dependências, ecossistema menor                                                              |
| **Mocha + Chai**                                 | Runner + asserções           | Clássicos, mais montagem manual                                                                   |
| **Testcontainers**                               | Dependências reais em Docker | Programático, isolado. **A escolha do projeto**                                                   |
| **Docker Compose para testes**                   | Dependências reais           | Ambiente compartilhado entre testes, estado vaza entre execuções                                  |
| **Bancos em memória** (`pg-mem`, `ioredis-mock`) | Simulações                   | Rápidos, mas **não** se comportam como o real (extensões, Lua, locks)                             |
| **Supertest / `app.inject()` do Fastify**        | Testes HTTP                  | Chamar rotas sem subir uma porta real                                                             |
| **Pact**                                         | Testes de contrato           | Verifica que consumidor e provedor concordam sobre a API                                          |

## 6. Armadilhas

- **Testar implementação em vez de comportamento** (mocks verificando cada chamada interna): qualquer refatoração quebra tudo.
- **Testes dependentes de ordem** ou de estado compartilhado.
- **Tempo real em testes** (`setTimeout` de 5 s): use fake timers.
- **Testes flaky** (passam às vezes): são piores que nenhum teste, porque ensinam o time a ignorar falhas.
- **Cobertura como meta:** 100% de linhas cobertas não significa que os casos de borda foram testados.
- **Testcontainers no CI** exige Docker disponível no runner (o GitHub Actions tem).
- **Esquecer de testar o caminho de falha** (Redis fora, provedor 503, evento duplicado), justamente o que mais importa neste projeto.

## 7. No Portunus

- `pnpm test`: unitários (Vitest + SWC).
- `pnpm test:int`: integração com Testcontainers (Postgres + pgvector, Redis, RabbitMQ).
- TDD obrigatório nas regras listadas no CLAUDE.md §5.

## 8. Para aprofundar

- Vitest — documentação: https://vitest.dev/
- NestJS — _Testing_ (e a receita com SWC): https://docs.nestjs.com/recipes/swc
- Testcontainers for Node.js: https://node.testcontainers.org/
- Martin Fowler — _Mocks Aren't Stubs_: https://martinfowler.com/articles/mocksArentStubs.html
- Livro: _Test-Driven Development: By Example_ (Kent Beck)
