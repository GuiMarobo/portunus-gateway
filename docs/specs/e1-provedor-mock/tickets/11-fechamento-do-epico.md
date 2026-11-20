# 11: Fechamento do épico

**O que construir:** a demo do critério de pronto do roadmap rodando num clone limpo: um script com o SDK oficial da OpenAI, apontado para o mock do Compose, recebe uma resposta normal, um stream com o chunk final de `usage`, um embedding e cada um dos erros configurados (`429` com `Retry-After`, `500`, `503`, timeout e stream cortado). A documentação passa a refletir o mock, e a spec ganha a seção de fechamento.

**Bloqueado por:** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10

**Status:** ready-for-agent

## Critérios de aceite

- [ ] Um script de demo com o SDK oficial cobre todos os casos do critério de pronto e imprime o resultado de cada um.
- [ ] A demo é executada num clone limpo, e a saída fica registrada em `.scratch/e1-provedor-mock/`.
- [ ] README do mock com: o que é, como rodar (host e Compose), as variáveis de ambiente, a gramática do cenário com exemplos de `curl` e do SDK, a regra de tokens e a escolha de Fastify puro com a justificativa.
- [ ] README raiz e seção de comandos do CLAUDE.md atualizados.
- [ ] Status do E1 na tabela do ROADMAP.md §3 como `Concluído`.
- [ ] Seção "Fechamento do épico" na spec: o que foi entregue, o que aprendemos, os desvios em relação à spec e o que o E3 herda.
- [ ] Verificação completa: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm test:int` e a demo, todos com o resultado real reportado.

## Pontos de atenção

- Registrar no fechamento, como pendência para um épico futuro: alinhar o `@types/node` à versão do runtime (Node 22). Hoje o `overrides` do `pnpm-workspace.yaml` fixa `@types/node` em `26.6.6`, a versão que já chegava pelo vitest/vite, para o `@types/node@18` trazido pelo `testcontainers` (via `@types/ssh2`) não quebrar os tipos de `Response.body` no mock (decidido no ticket 10).
