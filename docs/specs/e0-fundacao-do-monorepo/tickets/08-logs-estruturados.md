# 08: Logs estruturados com pino

**O que construir:** tudo o que o gateway registra sai como JSON de uma linha via pino: os logs internos do Nest (bootstrap, rotas mapeadas) e uma linha por requisição concluída com método, rota, status e duração. O nível de log é controlado por `LOG_LEVEL`. Em desenvolvimento, `LOG_PRETTY` deixa a saída legível; em produção, essa opção é recusada pela configuração. O corpo das requisições e das respostas nunca aparece nos logs.

**Bloqueado por:** 07

**Status:** done

**Leitura:** [estudos/28 — Logs, pino e Loki](../../../estudos/28-logs-pino-e-loki.md)

**Antes de começar:** confirmar `nestjs-pino`, `pino` e `pino-http` (dependências) e `pino-pretty` (devDependency).

## Critérios de aceite

- [x] O logger do Nest é substituído pelo pino; o logger embutido do Fastify fica desligado (uma única linha por requisição).
- [x] `LOG_LEVEL` (níveis do pino) e `LOG_PRETTY` (booleano) entram no contrato de configuração, com teste de que `LOG_PRETTY` em `production` é recusado.
- [x] O seam de construção da aplicação aceita um destino de log em memória; os testes leem as linhas emitidas.
- [x] Teste: uma chamada a `/health` gera uma linha JSON válida com método, rota, status e duração.
- [x] Teste: enviar um corpo numa requisição não faz o corpo aparecer em nenhuma linha de log.
- [x] `pino-pretty` só é carregado quando `LOG_PRETTY` está ligado.

## Pontos de atenção

- Logs são escritos de forma assíncrona; o teste precisa esperar o flush antes de ler o destino.
- Ruído do `/health`: decidir (e justificar) se a sondagem de liveness deve gerar log em `info`.
- Invariante 5: logs de aplicação nunca contêm prompts nem respostas. Este ticket cria a garantia antes de existir qualquer prompt.

## Decisões tomadas na implementação

- **`/health` loga em `info`.** A demo do épico ("`curl /health` mostra a linha JSON") depende disso e o volume é baixo (~8,6 mil linhas/dia com healthcheck a cada 10 s). Rebaixar sondagens 2xx para `debug` via `customLogLevel` fica para quando houver orquestrador e Loki (E6).
- **Um app com logs observados por arquivo de teste.** O `nestjs-pino` mantém uma única instância do pino-http por processo (o primeiro app criado fixa destino e nível). O Vitest isola cada arquivo de teste, então cada cenário de log com configuração própria fica no seu arquivo, com o app criado no `beforeAll`.
- **`LOG_PRETTY` aceita só `"true"`/`"false"`.** `z.coerce.boolean()` foi descartado porque converte `"false"` em `true`.
