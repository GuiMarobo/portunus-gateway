# 02: Chat completion normal e determinística pelo SDK

**O que construir:** o SDK oficial da OpenAI, apontado para o mock (só trocando `baseURL` e `apiKey`), chama `chat.completions.create` e recebe um `chat.completion` válido. A resposta é determinística: a mesma requisição gera sempre o mesmo `content` e o mesmo `usage`, e a contagem de tokens segue uma regra que dá para calcular à mão.

**Bloqueado por:** 01

**Status:** ready-for-agent

**Leitura:** [estudos/01 — LLMs e a API de chat](../../../estudos/01-llms-e-a-api-de-chat.md), [estudos/02 — Tokens e tokenização](../../../estudos/02-tokens-e-tokenizacao.md)

**Antes de começar:** confirmar a decisão 3 da spec (regra de tokens) e a dependência dev `openai`.

## Critérios de aceite

- [ ] Testes escritos antes do código (TDD) para a canonicalização com hash e para a regra de tokens.
- [ ] `POST /v1/chat/completions` devolve `id` (prefixo `chatcmpl-`), `object: "chat.completion"`, `created` (do relógio injetado), `model` igual ao pedido, um item em `choices` com `message.role = "assistant"`, `message.content` e `finish_reason: "stop"`, e `usage`.
- [ ] Qualquer nome de modelo é aceito. Campos não usados (`temperature`, `top_p`, `user`, `metadata`, `response_format` etc.) são aceitos e ignorados.
- [ ] A mesma requisição gera o mesmo `content` e o mesmo `usage`, inclusive com as chaves do JSON em outra ordem.
- [ ] Mudar uma mensagem, o modelo ou o limite de tokens muda o `content`. Mudar `temperature` não muda.
- [ ] O conteúdo vem de um vocabulário fixo, sorteado por um PRNG semeado pelo hash, e nunca ecoa o prompt.
- [ ] Regra de tokens: na resposta, 1 palavra = 1 token; no prompt, `ceil(caracteres/4)` de cada mensagem mais um custo fixo por mensagem. `total_tokens = prompt_tokens + completion_tokens`.
- [ ] O tamanho padrão da resposta vem de `MOCK_DEFAULT_COMPLETION_TOKENS`.
- [ ] `max_tokens` ou `max_completion_tokens` menor que o tamanho padrão corta a resposta e devolve `finish_reason: "length"`.
- [ ] Os testes usam o SDK oficial com `maxRetries: 0`.

## Pontos de atenção

- `JSON.stringify` depende da ordem de inserção das chaves. Sem canonicalizar antes do hash, o determinismo é falso. É a mesma armadilha da chave do cache exato (E9).
- O cenário (que entra no 04) não pode entrar no hash. Latência não muda o conteúdo.
- Big-O: o hash é O(tamanho da requisição) e a geração é O(tokens). Nenhum dos dois pode ser caro, porque o mock não pode virar o gargalo da carga.
