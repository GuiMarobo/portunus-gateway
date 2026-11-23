# Review do PR (2ª passada): feat/mock-provider vs origin/main (52a2e08)

Veredito: REQUEST CHANGES (só por causa do gate de formatação; o código está pronto)

O que mudou desde a 1ª review ([review-pr.md](./review-pr.md)) foi o ticket 12, que tratou os 8 Minors e os 3 Nits. Essas correções estão corretas: o código bate com as decisões confirmadas, e a refatoração do m8 (`planOf` lança erro se não houver plano) não cria caminho novo de 500. Todo retorno antecipado do pre-handler responde ou faz `hijack`, então o handler nunca chega a chamar `planOf` sem plano. Sobrou um problema de verdade: o último commit deixou um Markdown fora do Prettier, e a CI roda `pnpm format:check`.

Base: `origin/main` (52a2e08). O `main` local está em 472ad47, desatualizado, e incluiria o E0 no diff. São 32 commits e 92 arquivos, com cerca de 2100 linhas de produção. `.scratch/` ficou fora do diff. Foi usado o fast path, com uma passada inline e sem sub-agentes: o épico inteiro já tinha passado pela 1ª review com lentes e refutação, e o delta novo (commit 29f8a86) tem cerca de 200 linhas de produção e uma review de ticket própria (12.md, PASS).

## Gates (Node 22.23.5)

| Gate | Resultado |
|---|---|
| typecheck | ✔ |
| lint | ✔ |
| format:check | ✖ `docs/specs/e1-provedor-mock/tickets/README.md` (ver B1) |
| testes unitários | ✔ 283 passaram (38 arquivos) · cobertura não coletada |
| test:int (Testcontainers) | ✔ 2 passaram |
| audit de dependências | ✔ mock sem advisory `high`. Os 4 `high` restantes estão em `apps__gateway>@nestjs/platform-fastify>fastify`, que é pré-existente e já está registrado como pendência fora do E1 |
| secrets | não rodou: gitleaks não instalado (`brew install gitleaks`) |
| SAST | não rodou: semgrep não instalado (`brew install semgrep`) |
| mutação | não rodou (só no modo thorough) |

## Resumo

Blocker 1 · Major 0 · Minor 2 · Nit 1

## Blockers

### [B1] `format:check` falha e deixa a CI vermelha
- Severidade: Blocker · Confiança: high · Status: CONFIRMED
- Lente: gate (format)
- Onde: docs/specs/e1-provedor-mock/tickets/README.md:7-20 (último commit que mexeu no arquivo: e197f45)
- Cenário: `.github/workflows/ci.yml:34` roda `pnpm format:check`. A coluna `Status` da tabela ficou com largura de 15 caracteres, mas o Prettier quer 9, e o job falha antes dos testes.
- Evidência: `| 01  | [Mock responde ...] | — | done            |` (Prettier: `| done      |`)
- Correção: `pnpm prettier --write docs/specs/e1-provedor-mock/tickets/README.md` (junto com o m1 abaixo).

## Minors

### [m1] O índice dos tickets mostra o 11 como `in-review`, mas o ticket diz `done`
- Severidade: Minor · Confiança: high · Status: CONFIRMED
- Lente: spec
- Onde: docs/specs/e1-provedor-mock/tickets/README.md:19 e tickets/11-fechamento-do-epico.md:7
- Cenário: o `implement-epic` ou quem lê o índice conclui que o épico não fechou. O commit db9584a ("mark #11 done") atualizou o ticket, mas não o índice.
- Evidência: `| 11 | [Fechamento do épico](...) | 01–10 | in-review |` vs `**Status:** done`
- Correção: trocar para `done` na mesma edição do B1.

### [m2] O pior caso de embeddings ainda bloqueia o event loop por um tempo considerável
- Severidade: Minor · Confiança: medium · Status: PLAUSIBLE (o tempo exato depende da máquina; não foi medido)
- Lente: performance / reliability
- Onde: apps/mock-provider/src/embeddings/embeddings.route.ts:11-16 (teto de itens), mock-config.schema.ts:31 (`DEFAULT_MAX_EMBEDDING_DIMENSIONS = 3072`)
- Cenário: uma requisição com 2048 itens e `dimensions: 3072` gera cerca de 6,3 milhões de floats pelo PRNG e serializa uma resposta JSON da ordem de 120 MB, tudo de forma síncrona. Enquanto isso, os timers de `latency`/`timeout` das outras requisições atrasam.
  - Com `MOCK_MAX_EMBEDDING_DIMENSIONS=16000` (permitido pela config), são cerca de 33 milhões de floats, e a string pode passar do limite de tamanho do V8, resultando em `500`.
  - O teto do m3 resolveu a ordem de grandeza: antes eram cerca de 250 mil itens. Falta o equivalente ao limite de tokens totais por requisição da OpenAI.
- Evidência: `.max(MAX_EMBEDDING_INPUTS)` limita itens, mas nada limita `itens × dimensions`.
- Direção: um teto de `itens × dimensions` (constante nomeada) com `400`, ou apenas registrar na spec como limite conhecido. Isso pesa pouco enquanto os testes de carga do gateway não usarem lotes grandes de embeddings.

## Nits

- **n1:** o corpo do commit 29f8a86 tem o rodapé `Refs: e1-provedor-mock#12` duplicado (a segunda cópia está indentada). Isso some no squash merge.

## Não verificado

- Gitleaks e Semgrep não estão instalados.
- Não houve PR aberto para ler a discussão: `gh pr list --head feat/mock-provider` voltou vazio.
- O m2 não foi medido, porque a review não roda código além dos gates.

## Resolução (2026-11-23)

- **B1:** corrigido com `prettier --write` no índice de tickets. `pnpm format:check` verde.
- **m1:** ticket 11 marcado como `done` no índice.
- **m2:** registrado na spec, em "Pendências para épicos futuros", sem mudança de código (decisão do usuário).
- **n1:** some no squash merge.
