# 06: Primeira lib compartilhada: `@portunus/common`

**O que construir:** nasce o pacote `@portunus/common` com o utilitário genérico de carregamento de configuração (recebe um schema Zod e um ambiente, devolve a configuração tipada ou lança erro). O gateway passa a obter porta e host por ele. O import `@portunus/common` funciona nas cinco ferramentas: editor/typecheck, Vitest (sem build prévio), ESLint com tipos, build e Node em execução. Este ticket resolve o principal ponto de atenção do épico e o registra como ADR.

**Bloqueado por:** 03, 04

**Status:** in-review

**Leitura:** [estudos/09](../../../estudos/09-monorepo-pnpm-e-typescript.md) §6, [estudos/12 — Validação com Zod](../../../estudos/12-validacao-com-zod.md)

**Antes de começar:** confirmar a estratégia de resolução (opção C da spec) e a dependência `zod`.

## Critérios de aceite

- [x] `@portunus/common` é um pacote do workspace (`private`, escopo `@portunus/*`), consumido pelo gateway via `workspace:*`.
- [x] Utilitário de configuração genérico sobre o schema, com teste unitário escrito antes da implementação (TDD).
- [x] O gateway lê `PORT` e `HOST` pelo utilitário, com os padrões atuais; `PORT` inválida impede a aplicação de ser construída (teste pelo seam).
- [x] Libs compiladas com project references: o build respeita a ordem de dependência e uma referência circular entre pacotes falha o build.
- [x] `exports` com condição de código-fonte para typecheck e Vitest e `default` para o JavaScript compilado; sem `paths` no tsconfig.
- [x] `pnpm test` roda logo após `pnpm install`, sem build; `node` sobre o build do gateway resolve `@portunus/common` compilado.
- [x] ADR 011 (resolução de pacotes do workspace) registrado com as opções A, B e C e os trade-offs.

## Pontos de atenção

- `customConditions` exige `moduleResolution` `node16` ou `bundler`; com `node16`, o pacote segue CommonJS desde que não declare `"type": "module"`.
- Teste mental de "funciona no editor, quebra no build": apagar o `dist` da lib e rodar cada ferramenta.
- Nesta etapa, o erro de configuração pode ser o erro cru do Zod. O formato legível e sem valores entra no ticket 07.
