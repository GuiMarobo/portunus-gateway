# 07: Falhas no tempo: `timeout` e `stream-cut`

**O que construir:** os dois modos de falha que só existem ao longo do tempo. Com `error=timeout`, o mock aceita a requisição e não responde, para o gateway exercitar o tempo máximo de espera. Com `error=stream-cut`, o stream começa normalmente e a conexão cai de verdade depois de `cut-after` chunks, sem `finish_reason` e sem `[DONE]`, como quando um provedor ou a rede caem no meio.

**Bloqueado por:** 06

**Status:** done

**Leitura:** [estudos/04 — Streaming e SSE](../../../estudos/04-streaming-e-sse.md), [estudos/18 — Resiliência](../../../estudos/18-resiliencia.md)

**Antes de começar:** confirmar a decisão 5 da spec (corte abrupto da conexão em vez de evento de erro no SSE).

## Critérios de aceite

- [x] `error=timeout` (normal ou em stream) não envia nada até `MOCK_MAX_DELAY_MS`. Ao atingir o teto, a conexão é encerrada.
- [x] Um SDK com `timeout` curto recebe o erro de timeout dele (`APIConnectionTimeoutError`), e o mock libera o timer quando o cliente desiste.
- [x] `error=stream-cut;cut-after=N` envia os headers `200`, o chunk de `role`, N chunks de conteúdo e destrói o socket, sem `finish_reason` e sem `[DONE]`.
- [x] O SDK, iterando o stream, recebe os N chunks e depois lança um erro de conexão, sem ficar pendurado.
- [x] `error-rate` vale para os dois modos, com `seed` reproduzível.
- [x] `stream-cut` numa requisição sem stream recebe `400` explicando que o modo só vale em stream.

## Pontos de atenção

- Corte ≠ fim. `end()` depois de N chunks é um fim limpo sem `[DONE]`, e o SDK pode tratar isso diferente de um socket destruído. O cenário precisa produzir o segundo caso, que é o que o gateway vai ver quando um provedor cair.
- `timeout` sem teto vira conexão zumbi. O teto é obrigatório.
- No Windows, a forma como o reset de conexão chega ao cliente pode ser diferente da do Linux. Verificar no CI também.
