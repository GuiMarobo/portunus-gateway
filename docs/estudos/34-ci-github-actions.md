# 34 — CI com GitHub Actions

> **Épicos:** E0 (pipeline base), E15 (gate de evals), E16 (carga opcional).
> **Onde:** `.github/workflows/`.

---

## 1. O problema

A verificação obrigatória do CLAUDE.md (typecheck, lint, testes unitários e de integração) só protege o projeto se rodar **sempre**, e não "quando alguém lembra". Com trunk-based development e `main` protegida, cada PR precisa provar automaticamente que não quebra nada antes do merge.

## 2. Como funciona

### 2.1 CI e CD

- **CI (Continuous Integration):** a cada push/PR, o código é integrado e verificado automaticamente (build, lint, testes).
- **CD (Continuous Delivery/Deployment):** o que passou no CI fica pronto para (ou vai direto para) produção. O projeto foca em CI.

### 2.2 Conceitos do GitHub Actions

| Conceito               | O que é                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Workflow**           | Um arquivo YAML em `.github/workflows/`                                                                     |
| **Event / trigger**    | O que dispara: `push`, `pull_request`, `schedule`, `workflow_dispatch`                                      |
| **Job**                | Um conjunto de passos numa máquina (runner); jobs rodam em paralelo por padrão, ou em sequência com `needs` |
| **Step**               | Um comando (`run`) ou uma _action_ reutilizável (`uses`)                                                    |
| **Runner**             | A máquina: hospedada pelo GitHub (`ubuntu-latest`) ou própria (_self-hosted_)                               |
| **Action**             | Um bloco reutilizável (ex.: `actions/checkout`, `actions/setup-node`, `pnpm/action-setup`)                  |
| **Service containers** | Containers auxiliares para o job (alternativa ao Testcontainers)                                            |
| **Cache**              | Reaproveitar o store do pnpm entre execuções                                                                |
| **Secrets**            | Valores sensíveis injetados como variáveis, mascarados nos logs                                             |

### 2.3 Um pipeline para o projeto (esboço)

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm test:int
```

- `--frozen-lockfile`: falha se o `pnpm-lock.yaml` não bater com os `package.json`. Garante que o CI instala exatamente o que foi revisado.
- O runner Ubuntu do GitHub tem Docker, então Testcontainers funciona.

### 2.4 Branch protection e checks obrigatórios

Nas configurações do repositório, a `main` exige:

- PR (sem push direto);
- **status checks obrigatórios** (o job `verify` verde);
- branch atualizada com a `main` antes do merge;
- squash merge (histórico linear, um commit por PR).

### 2.5 O gate de evals (E15)

Um workflow que sobe o gateway e o mock, roda `evals-cli` e **falha o PR** se a aprovação ficar abaixo do mínimo. Pode rodar só quando arquivos de prompt ou de suíte mudarem (filtro `paths`).

## 3. Analogia

O CI é a **linha de inspeção de qualidade de uma fábrica**: toda peça (PR), sem exceção, passa pelas mesmas estações (typecheck, lint, testes) antes de ir para o estoque (a `main`). A branch protection é a **cancela** no fim da linha: peça sem o selo verde não passa, nem a do gerente.

## 4. Por que está nesta arquitetura

- Trunk-based com `main` protegida (CLAUDE.md §4) depende de CI.
- Transforma a "verificação obrigatória" em algo automático e auditável.
- Viabiliza o critério de portfólio "um teste de qualidade barra uma mudança ruim automaticamente".

## 5. Ferramentas similares

| Ferramenta                                             | Diferença                                                                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **GitHub Actions**                                     | Integrado ao GitHub, marketplace enorme de actions, minutos grátis em repositórios públicos. **A escolha do projeto** |
| **GitLab CI/CD**                                       | Integrado ao GitLab; `.gitlab-ci.yml`; runners próprios simples                                                       |
| **CircleCI, Travis CI**                                | SaaS independentes do host do código                                                                                  |
| **Jenkins**                                            | Self-hosted, extremamente flexível via plugins; alta manutenção                                                       |
| **Buildkite**                                          | Orquestração SaaS com agentes na sua infraestrutura                                                                   |
| **Azure Pipelines, AWS CodeBuild, Google Cloud Build** | Integrados às respectivas nuvens                                                                                      |
| **Dagger**                                             | Pipelines como código (TS/Go/Python) que rodam igual local e no CI                                                    |

## 6. Armadilhas

- **CI lento** desestimula PRs pequenos. Use cache do pnpm, jobs paralelos (lint e testes unitários separados de integração) e filtros por caminho.
- **Testes flaky** no CI: o time começa a reexecutar até passar. Corrija ou isole.
- **Secrets em logs** ou em workflows disparados por PRs de forks.
- **Actions de terceiros sem versão fixa:** fixe por tag ou, melhor, por SHA do commit (segurança da cadeia de suprimentos).
- **"Funciona no CI, quebra local"** (ou o contrário) por versões diferentes: `.nvmrc` e lockfile resolvem a maior parte.
- **Chamar provedor real no CI** viola o invariante 4 (mock primeiro) e gasta dinheiro.

## 7. No Portunus

- E0: workflow `ci` com install, typecheck, lint, test e test:int; branch protection na `main`.
- E15: workflow de evals como gate de PR.
- E16 (opcional): um cenário k6 curto com thresholds para detectar regressões grosseiras de desempenho.

## 8. Para aprofundar

- GitHub Actions — documentação: https://docs.github.com/en/actions
- GitHub — _About protected branches_: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- pnpm — _Continuous Integration_ (GitHub Actions): https://pnpm.io/continuous-integration
- GitHub — _Security hardening for GitHub Actions_: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions
- Martin Fowler — _Continuous Integration_: https://martinfowler.com/articles/continuousIntegration.html
