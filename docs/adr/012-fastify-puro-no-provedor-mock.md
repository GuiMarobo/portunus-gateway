# ADR 012 — Fastify puro, sem Nest, no provedor mock

- **Status:** Aceito
- **Data:** 2026-11-19

## Contexto

O [ADR 008](./008-fastify-em-vez-de-express-no-nestjs.md) descartou "Fastify puro, sem Nest" para o gateway, porque o gateway precisa dos módulos e da injeção de dependência do Nest para manter a Clean Architecture entre as camadas.

O `apps/mock-provider` (E1) é outro tipo de app. É uma ferramenta de teste que imita a API da OpenAI, não tem regra de negócio a organizar em camadas e não depende de banco, fila nem cache. Ele também precisa de duas coisas que o Nest só atrapalha:

- **Não ser o gargalo da carga.** O overhead do gateway é medido como "latência via gateway − latência direta ao mock" (E3 e E16). Cada camada no mock distorce essa conta.
- **Controle direto da resposta crua.** Cortar um stream no meio, segurar a conexão sem responder e respeitar backpressure no SSE exigem acesso ao socket, que no Nest acaba descendo para o Fastify de qualquer jeito.

## Decisão

O `apps/mock-provider` usa **Fastify puro**, sem Nest. A decisão vale **só para o mock**; o gateway continua com Nest + Fastify (ADR 008).

Sem DI, a configuração validada (Zod, via `loadConfig` de `@portunus/common`) é passada por parâmetro. A montagem do app (`createMockApp`) fica separada da escuta (`bootstrapMock`), e a fonte de aleatoriedade, o relógio e o destino de log são injetados como argumentos.

## Alternativas consideradas

- **Nest + Fastify, igual ao gateway:** mesmo molde e reaproveitamento do padrão de logger e de shutdown. Descartado pelo overhead de framework num app que só gera respostas e porque o controle de stream e de socket desceria para o Fastify cru de qualquer jeito.

## Consequências

- O monorepo passa a ter dois estilos de app. O `CLAUDE.md` fala em "esqueleto de cada app Nest"; o mock é a exceção registrada aqui.
- O logger é o pino embutido do Fastify, sem `nestjs-pino`. Para ter uma linha por requisição, como no gateway, o mock usa um `LogController` próprio (Fastify ≥ 5.11) que não registra a entrada e registra só a conclusão.
- O que o gateway resolve com o container do Nest (configuração tipada, shutdown) aqui é código explícito, o que também serve de comparação didática do que o Nest faz por cima do Fastify.
- O mock em Fastify puro serve de linha de base para a medição do ADR 008: dá o custo mínimo de uma requisição HTTP na máquina.
