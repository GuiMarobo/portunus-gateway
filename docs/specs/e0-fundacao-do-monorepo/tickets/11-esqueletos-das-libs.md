# 11: Esqueletos das libs restantes

**O que construir:** `@portunus/telemetry`, `@portunus/events` e `@portunus/database` passam a existir como pacotes reais do workspace, no mesmo molde do `@portunus/common`. Compilam, passam no lint e entram no grafo de build, para que o E6, o E11 e o E2 só adicionem código.

**Bloqueado por:** 06

**Status:** in-review

## Critérios de aceite

- [x] Os três pacotes seguem a mesma estrutura de `@portunus/common` (`private`, escopo `@portunus/*`, tsconfig estendendo a base, `exports` com a condição de código-fonte).
- [x] Ponto de entrada vazio em cada um, sem código especulativo.
- [x] Os três entram nas project references e em `typecheck`, `lint` e `build`.
- [x] Nenhum app depende deles ainda.

## Pontos de atenção

- Se três pacotes repetem a mesma configuração, considerar (e justificar) se vale extrair algo comum ou se a repetição é mais clara.
