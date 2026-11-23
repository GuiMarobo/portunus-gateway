# Portunus Gateway

Gateway compatível com a API da OpenAI que fica entre as aplicações e os provedores de LLM, concentrando num único ponto o controle de custo, cache, limites, resiliência, observabilidade e avaliação de qualidade. É um projeto de aprendizado: o objetivo é construir, passo a passo e com cada decisão registrada, o tipo de sistema que um dev pleno encontra em produção. O porquê está em [CONTEXT.md](./CONTEXT.md), o como em [ARQUITETURA.md](./ARQUITETURA.md) e o andamento em [ROADMAP.md](./ROADMAP.md).

> **Estado atual (E1 concluído):** monorepo, ferramental de qualidade, CI, um gateway que responde `GET /health` com logs JSON e `x-request-id`, e o **provedor mock** ([apps/mock-provider](./apps/mock-provider/README.md)): imita a API da OpenAI com respostas determinísticas e falhas sob demanda. Ainda não há rota de inferência no gateway; ela chega no E3.

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

O perfil `core` também sobe o provedor mock na porta 3001. Para vê-lo falar com o SDK oficial da OpenAI, incluindo cada falha simulada (`429`, `500`, `503`, timeout e stream cortado):

```bash
curl -s localhost:3001/health
pnpm --filter @portunus/mock-provider demo
```

Como forçar falhas por requisição (header `x-mock-scenario`, prefixo de caminho ou ambiente) está no [README do mock](./apps/mock-provider/README.md).

- **Porta ocupada:** se 5432, 6379 ou 3001 já estiverem em uso, suba o Compose com `POSTGRES_HOST_PORT=55432`, `REDIS_HOST_PORT=56379` ou `MOCK_HOST_PORT=3101` (e passe a URL à demo: `pnpm --filter @portunus/mock-provider demo http://localhost:3101/v1`).
- **Encerrar:** `Ctrl+C` no `pnpm dev` dispara o graceful shutdown; `docker compose -f infra/docker-compose.yml --profile core down` derruba a infra (`-v` apaga os volumes).

A lista completa de comandos está na seção 2 do [CLAUDE.md](./CLAUDE.md).

## CI e proteção da `main`

O workflow [ci](./.github/workflows/ci.yml) roda em todo PR e em todo push na `main`, com dois jobs: `quality` (typecheck, lint, format:check, test, build) e `integration` (test:int). A proteção da `main` é configurada no GitHub, não no código: PR obrigatório, squash merge e os jobs `quality` e `integration` como checks exigidos. Renomear um job solta a proteção sem aviso, então o nome do job faz parte do contrato.
