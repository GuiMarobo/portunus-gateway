# 02: Gateway responde `GET /health`

**O que construir:** o tracer bullet do épico. Um `apps/gateway` mínimo em NestJS com o adapter Fastify sobe com `pnpm dev`, e `curl http://localhost:3000/health` responde `200` com `{"status":"ok"}`. O mesmo app compila com `pnpm build` e roda a partir do JavaScript gerado. `pnpm typecheck` verifica o monorepo inteiro com TypeScript strict.

**Bloqueado por:** 01

**Status:** in-review

**Leitura:** [estudos/10 — NestJS e Fastify](../../../estudos/10-nestjs-e-fastify.md), [estudos/09](../../../estudos/09-monorepo-pnpm-e-typescript.md) §2.3–2.5

**Antes de começar:** confirmar as dependências (TypeScript, `@nestjs/*`, `@nestjs/platform-fastify`, `reflect-metadata`, `rxjs`, `@nestjs/cli`) e o contrato do `/health`.

## Critérios de aceite

- [x] Configuração base de TypeScript na raiz com `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `experimentalDecorators`, `emitDecoratorMetadata`, saída CommonJS e alvo suportado pelo Node 22. O gateway a estende.
- [x] Pacote `@portunus/gateway` escrito à mão (sem `nest new`), com `@nestjs/cli` como devDependency e `nest-cli.json` com `generateOptions.spec: false`.
- [x] A construção da aplicação (montar o Nest com Fastify) fica separada do ponto de entrada que faz o `listen`. Essa separação é o seam de teste do ticket 03.
- [x] `GET /health` → `200`, corpo `{"status":"ok"}`, sem autenticação e fora de `/v1`.
- [x] Porta e host vêm de constantes nomeadas (a configuração validada entra no ticket 07).
- [x] Scripts raiz `dev`, `build` e `typecheck` funcionando; `node` sobre o build responde `/health`.
- [x] ADR 008 (Fastify em vez de Express no NestJS) registrado com status "A validar" e a medição prevista para o E3.
- [x] Seção de comandos do CLAUDE.md em sincronia com os scripts criados.

## Pontos de atenção

- `reflect-metadata` precisa ser carregado antes de qualquer decorator ser avaliado.
- O Fastify escuta só em `127.0.0.1` por padrão; dentro de um container isso faria o app parecer fora do ar. Deixar o host explícito.
- Explicar o ciclo de vida do Nest (módulo → controller → provider) e o que o adapter Fastify muda em relação ao Express.
