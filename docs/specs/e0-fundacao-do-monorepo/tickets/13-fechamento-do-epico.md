# 13: Fechamento do épico

**O que construir:** a demo do E0 funciona de ponta a ponta para alguém que acabou de clonar o repositório. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm test:int` passam localmente e no CI. Com o Compose `core` de pé e `pnpm dev`, `curl /health` responde `200`, e o log mostra a linha JSON com o `request_id` da chamada. A documentação descreve o que existe de verdade.

**Bloqueado por:** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12

**Status:** done

## Critérios de aceite

- [x] Demo executada num clone limpo, com a saída registrada no PR.
- [x] README mínimo: o que é o projeto (um parágrafo), pré-requisitos e "como rodar".
- [x] Seção de comandos do CLAUDE.md conferida contra os scripts do `package.json` raiz; os `db:*` ficam marcados como E2.
- [x] Os ADRs 008 e 011 constam na tabela do ARQUITETURA.md §14.
- [x] Status do E0 em `Concluído` na tabela do ROADMAP.md §3.
- [x] Resumo do épico: o que foi entregue, o que aprendemos, desvios em relação à spec e o que o E1 herda.
