# 05: Cenário pelo caminho e pelo ambiente, com precedência

**O que construir:** o cenário também pode vir do prefixo da URL base (`/scenarios/{cenário}/v1/...`) e de um padrão da instância (`MOCK_DEFAULT_SCENARIO`). Com isso, um único processo de mock faz o papel de um "provedor A que sempre falha" e de um "provedor B saudável", bastando configurar URLs base diferentes no gateway, sem depender de o gateway repassar headers do cliente (necessário no E7).

**Bloqueado por:** 04

**Status:** done

**Leitura:** [estudos/18 — Resiliência](../../../estudos/18-resiliencia.md)

## Critérios de aceite

- [x] `POST /scenarios/{cenário}/v1/chat/completions` aplica o cenário do caminho, com a mesma gramática do header (escapada para caber num segmento de URL).
- [x] O SDK oficial, configurado com `baseURL` terminando em `/scenarios/{cenário}/v1`, recebe o comportamento do cenário.
- [x] `MOCK_DEFAULT_SCENARIO` vale para toda requisição sem header e sem prefixo. Vazio significa resposta normal e imediata.
- [x] Um `MOCK_DEFAULT_SCENARIO` inválido impede o mock de subir, com o erro de configuração legível.
- [x] Precedência por cenário inteiro (não chave a chave): header > caminho > ambiente. Há um teste para cada combinação.
- [x] Um cenário inválido no caminho recebe `400` com `param` indicando o caminho.
- [x] `GET /health` não é afetado pelo cenário padrão.

## Pontos de atenção

- `;` e `=` dentro de um segmento de URL: conferir como o Fastify decodifica o parâmetro e documentar a forma escapada.
- Um cenário padrão com `latency` alto deixa toda a suíte lenta. Os testes montam o app com o ambiente explícito.
