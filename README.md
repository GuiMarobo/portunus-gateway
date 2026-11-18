# Portunus Gateway

Gateway compatível com a API da OpenAI que fica entre as aplicações e os provedores de LLM, concentrando num único ponto o controle de custo, cache, limites, resiliência, observabilidade e avaliação de qualidade. É um projeto de aprendizado: o objetivo é construir, passo a passo e com cada decisão registrada, o tipo de sistema que um dev pleno encontra em produção. O porquê está em [CONTEXT.md](./CONTEXT.md), o como em [ARQUITETURA.md](./ARQUITETURA.md) e o andamento em [ROADMAP.md](./ROADMAP.md).

> **Estado atual (E0 concluído):** monorepo, ferramental de qualidade, CI e um gateway que responde `GET /health` com logs JSON e `x-request-id`. Ainda não há rota de inferência; ela chega no E3.

## Pré-requisitos

- **Node 22** (versão exata em [.nvmrc](./.nvmrc)). Com outra versão, `pnpm install` falha de propósito (`engineStrict`). Com nvm: `nvm install && nvm use`.
- **pnpm** na versão de `packageManager` do [package.json](./package.json), ativado pelo Corepack: `corepack enable`.
- **Docker** com Compose v2, para a infra local e para `pnpm test:int` (Testcontainers).

## Como rodar

```bash
pnpm install --frozen-lockfile

pnpm typecheck
pnpm lint
pnpm test        # unitários, sem Docker
pnpm test:int    # integração, exige Docker

docker compose -f infra/docker-compose.yml --profile core up -d --wait
cp apps/gateway/.env.example apps/gateway/.env
pnpm dev
```

Em outro terminal:

```bash
curl -i localhost:3000/health
# HTTP/1.1 200 OK
# x-request-id: <uuid>
# {"status":"ok"}
```

O terminal do `pnpm dev` mostra uma linha JSON `request completed` com o mesmo `request_id` devolvido no header. Envie `-H "x-request-id: meu-id"` para ver o id ecoado.

- **Porta ocupada:** se 5432 ou 6379 já estiverem em uso, suba o Compose com `POSTGRES_HOST_PORT=55432` ou `REDIS_HOST_PORT=56379`.
- **Encerrar:** `Ctrl+C` no `pnpm dev` dispara o graceful shutdown; `docker compose -f infra/docker-compose.yml --profile core down` derruba a infra (`-v` apaga os volumes).

A lista completa de comandos está na seção 2 do [CLAUDE.md](./CLAUDE.md).

## CI e proteção da `main`

O workflow [ci](./.github/workflows/ci.yml) roda em todo PR e em todo push na `main`, com dois jobs: `quality` (typecheck, lint, format:check, test, build) e `integration` (test:int). A proteção da `main` é configurada no GitHub, não no código: PR obrigatório, squash merge e os jobs `quality` e `integration` como checks exigidos. Renomear um job solta a proteção sem aviso, então o nome do job faz parte do contrato.
