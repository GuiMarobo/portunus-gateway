# 01: Mock responde `GET /health`

**O que construir:** o pacote `@portunus/mock-provider` passa a existir como app do workspace. `pnpm --filter @portunus/mock-provider dev` sobe o mock no host, e `curl /health` responde `200` com `{"status":"ok"}`. A configuração é validada com Zod na inicialização, os logs saem em JSON (pino) e a montagem do app fica separada da escuta, para os testes chamarem a função de montagem numa porta efêmera.

**Bloqueado por:** nenhum (pode começar imediatamente)

**Status:** in-review

**Leitura:** [estudos/10 — NestJS e Fastify](../../../estudos/10-nestjs-e-fastify.md), [estudos/12 — Validação com Zod](../../../estudos/12-validacao-com-zod.md), [estudos/28 — Logs, pino e Loki](../../../estudos/28-logs-pino-e-loki.md)

**Antes de começar:** confirmar a decisão 1 da spec (Fastify puro, sem Nest) e as dependências `fastify`, `zod`, `@portunus/common` e `pino-pretty` (dev).

## Critérios de aceite

- [x] O pacote `@portunus/mock-provider` tem `package.json`, `tsconfig.json`, `tsconfig.build.json` e `vitest.config.mts` no formato do gateway (ADR 011), com scripts `dev`, `build`, `start`, `typecheck` e `test`.
- [x] `pnpm typecheck`, `pnpm build`, `pnpm lint` e `pnpm test` da raiz incluem o mock sem nenhuma mudança extra nos scripts da raiz.
- [x] Uma função monta o app a partir de um ambiente cru, um destino de log, uma fonte de aleatoriedade e um relógio, sem escutar porta. O ponto de entrada valida o ambiente e chama `listen`.
- [x] Variáveis do mock (as da spec) validadas com `loadConfig`. Com o ambiente inválido, o processo sai com código `1` listando cada campo e o motivo, sem ecoar valores. Com o ambiente vazio, sobe com os padrões. (Entram aqui as variáveis que este ticket usa: `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL` e `LOG_PRETTY`. Cada `MOCK_*` e o `SHUTDOWN_TIMEOUT_MS` entram no ticket que os usa: 02, 04, 05, 07, 08 e 09.)
- [x] A porta padrão é diferente da do gateway, para os dois rodarem juntos no host.
- [x] `GET /health` responde `200` com `{"status":"ok"}`.
- [x] O log da requisição sai em JSON de uma linha com método, rota, status e tempo, sem corpo e com `authorization` redigido. `LOG_PRETTY` só é aceito fora de `production`.
- [x] `.env.example` do mock com todas as variáveis aceitas, coberto por um teste como o do gateway.
- [x] Os testes usam a função de montagem com porta efêmera (`0`) em `127.0.0.1` e fecham o app ao final.

## Pontos de atenção

- O logger embutido do Fastify já é pino. Não precisa de `nestjs-pino` nem de um segundo logger.
- Fastify puro não tem DI: a configuração validada é passada para quem precisa por parâmetro, sem ninguém ler `process.env` diretamente.
- O mock é o primeiro app sem Nest. Conferir se a regra de camadas do ESLint não acusa nada indevido.
