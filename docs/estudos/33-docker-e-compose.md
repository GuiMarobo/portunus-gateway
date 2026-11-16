# 33 — Docker e Docker Compose

> **Épicos:** E0 (perfil `core`), E6 (`observability`), E11 (RabbitMQ), E13 (`search`), E16 (caos).
> **Onde:** `infra/docker-compose.yml`, Dockerfiles dos apps.

---

## 1. O problema

O projeto depende de Postgres com pgvector, Redis, RabbitMQ, Elasticsearch, OTel Collector, Prometheus, Loki, Tempo, Grafana e um mock. Instalar tudo na máquina, com as versões certas, em Windows, macOS e Linux, e no CI, é um pesadelo de "funciona na minha máquina".

## 2. Como funciona

### 2.1 Containers

Um **container** é um processo isolado do resto do sistema com recursos do kernel Linux:

- **Namespaces:** isolam o que o processo **vê** (processos, rede, sistema de arquivos, usuários).
- **cgroups:** limitam o que ele **usa** (CPU, memória).

Diferente de uma máquina virtual, o container **compartilha o kernel** do host: sobe em segundos e custa pouco. (No Windows e no macOS, o Docker Desktop roda uma VM Linux leve por baixo; no Windows, via WSL2.)

### 2.2 Imagem, camadas e Dockerfile

- **Imagem:** um pacote imutável com sistema de arquivos + metadados (comando de início, variáveis). Ex.: `postgres:17`, `pgvector/pgvector:pg17`.
- **Camadas:** cada instrução do Dockerfile gera uma camada, cacheada. Ordenar as instruções do que muda menos para o que muda mais acelera os builds.
- **Multi-stage build:** um estágio compila (com devDependencies) e outro só copia o resultado, gerando imagens pequenas e sem ferramentas de build.

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/gateway/package.json apps/gateway/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @portunus/gateway build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/... ./
USER node
CMD ["node", "dist/main.js"]
```

(Esboço ilustrativo; com pnpm workspaces, `pnpm deploy` ajuda a montar a pasta final de um app.)

### 2.3 Volumes e redes

- **Volumes:** dados que sobrevivem à recriação do container (o diretório de dados do Postgres).
- **Redes:** containers na mesma rede do Compose se encontram **pelo nome do serviço** (`postgres:5432`, `redis:6379`), com DNS interno.

### 2.4 Docker Compose

Descreve vários containers, suas redes, volumes e dependências num arquivo YAML, e os sobe com um comando.

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg17
    profiles: ["core", "full"]
    environment:
      POSTGRES_PASSWORD: dev
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 10

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:<versão>
    profiles: ["search", "full"]

volumes:
  pgdata:
```

- **Profiles:** ligam grupos de serviços sob demanda (`--profile core`). O Elasticsearch, o mais pesado, fica fora do dia a dia (ARQUITETURA.md §12).
- **Healthchecks + `depends_on: condition: service_healthy`:** um serviço só sobe quando a dependência está **pronta** (não apenas "iniciada"). Sem isso, o gateway tenta conectar a um Postgres que ainda está inicializando.

## 3. Analogia

- **Imagem** é a **planta pré-fabricada** de um módulo; **container** é o módulo montado e funcionando. Você pode montar dez módulos iguais a partir da mesma planta.
- **Compose** é o **projeto do condomínio**: diz quais módulos existem, como se ligam (ruas = redes), onde fica o depósito comum (volumes) e a ordem de entrega (healthchecks).
- **Profiles** são as **áreas opcionais** do condomínio: a piscina (Elasticsearch) só é "ligada" quando alguém vai usar.

## 4. Por que está nesta arquitetura

- Ambiente reproduzível com um comando, em qualquer sistema operacional e no CI.
- Os testes de caos (E16) são, literalmente, `docker compose stop <serviço>`.
- Testcontainers ([31](./31-testes-vitest-e-testcontainers.md)) usa o mesmo Docker.

## 5. Ferramentas similares

| Ferramenta | Diferença |
|---|---|
| **Docker + Compose** | Padrão para desenvolvimento local. **A escolha do projeto** |
| **Podman (+ podman-compose)** | Sem daemon, *rootless* por padrão, compatível com a CLI do Docker |
| **Kubernetes** (kind, minikube, k3d localmente) | Orquestração de produção; muito mais conceitos (pods, deployments, services) |
| **Tilt, Skaffold** | Ciclo de desenvolvimento rápido sobre Kubernetes |
| **Dev Containers** | O ambiente de desenvolvimento inteiro (editor + ferramentas) num container |
| **Nix, devbox** | Ambientes reproduzíveis sem containers |
| **Instalar tudo na máquina** | Sem isolamento; versões divergem entre devs |

## 6. Armadilhas

- **`depends_on` sem healthcheck** só espera o container **iniciar**, não ficar pronto.
- **Elasticsearch e memória:** precisa de RAM generosa e, no Linux, de `vm.max_map_count` ajustado; no Windows/WSL2, limite a memória do WSL.
- **Volumes "fantasmas":** dados antigos persistem entre experimentos; `docker compose down -v` limpa (e apaga tudo).
- **Portas em conflito** com serviços já instalados na máquina.
- **Tags `latest`:** versões mudam sem aviso; fixe as tags.
- **Segredos** em `docker-compose.yml` versionado: só valores de desenvolvimento; chaves reais de provedor vão em `.env` fora do git.
- **Rodar como root** dentro do container de produção: use `USER node`.

## 7. No Portunus

- Perfis: `core` (gateway, consumers, Postgres+pgvector, Redis, RabbitMQ, mock), `search` (Elasticsearch), `observability` (Collector, Prometheus, Loki, Tempo, Grafana) e `full`.
- O compose cresce a cada épico conforme as dependências entram.

## 8. Para aprofundar

- Docker — *Get started* e conceitos: https://docs.docker.com/get-started/
- Docker Compose — *Profiles*: https://docs.docker.com/compose/how-tos/profiles/
- Docker Compose — *Startup order* (healthchecks): https://docs.docker.com/compose/how-tos/startup-order/
- Docker — *Multi-stage builds*: https://docs.docker.com/build/building/multi-stage/
- pnpm — *Working with Docker*: https://pnpm.io/docker
