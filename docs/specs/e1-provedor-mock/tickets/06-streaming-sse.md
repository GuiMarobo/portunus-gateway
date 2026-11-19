# 06: Streaming SSE

**O que construir:** com `stream: true`, o SDK oficial itera a resposta chunk a chunk, como faria com a OpenAI. O stream tem a mesma sequência de um provedor real, termina com `[DONE]`, traz o `usage` quando pedido e pode ser desacelerado pelo cenário (`ttfb` e `chunk-delay`) para o repasse ficar visível. Se o cliente desiste no meio, o mock para de gerar.

**Bloqueado por:** 04

**Status:** in-review

**Leitura:** [estudos/04 — Streaming e SSE](../../../estudos/04-streaming-e-sse.md)

**Antes de começar:** confirmar a decisão 4 da spec (chunk de `usage` só com `stream_options.include_usage`).

## Critérios de aceite

- [x] A resposta tem `Content-Type: text/event-stream`, `Cache-Control: no-cache` e eventos `data: <json>\n\n` com `object: "chat.completion.chunk"`.
- [x] Sequência: um chunk com `delta.role = "assistant"`, um chunk por token com `delta.content`, um chunk com `delta` vazio e `finish_reason`, depois `data: [DONE]`.
- [x] Com `stream_options.include_usage: true`, sai antes do `[DONE]` um chunk com `choices: []` e `usage`. Sem isso, nenhum chunk de `usage`.
- [x] A concatenação dos `delta.content` é idêntica ao `content` da mesma requisição sem stream, e `finish_reason` também bate (inclusive `"length"` com `max_tokens`).
- [x] `ttfb=N` atrasa o primeiro chunk em pelo menos N ms depois dos headers. `chunk-delay=N` espaça os chunks. `latency` atrasa os headers.
- [x] `error=429`, `500` e `503` em stream acontecem antes dos headers, com o mesmo status e corpo do ticket 04.
- [x] A escrita respeita backpressure: quando `write` devolve `false`, espera o `drain`.
- [x] Se o cliente aborta no meio do stream (`AbortController` no SDK), o mock para de escrever e cancela os timers daquela requisição. Há um teste que observa isso.
- [x] Os testes usam o SDK para a sequência e `fetch` para conferir o enquadramento SSE cru.

## Pontos de atenção

- Um chunk de rede não é um evento SSE. Nos testes com `fetch`, usar um parser de linhas, não `split` ingênuo sobre cada `read()`.
- Depois de `reply.raw.writeHead`, o Fastify não controla mais a resposta. Use `reply.hijack()` (ou equivalente) para o Fastify não tentar enviar uma segunda resposta.
- Timer vazando: cada `chunk-delay` agendado precisa ser cancelado no `close`. Sob carga e caos, um vazamento aqui derruba o mock.
