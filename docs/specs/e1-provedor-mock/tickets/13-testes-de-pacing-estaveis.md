# 13: Testes de pacing do SSE estáveis

**O que construir:** corrigir os dois testes de pacing do streaming (`ttfb` e `chunk-delay`), que medem o tempo a partir de um referencial que o servidor não controla e por isso falham de forma intermitente na CI. O mock não muda; só os testes.

**Bloqueado por:** 12

**Status:** done

**Leitura:** [estudos/04 — Streaming e SSE](../../../estudos/04-streaming-e-sse.md), [estudos/31 — Testes com Vitest e Testcontainers](../../../estudos/31-testes-vitest-e-testcontainers.md)

## Cenário que falha hoje

A CI do PR #4 falhou em `chat-completions-stream.spec.ts > pacing > holds the first chunk for at least ttfb after the headers`:

```
AssertionError: expected 1279.624932 to be greater than or equal to 1282.034234
```

O servidor faz `flushHeaders` e começa a contar o `ttfb` no mesmo instante (S). O teste mede a partir de `headersAtMs`, o momento em que o `fetch` do cliente resolveu:

- headers recebidos em `H = S + d1`;
- primeiro chunk recebido em `R = S + ttfb + d2`;
- logo, `R − H = ttfb + d2 − d1`, que fica abaixo do `ttfb` sempre que a entrega dos headers atrasa mais que a do chunk.

Cliente e servidor rodam no mesmo processo e no mesmo event loop, então um runner lento basta para isso: na CI, a diferença foi de 2,4 ms. O teste de `chunk-delay` mede entre dois instantes do lado do cliente e tem o mesmo defeito, ainda sem falha observada.

## Critérios de aceite

- [x] O `ttfb` é medido a partir de `sentAtMs`, registrado antes do `fetch`. O servidor só começa a contar depois de receber a requisição, então `R − sentAt ≥ ttfb` é uma garantia, e não uma margem.
- [x] O `chunk-delay` é medido do mesmo referencial: o último chunk de uma resposta de 3 tokens chega pelo menos `4 × chunk-delay` depois de `sentAtMs`.
- [x] A única folga é uma constante nomeada para a granularidade dos timers do Node (relógio do libuv em milissegundos inteiros, guardado no início de cada volta do loop), multiplicada pelo número de esperas encadeadas.
- [x] Evidência antes e depois: o arquivo rodado várias vezes com a CPU ocupada falha antes da correção e não falha depois.
  - 40 rodadas de `vitest run src/chat-completions-stream.spec.ts -t pacing` com 8 processos `yes` ocupando a CPU: **7/40 falharam antes, 0/40 depois**.
  - Com as esperas do servidor desligadas de propósito (`delayMs = 0`), os dois testes novos falham: continuam protegendo o comportamento.

### Verificação

- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` e `pnpm test:int` verdes.
- [x] CI do PR #4 verde (`quality` e `integration`).

## Pontos de atenção

- **Não alargar a margem** (por exemplo, `≥ 50`): esconde a causa e enfraquece o teste.
- **O RED não é determinístico:** o defeito depende do escalonamento. A evidência é a taxa de falha sob carga, antes e depois.
- Fecha um caso concreto da pendência "Testes sensíveis a tempo e a timers globais" da spec; os demais seguem lá.
