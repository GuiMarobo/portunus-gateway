# 03: Testes unitários pelo seam do app

**O que construir:** `pnpm test` roda os testes unitários do monorepo com Vitest, sem Docker, e o primeiro teste exercita o gateway pelo seam principal da spec. O teste constrói a aplicação em memória, chama `GET /health` com o `inject` do Fastify (sem abrir porta) e verifica a resposta. O Vitest compila com SWC, para que os decorators do Nest tenham os metadados que a injeção de dependência exige.

**Bloqueado por:** 02

**Status:** done

**Leitura:** [estudos/31 — Testes, Vitest e Testcontainers](../../../estudos/31-testes-vitest-e-testcontainers.md)

**Antes de começar:** confirmar as dependências `vitest`, `unplugin-swc` e `@swc/core`.

## Critérios de aceite

- [x] Vitest configurado na raiz com o plugin SWC emitindo metadados de decorators.
- [x] `pnpm test` inclui `*.spec.ts` e exclui `*.int-spec.ts` (o `test:int` chega no ticket 12).
- [x] Teste do `/health` pelo seam: status `200` e corpo `{"status":"ok"}`.
- [x] Cada teste constrói e fecha a própria instância da aplicação; nenhum teste depende de porta, rede ou ordem de execução.
- [x] `pnpm test` roda sem nenhum build prévio.
- [x] Seção de comandos do CLAUDE.md atualizada.

## Pontos de atenção

- Por que o esbuild (padrão do Vitest) não emite `design:paramtypes` e o que acontece com a injeção de dependência sem ele: o provider chega `undefined` em silêncio. O ticket 07 traz o primeiro provider injetado e prova isso de verdade.
- Fechar a aplicação no fim de cada teste, para não deixar handles abertos que fazem o Vitest ficar pendurado.
