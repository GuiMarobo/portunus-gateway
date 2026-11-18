# 12: Compose `core` e testes de integração

**O que construir:** `docker compose -f infra/docker-compose.yml --profile core up -d` sobe Postgres com pgvector e Redis, ambos saudáveis. `pnpm test:int` roda os testes de integração com Testcontainers, e o primeiro deles prova que a mesma imagem do Compose sobe e aceita `CREATE EXTENSION vector`. O CI ganha um job `integration` que roda o `test:int` e passa a ser exigido na proteção da `main`.

**Bloqueado por:** 05

**Status:** in-review

**Leitura:** [estudos/33 — Docker e Compose](../../../estudos/33-docker-e-compose.md), [estudos/31 — Testes, Vitest e Testcontainers](../../../estudos/31-testes-vitest-e-testcontainers.md)

**Antes de começar:** confirmar a dependência `testcontainers`.

## Critérios de aceite

- [x] Perfil `core` com Postgres + pgvector e Redis, imagens com tag fixa (nunca `latest`).
- [x] Healthchecks nos dois serviços; `docker compose ps` mostra ambos como `healthy`.
- [x] Volumes nomeados, credenciais só de desenvolvimento e portas do host parametrizadas com padrão.
- [x] `pnpm test:int` inclui só `*.int-spec.ts`, com timeout maior que o dos unitários.
- [x] Teste de fumaça com Testcontainers: a imagem do Postgres sobe e `CREATE EXTENSION vector` funciona, via `psql` dentro do container (sem driver de Postgres no projeto).
- [x] A tag da imagem tem uma única fonte usada pelo Compose e pelo teste, ou a duplicação é justificada no PR.
- [ ] Job `integration` no CI rodando `test:int`, exigido na proteção da `main`.
- [x] Seção de comandos do CLAUDE.md atualizada.

## Pontos de atenção

- `depends_on` sem healthcheck só espera o container iniciar, não ficar pronto.
- Testcontainers no Windows depende do Docker Desktop; no CI, o runner Ubuntu já tem Docker.
- Portas em conflito com Postgres ou Redis instalados na máquina.
