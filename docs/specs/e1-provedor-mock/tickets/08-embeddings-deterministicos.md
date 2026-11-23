# 08: Embeddings determinísticos

**O que construir:** o SDK oficial chama `embeddings.create` contra o mock e recebe vetores reprodutíveis: o mesmo texto gera sempre o mesmo vetor, e textos diferentes geram vetores diferentes. Os vetores têm norma 1, o número de dimensões é configurável, e os formatos `float` e `base64` funcionam. O cenário (latência e erros) também vale aqui, para o E10 testar a resiliência do cache semântico.

**Bloqueado por:** 04

**Status:** done

**Leitura:** [estudos/05 — Embeddings](../../../estudos/05-embeddings.md), [estudos/06 — Busca vetorial e pgvector](../../../estudos/06-busca-vetorial-e-pgvector.md)

## Critérios de aceite

- [x] Testes escritos antes do código (TDD) para o gerador de vetores: determinismo, norma 1 (com tolerância de ponto flutuante) e dimensões.
- [x] `POST /v1/embeddings` devolve `object: "list"`, um item `{object: "embedding", index, embedding}` por entrada, `model` e `usage` (`prompt_tokens`, `total_tokens`).
- [x] `input` aceita uma string ou uma lista de strings. Lista vazia ou ausente recebe `400` no formato da OpenAI.
- [x] O vetor depende de (`model`, texto). Mudar qualquer um dos dois muda o vetor.
- [x] As dimensões padrão vêm de `MOCK_EMBEDDING_DIMENSIONS` (1536). `dimensions` na requisição é respeitado até `MOCK_MAX_EMBEDDING_DIMENSIONS`; acima disso, `400`.
- [x] `encoding_format: "float"` devolve uma lista de números. `encoding_format: "base64"` devolve Float32 little-endian em base64.
- [x] O SDK, sem `encoding_format` explícito (ele pede base64), devolve o mesmo vetor que a requisição com `float`.
- [x] Os tokens seguem a regra do prompt do ticket 02, somados sobre os itens de `input`.
- [x] `latency`, `429`, `500`, `503`, `timeout` e `error-rate` valem para embeddings. `stream-cut` recebe `400`.

## Pontos de atenção

- O SDK pede base64 por padrão. Um mock que só sabe `float` passa no `curl` e quebra no SDK.
- Complexidade: gerar e normalizar é O(d) por entrada, com uma única alocação do vetor. Para 1536 dimensões e lotes grandes, evitar converter para string e voltar.
- Sem semântica: paráfrases geram vetores sem relação. A decisão sobre isso continua em aberto para o E10.
