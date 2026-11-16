# ADR 008 — Fastify em vez de Express no NestJS

- **Status:** A validar
- **Data:** 2026-11-16

## Contexto

O gateway fica no caminho de toda chamada de inferência, então o overhead que ele adiciona entre a aplicação e o provedor aparece diretamente na latência percebida. O NestJS aceita dois adapters de servidor HTTP: o Express (padrão) e o Fastify (`@nestjs/platform-fastify`).

Ambos atendem à API necessária (rotas, validação, streaming de SSE, hooks de ciclo de vida). A diferença está no desempenho do roteamento e no custo por requisição, e no modelo de plugins e de logs do próprio framework HTTP. O projeto também precisa de logs estruturados por requisição (pino) e de um `request_id` propagado, que o Fastify expõe de forma nativa.

## Decisão

Usar o adapter **Fastify** (`FastifyAdapter`) no `apps/gateway`, mantendo a camada Nest (módulos, controllers, injeção de dependência) por cima.

Ponto de partida desta decisão: é uma escolha por desempenho e pelo modelo de hooks do Fastify, ainda não medida neste projeto. Por isso o status é "A validar".

## Alternativas consideradas

- **Express (adapter padrão do Nest):** mais documentação, mais exemplos e mais middlewares prontos. Descartado como padrão porque o roteamento e o overhead por requisição ficam atrás do Fastify, e o gateway é sensível a esse custo.
- **Fastify puro, sem Nest:** máximo controle e menos camadas. Descartado porque o projeto quer a organização em módulos e a injeção de dependência do Nest para manter a Clean Architecture entre as camadas.

## Consequências

- O `main.ts` precisa de `FastifyAdapter`, e os testes usam `app.inject` (requisição em memória do Fastify), sem abrir porta.
- Middlewares escritos para Express não funcionam direto; o plugin do Fastify é o equivalente.
- O logger embutido do Fastify fica desligado; o logging é feito pelo pino (ticket de logs estruturados), para não haver duas linhas por requisição.
- Qualquer middleware de terceiros precisa ser verificado para compatibilidade com o Fastify antes de entrar.

## Medição prevista (E3)

A decisão será confirmada ou revertida no E3, com k6 apontando para o provedor mock: latência e throughput do gateway com `FastifyAdapter` contra o mesmo gateway com o adapter Express, medindo o overhead adicionado pelo gateway. O resultado será registrado neste ADR, e o status passa a "Aceito" ou a decisão é revista.
