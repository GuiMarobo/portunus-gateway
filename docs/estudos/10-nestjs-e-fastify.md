# 10 — NestJS e Fastify

> **Épicos:** E0 (esqueleto), E3 em diante (toda rota).
> **Onde:** `apps/gateway`, `apps/consumers`.
> **ADR:** 008 (Fastify em vez de Express).

---

## 1. O problema

Um servidor HTTP "cru" em Node resolve rotas, mas não organiza o código: onde fica a autenticação, como trocar uma implementação por um mock no teste, como aplicar validação em todas as rotas, como transformar exceções em respostas. Sem estrutura, cada dev resolve de um jeito e o projeto vira uma colcha de retalhos.

## 2. Como funciona

### 2.1 Duas camadas

- **Fastify** é o **servidor HTTP**: recebe a conexão, faz o parsing, roteia e serializa a resposta.
- **NestJS** é o **framework de aplicação** por cima: organiza o código em módulos, injeta dependências e define um ciclo de vida da requisição. O Nest roda sobre Express (padrão) ou Fastify (via `@nestjs/platform-fastify`).

### 2.2 Injeção de dependência (DI)

No Nest, classes declaram o que precisam no construtor e o **contêiner de DI** monta tudo:

```ts
@Injectable()
export class LookupCacheUseCase {
  constructor(@Inject(EXACT_CACHE_PORT) private readonly cache: ExactCachePort) {}
}
```

No `cache.module.ts`, o módulo diz qual implementação atende ao port:

```ts
providers: [{ provide: EXACT_CACHE_PORT, useClass: RedisExactCacheAdapter }]
```

No teste, troca-se por um fake. É assim que a Clean Architecture ([11](./11-clean-architecture-e-padroes.md)) se conecta ao Nest: o domínio define a interface e o módulo liga ao adapter.

> Inversão de controle (IoC): você não cria suas dependências; alguém as entrega. Isso facilita testes e trocas de implementação.

### 2.3 Módulos

Um `@Module` agrupa controllers e providers de um domínio (`cache`, `auth`...) e declara o que **exporta** para outros módulos. Ele cria fronteiras explícitas.

### 2.4 O ciclo de vida de uma requisição

```
Middleware → Guards → Interceptors (antes) → Pipes → Handler do controller
→ Interceptors (depois) → Exception filters (se algo lançou erro)
```

| Peça | Papel | Uso no gateway |
|---|---|---|
| **Middleware** | Antes de tudo, baixo nível | Gerar `request_id` |
| **Guard** | Decide se a requisição pode seguir | Autenticação por API key |
| **Interceptor** | Envolve o handler (antes e depois) | Métricas de duração, headers de diagnóstico |
| **Pipe** | Transforma e valida a entrada | Pipe de validação com Zod |
| **Exception filter** | Converte exceções em resposta | Erros no formato da OpenAI |

### 2.5 Fastify por dentro

- Roteamento com uma **radix tree** (`find-my-way`): encontrar a rota custa O(k) no tamanho do caminho, e não O(número de rotas).
- **Serialização com schema:** se você declara o schema da resposta, o Fastify gera um serializador JSON especializado, mais rápido que `JSON.stringify`.
- **Plugins encapsulados** e **hooks** (`onRequest`, `preHandler`, `onSend`...).
- Em benchmarks, costuma servir várias vezes mais requisições por segundo que o Express, com menos overhead por requisição.

## 3. Analogia

- **Fastify** é a **rede elétrica e o encanamento** do prédio: fazem a energia e a água chegarem rápido.
- **NestJS** é a **planta do prédio e o regulamento do condomínio**: cada andar (módulo) tem sua função, a portaria (guard) confere quem entra, o porteiro (pipe) revista o que é trazido e o síndico (exception filter) padroniza como os problemas são comunicados aos moradores.
- **DI** é como o condomínio **contratar a empresa de limpeza**: o morador não escolhe nem contrata ninguém; recebe o serviço pronto. No teste, você "troca a empresa" sem mudar o morador.

## 4. Por que está nesta arquitetura

- **NestJS** dá estrutura, DI e um ciclo de vida claro, o que encaixa naturalmente com camadas e ports/adapters.
- **Fastify** porque o gateway é uma camada **a mais** entre o cliente e o provedor: overhead por requisição importa (meta p95 < 20 ms). ADR 008, a ser confirmado com medição no E3.

## 5. Ferramentas similares

| Framework | Diferença principal | Quando escolher |
|---|---|---|
| **Express** | O mais usado; simples; mais lento; middlewares em cadeia | Projetos pequenos, máxima compatibilidade |
| **Fastify (puro)** | Rápido, schemas, plugins; sem DI nem camadas | Serviços enxutos sem precisar de framework de aplicação |
| **Koa** | Minimalista, middlewares com async/await | Quem quer montar tudo à mão |
| **Hono** | Ultraleve, roda em edge (Cloudflare Workers, Bun, Deno) | Edge e serverless |
| **AdonisJS** | Full-stack "batteries included" (ORM, auth) estilo Laravel | Aplicações web completas |
| **tRPC** | RPC tipado entre front e back TypeScript | Monorepo full-stack TS; não serve para API compatível com OpenAI |
| **Spring Boot (Java), ASP.NET Core (C#)** | Mesma filosofia de DI e módulos do Nest em outras linguagens | Ecossistemas JVM/.NET; o Nest foi inspirado neles e no Angular |

## 6. Armadilhas

- **Escopo de providers:** o padrão é *singleton*. Um provider `REQUEST`-scoped é recriado a cada requisição e "contamina" quem depende dele, com custo de performance. Prefira passar contexto explicitamente.
- **Lógica no controller:** controller só traduz HTTP → use case. A regra de negócio fica na `application/` e no `domain/`, para ser reutilizada pelo worker assíncrono.
- **Diferenças Express × Fastify:** muitos exemplos e bibliotecas do Nest assumem Express (`req`, `res`). Middlewares e manipulação de resposta (especialmente streaming) mudam.
- **Decorators e metadados** exigem `emitDecoratorMetadata`; o esbuild (usado pelo Vitest) não emite, daí o plugin SWC nos testes.
- **Graceful shutdown:** chamar `enableShutdownHooks()` e fechar conexões (Redis, Postgres, RabbitMQ) ao receber SIGTERM.

## 7. No Portunus

- E0: `main.ts` com `FastifyAdapter`, `GET /health`.
- E2: guard de API key. E3: pipe Zod e exception filter no formato OpenAI. E6: interceptors de métricas.
- Os módulos `auth`, `cache`, `routing`... seguem a estrutura em camadas.

## 8. Para aprofundar

- NestJS — documentação (comece por *Fundamentals → Custom providers* e *Request lifecycle*): https://docs.nestjs.com/
- NestJS — *Performance (Fastify)*: https://docs.nestjs.com/techniques/performance
- Fastify — documentação: https://fastify.dev/docs/latest/
- Martin Fowler — *Inversion of Control Containers and the Dependency Injection pattern*: https://martinfowler.com/articles/injection.html
