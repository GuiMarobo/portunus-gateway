# 10: Imagem do mock, Compose `core` e teste de integração

**O que construir:** `docker compose -f infra/docker-compose.yml --profile core up -d --wait` sobe o mock junto com Postgres e Redis, os três saudáveis. A imagem do mock é construída a partir do repositório pelo primeiro Dockerfile do projeto. `pnpm test:int` ganha um teste que constrói essa imagem com Testcontainers, espera o healthcheck e faz uma chamada de chat pelo SDK oficial.

**Bloqueado por:** 02

**Status:** in-review

**Leitura:** [estudos/33 — Docker e Compose](../../../estudos/33-docker-e-compose.md), [estudos/31 — Testes, Vitest e Testcontainers](../../../estudos/31-testes-vitest-e-testcontainers.md)

**Antes de começar:** confirmar a decisão 6 da spec (Dockerfile do mock neste épico e serviço no perfil `core`).

## Critérios de aceite

- [x] Dockerfile multi-stage: instala com `--frozen-lockfile`, compila com `tsc -b`, gera um diretório de produção só com o mock e suas dependências (`pnpm deploy`), e a imagem final é Node 22 slim rodando com usuário não root.
- [x] Um `.dockerignore` mantém `node_modules`, `dist`, `.git` e `.env` fora do contexto de build.
- [x] A imagem base tem tag fixa, definida em `infra/.env` junto das outras.
- [x] O serviço `mock-provider` está nos perfis `core` e `full`, com a porta do host parametrizada (`MOCK_HOST_PORT`) e presa em `127.0.0.1`.
- [x] O healthcheck chama `/health` com o próprio Node (a imagem slim não tem `curl`), e `docker compose ps` mostra o mock como `healthy`.
- [x] O teste de integração constrói a imagem pelo Dockerfile, espera o healthcheck e recebe uma chat completion pelo SDK.
- [x] O job `integration` do CI roda esse teste.
- [x] A seção de comandos do CLAUDE.md está atualizada.

## Pontos de atenção

- O contexto de build é a raiz do monorepo (o mock depende de `@portunus/common` e do lockfile), mas a imagem final só leva o mock.
- A ordem das camadas no Dockerfile define o cache: copiar o lockfile e os manifests antes do código-fonte.
- Construir a imagem dentro do teste é lento. Conferir o timeout do `test:int` e o tempo do job no CI.
