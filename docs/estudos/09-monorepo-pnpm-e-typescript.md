# 09 — Monorepo, pnpm e TypeScript

> **Épicos:** E0.
> **Onde:** raiz do repositório, `apps/*`, `libs/*`.

---

## 1. O problema

O projeto tem quatro aplicações (gateway, consumers, evals-cli, mock-provider) e quatro bibliotecas compartilhadas (common, telemetry, events, database). Se cada uma estiver num repositório separado, mudar um contrato de evento exige publicar uma versão da lib, atualizar três repositórios e torcer para nada sair de sincronia. E, sem tipagem forte, um campo renomeado só quebra em produção.

## 2. Como funciona

### 2.1 Monorepo

Um **monorepo** é um único repositório com vários pacotes que se referenciam diretamente pelo código-fonte. Uma mudança em `libs/events` e nos consumidores que a usam vai no **mesmo commit**, é testada junta e revisada junta.

### 2.2 pnpm e workspaces

O **pnpm** é um gerenciador de pacotes Node. Dois diferenciais:

1. **Content-addressable store:** cada versão de cada pacote é baixada **uma vez** para um armazenamento global no disco, e os projetos recebem *hard links* para lá. Dez projetos usando o mesmo `zod` não guardam dez cópias.
2. **`node_modules` estrito:** um pacote só enxerga as dependências que declarou. No npm/yarn clássicos, o `node_modules` "achatado" permite importar algo que você não declarou (uma *phantom dependency*), e isso funciona até o dia em que quebra. O pnpm impede.

**Workspaces** permitem declarar vários pacotes num repositório:

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "libs/*"
```

Um pacote depende de outro do workspace com o protocolo `workspace:`:

```json
{ "dependencies": { "@portunus/events": "workspace:*" } }
```

E comandos podem ser filtrados: `pnpm --filter @portunus/gateway dev`.

### 2.3 TypeScript em modo strict

TypeScript adiciona tipos estáticos ao JavaScript; o compilador (`tsc`) verifica e gera JavaScript. O modo `strict` liga um conjunto de verificações:

| Flag | O que pega |
|---|---|
| `strictNullChecks` | Usar algo que pode ser `null`/`undefined` sem checar |
| `noImplicitAny` | Variáveis sem tipo que viram `any` silenciosamente |
| `strictFunctionTypes` | Funções com parâmetros incompatíveis |
| `strictPropertyInitialization` | Propriedade de classe nunca inicializada |
| `useUnknownInCatchVariables` | `catch (e)` vira `unknown`, obrigando a checar o tipo do erro |

Flags além do strict que valem a pena: `noUncheckedIndexedAccess` (acessar `array[i]` pode ser `undefined`) e `exactOptionalPropertyTypes`.

### 2.4 CommonJS × ESM

- **CommonJS** (`require`/`module.exports`): o sistema de módulos original do Node.
- **ESM** (`import`/`export`): o padrão da linguagem.

O projeto usa **CommonJS** porque o ecossistema NestJS (decorators, metadados de reflexão, CLI) funciona de forma mais previsível nele. O código é escrito com `import`, e o `tsc` converte para `require`.

### 2.5 `tsconfig.base.json`

Um tsconfig na raiz com as opções comuns; cada pacote o estende e só ajusta o que é específico (`outDir`, `rootDir`, `include`). Mantém o strict igual em todos.

## 3. Analogia

- **Monorepo:** uma cozinha industrial onde todas as estações (confeitaria, grelha, saladas) ficam no mesmo espaço e compartilham a mesma despensa. Mudar o fornecedor de farinha afeta todas, e todas são testadas no mesmo dia.
- **pnpm store:** em vez de cada estação ter sua própria cópia do livro de receitas, há um exemplar na biblioteca e cada estação tem um "atalho" para ele.
- **TypeScript strict:** um inspetor que confere cada ingrediente antes de entrar na panela ("isso aqui pode vir vazio, você checou?").

## 4. Por que está nesta arquitetura

- Contratos compartilhados (eventos, erros, schema do banco) precisam mudar **atomicamente** com quem os usa.
- O pnpm é rápido, econômico em disco e **estrito**: impede dependências fantasma, que são um bug clássico em monorepos.
- O TypeScript strict pega, em tempo de compilação, uma classe inteira de erros que, num sistema com tantas peças, só apareceriam em runtime.

## 5. Ferramentas similares

| Ferramenta | Categoria | Diferença principal |
|---|---|---|
| **npm workspaces** | Gerenciador + workspaces | Embutido no Node; `node_modules` achatado (permite dependências fantasma) |
| **Yarn (v1 / Berry)** | Gerenciador + workspaces | Berry tem *Plug'n'Play* (sem `node_modules`), mais estrito, mas com mais atrito de compatibilidade |
| **Bun** | Runtime + gerenciador | Muito rápido; ecossistema ainda amadurecendo para NestJS |
| **Turborepo** | Orquestrador de tarefas | Roda tarefas em ordem de dependência com cache de resultados; usado **junto** com pnpm |
| **Nx** | Orquestrador + geradores | Mais completo (grafo de projeto, `affected`, plugins); mais opinativo |
| **Lerna, Rush** | Orquestradores | Lerna hoje é mantido pelo time do Nx; Rush é voltado para monorepos grandes |

O projeto começa só com pnpm workspaces. Se os builds ficarem lentos, Turborepo ou Nx podem ser adicionados depois, numa decisão própria.

## 6. Armadilhas

- **Resolução de módulos entre pacotes:** o TypeScript precisa encontrar os tipos de `@portunus/events` (via `paths`, *project references* ou o campo `exports`/`types` do `package.json`). Configurar errado gera "funciona no editor, quebra no build" ou o contrário.
- **Ciclos entre pacotes** (lib A importa lib B que importa lib A): proíba desde o início.
- **Dependência na raiz por preguiça:** CLAUDE.md manda instalar no pacote que usa.
- **`any` escondido:** tipos vindos de bibliotecas mal tipadas ou de `JSON.parse` são `any`; valide com Zod ([12](./12-validacao-com-zod.md)).
- **Versão do Node diferente entre máquinas e CI:** por isso `.nvmrc` e `engines`.

## 7. No Portunus

E0 monta a raiz à mão: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`. Todos os pacotes usam o escopo `@portunus/*`.

## 8. Para aprofundar

- pnpm — *Workspaces*: https://pnpm.io/workspaces
- pnpm — *Motivation* (por que o store e o node_modules estrito): https://pnpm.io/motivation
- TypeScript — *TSConfig reference* (`strict`): https://www.typescriptlang.org/tsconfig#strict
- monorepo.tools (comparação de ferramentas): https://monorepo.tools/
