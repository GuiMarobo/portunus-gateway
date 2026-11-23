<!--
Título do PR em Conventional Commits, em inglês, com escopo = módulo ou app:
  feat(cache): add exact cache lookup
O corpo é em português. Comentários como este não aparecem no PR renderizado.
Seções que não se aplicam: escreva "Não se aplica" em vez de apagar.
-->

Implementa o ticket [NN — título](https://github.com/GuiMarobo/portunus-gateway-setup/blob/main/docs/specs/<feature>/tickets/NN-slug.md) do épico [EX — título](https://github.com/GuiMarobo/portunus-gateway-setup/blob/main/docs/specs/<feature>/spec.md).

## Resumo

<!-- 2 a 4 frases: qual problema este PR resolve e qual comportamento passa a existir. Escreva para quem não leu o ticket. -->

## O que mudou

<!-- Um arquivo ou grupo de arquivos por linha. Diga o que mudou, não repita o diff. -->

| Arquivo              | Mudança |
| -------------------- | ------- |
| `caminho/arquivo.ts` |         |

## Decisões e porquês

<!--
Para cada decisão não óbvia: o que foi escolhido, por quê e quais alternativas ficaram de fora (com o trade-off).
Se a decisão contradiz a spec, um ADR ou o ARQUITETURA.md, diga aqui e aponte onde o documento foi atualizado.
Padrão de projeto usado (Adapter, Strategy, Circuit Breaker...)? Diga qual e por que ele resolve o problema.
-->

**Decisão.** Motivo. Alternativa descartada: ... (trade-off).

## Critérios de aceite

<!-- Copie do ticket e marque. Critério não atendido fica desmarcado e com a explicação ao lado. -->

- [ ]

## Mudanças que exigem atenção

<!-- Marque o que se aplica e explique abaixo. Pelo CLAUDE.md §5, cada item precisa de aprovação prévia. -->

- [ ] Dependência nova (qual, em qual pacote e por quê)
- [ ] Schema de banco ou migration
- [ ] Contrato de API, de evento ou de configuração
- [ ] Desvio do ARQUITETURA.md, de um ADR ou de um invariante
- [ ] Nenhuma das anteriores

## Invariantes

<!-- Marque os que este PR toca e confirme que foram respeitados. Apague os que não se aplicam. -->

- [ ] Nada secundário (eventos, indexação, métricas, logs) bloqueia ou derruba a resposta de inferência
- [ ] Ordem da esteira: auth → rate limit → orçamento → cache exato → cache semântico → provedor → custo → resposta → evento
- [ ] Toda chave de Redis, query e entrada de cache inclui o tenant
- [ ] Testes e carga rodam só contra o provedor mock
- [ ] Logs de aplicação não contêm prompts nem respostas
- [ ] `request_id` e `trace_id` não viram label de métrica
- [ ] Consumidores idempotentes pelo `event_id`
- [ ] Streaming: fallback só antes do primeiro byte
- [ ] Preços com vigência: custos passados não mudam
- [ ] Erros no formato da OpenAI na fronteira da API

## Como foi verificado

Ambiente: <!-- SO, versão do Node e do pnpm, Docker ligado ou não -->

### Verificação obrigatória (CLAUDE.md §5)

<!-- Cole o resumo real da saída de cada comando. Nunca marque sem ter rodado. -->

| Verificação                                 | Resultado               |
| ------------------------------------------- | ----------------------- |
| `pnpm typecheck`                            |                         |
| `pnpm lint`                                 |                         |
| `pnpm test`                                 | <!-- ex.: 12 passed --> |
| `pnpm test:int`                             |                         |
| App contra o mock + chamada na rota afetada |                         |

### Testes específicos deste PR

<!--
Um bloco por verificação: o comando, a saída relevante e o que ela prova.
Inclua os casos negativos (o que deve falhar e falhou).
-->

```console
$ comando
saída
```

Resultado:

### O que não foi verificado

<!-- O que ficou sem rodar e por quê (Docker parado, rota inexistente, fora do escopo). Se tudo rodou, escreva "Nada". -->

| Verificação | Motivo | Quando passa a ser possível |
| ----------- | ------ | --------------------------- |
|             |        |                             |

## Como testar localmente

```powershell

```

## Riscos e pontos de atenção

<!--
O que costuma passar despercebido, quando se aplica:
- concorrência e race conditions
- idempotência e reentrega
- modos de falha (timeout, provedor fora, Redis fora) e o que o usuário vê em cada um
- cardinalidade de métricas
- segurança (entrada não confiável, segredos, PII em logs)
- custo (tokens, chamadas ao provedor, armazenamento)
- impacto para quem já tem o repositório clonado (migração local, variáveis novas no .env)
-->

## Fora de escopo

<!-- O que ficou de fora de propósito e em qual ticket ou épico entra. -->

-
