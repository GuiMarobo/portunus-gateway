# ADR 011 — Resolução de pacotes do workspace

- **Status:** Aceito
- **Data:** 2026-11-17

## Contexto

O monorepo tem apps (`apps/*`) e bibliotecas (`libs/*`) como pacotes pnpm do escopo `@portunus/*`. O gateway importa `@portunus/common` pelo nome do pacote, e não por caminho relativo, para que as fronteiras entre pacotes fiquem explícitas.

O mesmo `import '@portunus/common'` passa por cinco ferramentas, e cada uma resolve módulos de um jeito:

| Ferramenta                | Quem resolve                        | O que precisa encontrar                   |
| ------------------------- | ----------------------------------- | ----------------------------------------- |
| Editor e `pnpm typecheck` | TypeScript (`tsc --noEmit`)         | Tipos, de preferência do código-fonte     |
| `pnpm test`               | Vitest (resolução do Vite, em SSR)  | Código TypeScript que ele mesmo transpila |
| `pnpm lint`               | ESLint com tipos (`projectService`) | Os mesmos tipos do editor                 |
| `pnpm build`              | `tsc -b`                            | A ordem de compilação entre pacotes       |
| Runtime                   | Node 22 em CommonJS                 | JavaScript compilado, nunca `.ts`         |

O risco clássico é a configuração que "funciona no editor e quebra no build" (ou o contrário): uma ferramenta lê o código-fonte e outra exige um `dist` que ninguém gerou.

## Decisão

**Opção C: pacotes compilados, project references e uma condição de export para o código-fonte.**

- Cada lib declara no `package.json` um `exports` com duas condições, nesta ordem:
  - `@portunus/source` → `./src/index.ts`;
  - `default` → `./dist/index.js` (os tipos vêm do `index.d.ts` ao lado).
- `tsconfig.base.json` define `customConditions: ["@portunus/source"]`, o que exige `module`/`moduleResolution` `node16` (já usados). Sem `"type": "module"` no pacote, a saída continua CommonJS.
- O Vitest recebe a mesma condição em `ssr.resolve.conditions` no `vitest.shared.mts`. A lista substitui a padrão do Vite, por isso as condições padrão de servidor (`module`, `node`, `development|production`) são repetidas ali.
- Cada pacote tem dois tsconfigs:
  - `tsconfig.json` (editor, typecheck, ESLint): sem `references`, sem `rootDir`. O código-fonte das libs entra no programa via a condição, e nada depende de `dist`.
  - `tsconfig.build.json` (build): libs com `composite: true`; o gateway com `references` para as libs que usa. O `tsBuildInfoFile` fica dentro do `dist`.
- O build do gateway é `tsc -b tsconfig.build.json`, e não `nest build`, porque o compilador da CLI do Nest não usa o modo build do TypeScript e, portanto, não segue `references`. O `pnpm dev` compila antes as dependências do gateway (`pnpm --filter "@portunus/gateway^..." build`) e então roda `nest start --watch`.
- No runtime, o Node não conhece a condição `@portunus/source`, cai no `default` e carrega o `dist`.
- Nenhum `paths` no tsconfig.

## Alternativas consideradas

- **A. `paths` no tsconfig** mapeando `@portunus/x` para o código-fonte. Só o compilador entende: o Node em runtime não lê `paths`, então o build quebra sem um bundler ou `tsconfig-paths`. Também esconde as fronteiras do pnpm, porque um pacote consegue importar outro sem declará-lo como dependência.
- **B. Pacote interno "just-in-time"**, com `main`/`exports` apontando direto para `src/index.ts`. É o mais simples para o Vitest e para o editor, mas o Node em CommonJS não executa `.ts` de dentro de `node_modules`: o type stripping do Node 22 não vale para dependências e não cobre decorators. Exigiria um bundler no build.
- **C. Compilados + references + condição de export** (escolhida). Um pouco mais de configuração, mas cada ferramenta resolve do jeito certo, o runtime é Node puro e o grafo de build é explícito.

Sobre o nome da condição: `@portunus/source`, com escopo, e não `source`. Alguns pacotes publicados no npm usam `source` como condição; com o nome genérico, o Vitest e o `tsc` passariam a ler o código-fonte de dependências de terceiros.

## Consequências

- `pnpm install` seguido de `pnpm typecheck`, `pnpm lint` e `pnpm test` funciona sem build prévio. Isso foi verificado com o `dist` das libs apagado.
- `tsc -b` compila as libs antes do gateway, pela ordem das `references`, e recompila só o que mudou. Uma referência circular entre pacotes falha o build com `TS6202`, o que já cobre ciclos no nível de pacote sem ferramenta extra.
- No build, o TypeScript troca o código-fonte de um projeto referenciado pelo `.d.ts` dele. Por isso a condição pode ficar no `tsconfig.base.json` sem que o build do gateway recompile as libs.
- O `.tsbuildinfo` dentro do `dist` evita um modo de falha silencioso. Se ele ficasse fora, apagar só o `dist` faria o `tsc -b` considerar o projeto atualizado e não emitir nada.
- Cada lib nova precisa de: `exports` com as duas condições, `tsconfig.json` e `tsconfig.build.json` (`composite`), e uma entrada em `references` em cada pacote que a consome.
- No `pnpm dev`, uma mudança numa lib exige reiniciar o processo. O watch acompanha só o código do gateway. Se isso incomodar, a alternativa é um `tsc -b -w` paralelo para as libs.
- A lista de condições padrão do Vite repetida no `vitest.shared.mts` precisa ser revista se uma atualização do Vite mudar esse padrão.
