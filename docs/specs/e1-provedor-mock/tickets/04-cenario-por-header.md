# 04: Cenário por header: latência e erros HTTP

**O que construir:** um teste pode mandar o mock se comportar de um jeito específico só naquela requisição, usando o header `x-mock-scenario`. Este ticket entrega a gramática do cenário e as chaves que agem antes da resposta: latência fixa ou em intervalo, `429` com `Retry-After`, `500`, `503`, taxa de erro e semente. Como o cenário vale por requisição e o mock não guarda estado, testes em paralelo não interferem entre si.

**Bloqueado por:** 03

**Status:** done

**Leitura:** [estudos/18 — Resiliência](../../../estudos/18-resiliencia.md), [estudos/12 — Validação com Zod](../../../estudos/12-validacao-com-zod.md)

**Antes de começar:** confirmar a decisão 2 da spec (gramática `chave=valor;...` e header `x-mock-scenario`).

## Critérios de aceite

- [x] Testes escritos antes do código (TDD) para o parser do cenário: cenário vazio, cada chave válida, chave desconhecida, número inválido, intervalo invertido, `error-rate` fora de 0–1 e valor acima do teto.
- [x] O parser é uma função pura validada por um schema Zod.
- [x] `latency=N` atrasa a resposta em pelo menos N ms. `latency=MIN-MAX` sorteia uniformemente no intervalo.
- [ ] `error=429` devolve `429` com o header `Retry-After` em segundos (`retry-after=N` ou `MOCK_DEFAULT_RETRY_AFTER_SECONDS`) e o corpo de erro de rate limit da OpenAI. Os valores de `type` e `code` são conferidos na referência da API. Implementado com `type: "requests"` e `code: "rate_limit_exceeded"`, valores das respostas reais da OpenAI, mas a referência da API não foi consultada online nesta sessão.
- [x] `error=500` e `error=503` devolvem o status e o corpo de erro da OpenAI.
- [x] `error-rate=P` aplica o erro com probabilidade P (padrão `1` quando `error` está presente). Com `seed`, a sequência é reproduzível.
- [x] Um cenário inválido recebe `400` no formato da OpenAI, dizendo o que está errado, sem refletir o valor cru.
- [x] Qualquer espera acima de `MOCK_MAX_DELAY_MS` é recusada com `400`.
- [x] Teste com duas requisições simultâneas e cenários diferentes: cada uma recebe o seu comportamento.
- [x] Os testes de tempo verificam só o limite inferior (`≥ N ms`), nunca igualdade, e usam valores pequenos.

## Pontos de atenção

- O header vem do cliente e é entrada não confiável: precisa de validação, de teto e de nunca ser refletido cru.
- Toda espera é um `setTimeout` cancelado no `close` da requisição. Nada de laço ocupado.
- O SDK faz retry sozinho em `429` e `5xx`. Sem `maxRetries: 0`, o teste fica lento e esconde o comportamento.
- `timeout`, `stream-cut`, `ttfb`, `chunk-delay` e `cut-after` podem já ser aceitos pelo parser, mas só ganham efeito nos tickets 06 e 07.
