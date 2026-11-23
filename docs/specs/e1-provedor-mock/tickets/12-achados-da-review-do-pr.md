# 12: Achados da review do PR do épico

**O que construir:** corrigir os oito Minors e os três Nits da review do branch inteiro ([review-pr.md](../../../../.scratch/e1-provedor-mock/reviews/review-pr.md)). Nenhum deles bloqueia o merge, mas três afetam testes do gateway contra o mock:

- `stream-cut` como cenário padrão derruba o tráfego sem stream.
- `fastify` com advisories altos.
- Embeddings sem teto de itens.

Cada critério abaixo traz o cenário que falha hoje e o teste de regressão que o prende.

**Bloqueado por:** 11

**Status:** in-review

## Decisões a confirmar antes do ticket

> **Confirmadas em 2026-11-23:** 1 (a) · 2 sim, `fastify@5.12.8` · 3 8 MiB · 4 `>=22.18 <23`; o `.nvmrc` fica `22`, que o nvm resolve para o último 22.x · n3 só com `x-request-id`, `x-ratelimit-*` registrado para o E3.
> **m4 refutado no RED:** o Node 22/24 não emite `MaxListenersExceededWarning` para listeners de um `AbortSignal`. O teste das 11 requisições ficou como regressão e o `setMaxListeners(0)` não entrou.

1. **m1: `stream-cut` no `MOCK_DEFAULT_SCENARIO`.**
   - (a) _(recomendada)_ Recusar na validação da config: o app não sobe, com o mesmo erro legível do `loadConfig`. O erro aparece cedo e não muda o comportamento por requisição, que a review 07 já aceitou.
   - (b) Tratar como no-op em requisições sem stream quando o cenário vem do ambiente. Fica mais permissivo, mas a regra passa a depender da origem do cenário.
2. **m2: subir `fastify` para `>=5.12.5` no mock.** É troca de versão de uma dependência existente e precisa de confirmação (CLAUDE.md §5). O gateway, que recebe o `fastify` pelo `@nestjs/platform-fastify`, fica para um ticket próprio fora do E1.
3. **m5: `bodyLimit` do mock.** Escolher o valor. A sugestão é ficar próximo do limite da OpenAI, conferido na referência da API.
4. **m7: `engines.node`.** Subir para `>=22.18 <23` (type stripping sem flag) e alinhar o `.nvmrc`. A alternativa é rodar a demo por outro loader.

## Critérios de aceite

### Correção e contrato

- [x] **m1:** `MOCK_DEFAULT_SCENARIO=error=stream-cut` segue a decisão 1.
  - Opção (a): a construção falha listando o campo.
  - Opção (b): chat sem stream e `/v1/embeddings` respondem `200`.
  - Teste em `scenario-sources.spec.ts`.
- [x] **m3:** `/v1/embeddings` recusa com `400` e `error.param = "input"`:
  - uma lista com mais de 2048 itens (constante nomeada `MAX_EMBEDDING_INPUTS`);
  - uma string vazia, sozinha ou dentro da lista.
  - Testes: 2049 itens → `400`; `""` → `400`; 2048 itens → `200`.
- [x] **m5:** o `bodyLimit` segue a decisão 3, e cada 4xx do Fastify tem mensagem própria no formato da OpenAI: corpo grande demais (`413`), `content-type` não suportado (`415`) e JSON inválido (`400`). Testes: um corpo abaixo do novo limite → `200`; `content-type: text/plain` → `415` com mensagem distinta da de JSON inválido.

### Dependências e confiabilidade

- [x] **m2:** `fastify` do mock em `>=5.12.5`, sem advisory `high` de produção do mock no `pnpm audit --prod --audit-level=high` (o do gateway fica registrado como pendência fora do E1).
- [x] **m4:** o `AbortSignal` de shutdown aceita listeners sem limite (`events.setMaxListeners(0, signal)` em `graceful-shutdown.ts`). Teste: 11 requisições simultâneas com `latency=200` não disparam `process.on('warning')`.

### Testes, documentação e manutenção

- [x] **m6:** o fechamento da spec (`spec.md`, seção de encerramento) não cita uma contagem fixa de testes que fique velha. Cita o comando ou o número atual.
- [x] **m7:** a demo confere o corte pelo comportamento (erro depois de N chunks, sem `[DONE]`), não pelo texto `'terminated'`, e os `engines` seguem a decisão 4.
- [x] **m8:** o plano de stream e os tokens do cenário chegam à rota por um caminho explícito e tipado, como `decorateRequest` ou uma função que o handler chama. Uma rota sem o pre-handler de cenário falha alto, em vez de cair em `IMMEDIATE_STREAM`. `apply` e `applyWithoutStreaming` deixam de ser closures duplicadas.

### Nits

- [x] **n1:** o esquema `Bearer` é aceito sem distinção de maiúsculas (`bearer x` → passa). Teste em `openai-errors.spec.ts`.
- [x] **n2:** o redact dos logs cobre também `x-api-key` e `cookie`. Teste em `request-logging.spec.ts`.
- [x] **n3:** as respostas do mock trazem `x-request-id`, e o `429` traz os headers `x-ratelimit-*` no formato da OpenAI, conferidos na referência da API. Se ficar grande demais, vira ticket no E3 e o critério passa a ser "registrado como pendência na spec".

### Verificação

- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` e `pnpm test:int` verdes.
- [x] `pnpm --filter @portunus/mock-provider demo` contra o mock no Compose `core`.

## Pontos de atenção

- **m1 já tem histórico:** a review 07 m3 aceitou o `400` de `stream-cut` sem stream como erro de configuração no nível da requisição. O que muda aqui é só o caso do cenário padrão da instância, em que o erro aparece em toda chamada e não na subida.
- **Teto de `input` (m3):** o teto também protege o event loop. Sem ele, 1 MiB de corpo permite cerca de 250 mil itens × `dimensions` iterações síncronas do PRNG, e isso atrasa os timers de `latency`/`timeout` das outras requisições.
- **Subir o `bodyLimit` (m5)** aumenta a memória por requisição. Combine com o teto do m3 para que o pior caso continue limitado.
- **Fora deste ticket, como na spec:** `content` em partes ou `null`, header vazio e `n > 1`. Já estão adiados (spec.md: "Fora de escopo" e pendências).
- Os achados vieram de lentes que só leram o código. m4 e m5 estão como PLAUSIBLE: confirme com o teste RED antes de corrigir.
