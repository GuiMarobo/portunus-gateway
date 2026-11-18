# 09: `request_id` e redação de dados sensíveis

**O que construir:** toda requisição ao gateway tem um `request_id`, devolvido no header `x-request-id` (inclusive em `404`) e presente em toda linha de log emitida durante aquela requisição, até nas de serviços internos. Um `x-request-id` válido enviado pelo cliente é reaproveitado; um inválido é trocado por um UUID gerado. Headers de credencial (`authorization`, `x-api-key`, `cookie`, `set-cookie`) aparecem sempre redigidos nos logs, antes mesmo de existir autenticação.

**Bloqueado por:** 08

**Status:** in-review

**Leitura:** [estudos/28 — Logs, pino e Loki](../../../estudos/28-logs-pino-e-loki.md), [estudos/25 — PII e privacidade](../../../estudos/25-pii-e-privacidade.md)

**Antes de começar:** confirmar o contrato do `x-request-id` (até 128 caracteres em `[A-Za-z0-9._-]`; fora disso, UUID v4).

## Critérios de aceite

- [x] Sem header: a resposta traz um `x-request-id` no formato UUID v4.
- [x] Header válido: a resposta devolve exatamente o mesmo valor.
- [x] Header inválido (longo demais, com quebra de linha, com caracteres proibidos): é descartado e substituído por um UUID.
- [x] Rota inexistente (`404`) também devolve o `x-request-id`.
- [x] A linha de log da requisição contém o mesmo `request_id` devolvido no header.
- [x] Um log emitido dentro de um provider durante a requisição sai com o mesmo `request_id`, sem que o id seja passado manualmente (contexto propagado por `AsyncLocalStorage`).
- [x] `authorization`, `x-api-key`, `cookie` e `set-cookie` aparecem redigidos na linha de log (teste com valores reais nos headers).

## Pontos de atenção

- `request_id` vindo do cliente é entrada não confiável: sem validação, vira injeção de log (quebra de linha forjando uma linha falsa) e lixo nas buscas.
- Invariante 6: o `request_id` nunca vira label de métrica (relevante a partir do E6).
- Explicar `AsyncLocalStorage`: como o contexto atravessa `await` sem ser passado como parâmetro, e o custo disso.
