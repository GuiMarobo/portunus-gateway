# 04: Lint e formatação com a regra de camadas

**O que construir:** `pnpm lint` analisa o monorepo com ESLint (typescript-eslint strict com checagem de tipos) e falha em `console.*`, em `any`, em promessas não tratadas e em imports que violam a regra de dependência da Clean Architecture. `pnpm format` formata tudo com Prettier e `pnpm format:check` falha se algo estiver fora do formato. ESLint e Prettier não brigam entre si.

**Bloqueado por:** 02

**Status:** done

**Leitura:** [estudos/11 — Clean Architecture e padrões](../../../estudos/11-clean-architecture-e-padroes.md)

**Antes de começar:** confirmar as dependências `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-config-prettier` e `prettier`.

## Critérios de aceite

- [x] ESLint em flat config com o preset strict com checagem de tipos do typescript-eslint, cobrindo todos os pacotes.
- [x] `no-console` como erro.
- [x] Em qualquer `domain/`, importar `@nestjs/*`, `fastify`, `drizzle-orm`, `ioredis`, `amqplib`, `bullmq` ou as camadas `application/`, `infrastructure/` e `presentation/` é erro de lint.
- [x] Em qualquer `application/`, importar `infrastructure/` ou `presentation/` é erro de lint.
- [x] As regras de camada foram demonstradas com um import proibido temporário que o lint rejeitou (registrado no PR, não commitado).
- [x] Prettier como formatador único; o ESLint não aplica regras de estilo.
- [x] Scripts `lint`, `format` e `format:check`; o repositório inteiro passa nos dois checks.
- [x] Seção de comandos do CLAUDE.md atualizada.

## Pontos de atenção

- O lint com checagem de tipos precisa enxergar o tsconfig de cada pacote. Vale também para os arquivos de configuração na raiz (ESLint, Vitest), que costumam ficar fora de qualquer tsconfig.
- As restrições usam só regras nativas (`no-restricted-imports`), sem plugin novo. Explicar o trade-off em relação a plugins de fronteiras de arquitetura.
