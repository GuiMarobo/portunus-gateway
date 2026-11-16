# 01: Raiz do workspace com Node e pnpm fixados

**O que construir:** um clone limpo do repositório roda `pnpm install` com sucesso, sempre com a mesma versão de Node e de pnpm, e recusa a instalação quando a versão de Node está errada. O workspace já declara onde ficam os pacotes (`apps/*` e `libs/*`), mesmo que ainda não exista nenhum. Os arquivos de texto ficam normalizados em LF, para que Windows e CI vejam os mesmos bytes.

**Bloqueado por:** nenhum (pode começar imediatamente).

**Status:** ready-for-agent

**Leitura:** [estudos/09 — Monorepo, pnpm e TypeScript](../../../estudos/09-monorepo-pnpm-e-typescript.md)

## Critérios de aceite

- [x] Node 22 LTS fixado em `.nvmrc` e em `engines` do `package.json` raiz.
- [x] Versão exata do pnpm fixada no campo `packageManager`, ativável via Corepack.
- [x] `engine-strict` ligado: com outra versão major de Node, `pnpm install` falha com erro de engine (verificado localmente e descrito no PR).
- [x] Workspace declarado com `apps/*` e `libs/*`; `package.json` raiz `private: true`.
- [x] `pnpm install` num clone limpo termina sem erro e o lockfile é commitado.
- [x] Finais de linha normalizados em LF (`.gitattributes`) e `.editorconfig` com indentação e charset do projeto.
- [x] `.gitignore` continua ignorando `.env*`, mas não o `.env.example` que virá no ticket 07.
- [x] Nenhuma dependência instalada ainda.

## Pontos de atenção

- `.gitattributes` adicionado depois que já existem arquivos pode exigir renormalizar o índice (`git add --renormalize .`). Conferir se o diff resultante só mexe em finais de linha.
- `packageManager` + Corepack versus pnpm instalado globalmente: o que acontece quando as versões divergem.
