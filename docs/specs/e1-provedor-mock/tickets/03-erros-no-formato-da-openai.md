# 03: Erros no formato da OpenAI na fronteira do mock

**O que construir:** toda resposta de erro do mock usa o formato da OpenAI (`error.message`, `error.type`, `error.param`, `error.code`), e o SDK oficial a transforma no erro tipado dele (`AuthenticationError`, `BadRequestError`, `NotFoundError`). Assim o gateway nunca precisa tratar um formato de erro diferente vindo do mock.

**Bloqueado por:** 02

**Status:** done

**Leitura:** [estudos/01 — LLMs e a API de chat](../../../estudos/01-llms-e-a-api-de-chat.md)

## Critérios de aceite

- [x] Uma requisição sem `Authorization: Bearer <token não vazio>` recebe `401` com `type: "invalid_request_error"` e `code: "invalid_api_key"`. Qualquer token não vazio é aceito.
- [x] Uma requisição sem `model`, sem `messages` ou com `messages` vazio recebe `400` com `param` apontando o campo.
- [x] Um corpo que não é JSON válido recebe `400` no mesmo formato.
- [x] `n > 1` recebe `400`.
- [x] Uma rota desconhecida recebe `404` no formato da OpenAI.
- [x] `GET /health` continua sem exigir `Authorization`.
- [x] Nos testes, o SDK lança o erro tipado esperado para cada caso. Onde o SDK esconde detalhes (corpo cru, header), o teste usa `fetch`.
- [x] Nenhum valor enviado pelo cliente é refletido cru na mensagem de erro nem no log.

## Pontos de atenção

- Os erros padrão do Fastify (JSON inválido, `404`) têm o formato do Fastify. É preciso trocar o error handler e o not-found handler, senão eles escapam do formato da OpenAI.
- A validação do corpo deve ser permissiva com campos desconhecidos, porque o SDK manda campos que o mock não usa.
