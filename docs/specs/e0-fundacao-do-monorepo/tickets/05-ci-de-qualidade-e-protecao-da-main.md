# 05: CI de qualidade e proteção da `main`

**O que construir:** todo PR e todo push na `main` disparam um workflow no GitHub Actions que instala com o lockfile congelado e roda typecheck, lint, format:check, test e build. A `main` passa a aceitar mudanças só por PR com esse check verde e squash merge. A partir daqui, todo ticket entra pelo CI.

**Bloqueado por:** 03, 04

**Status:** done

**Leitura:** [estudos/34 — CI e GitHub Actions](../../../estudos/34-ci-github-actions.md)

## Critérios de aceite

- [x] Workflow `ci` disparado em `pull_request` e em `push` na `main`.
- [x] Node lido do `.nvmrc`, pnpm lido do `packageManager`, cache do store do pnpm e `pnpm install --frozen-lockfile`.
- [x] Job `quality` rodando `typecheck`, `lint`, `format:check`, `test` e `build`.
- [x] `permissions: contents: read` e `concurrency` que cancela execuções antigas do mesmo PR.
- [x] Actions de terceiros fixadas por SHA de commit (com a versão num comentário de YAML, que não é código TypeScript).
- [x] O PR deste ticket mostra o check verde.
- [x] `main` protegida: PR obrigatório, check `quality` obrigatório e squash merge. A configuração aplicada fica descrita no PR.

## Pontos de atenção

- Proteção de branch e rulesets em repositório **privado** exigem plano pago do GitHub; em público, são gratuitos. Verificar a visibilidade do repositório antes e, se não for possível proteger, registrar a limitação.
- O nome do job vira o nome do check exigido na proteção. Renomear o job depois "solta" a proteção sem aviso.
- Lockfile desatualizado precisa falhar o CI, não ser corrigido por ele.
