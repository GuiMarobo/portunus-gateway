# 09: Graceful shutdown com esperas simuladas em andamento

**O que construir:** com SIGTERM ou SIGINT, o mock para de aceitar conexões, encerra os streams, as latências e os `timeout` simulados que estiverem em andamento, e sai dentro de `SHUTDOWN_TIMEOUT_MS`. Assim, `docker compose down` e `Ctrl+C` não travam esperando um `timeout` de 60 s que só existe para teste.

**Bloqueado por:** 07

**Status:** in-review

**Leitura:** [estudos/33 — Docker e Compose](../../../estudos/33-docker-e-compose.md)

## Critérios de aceite

- [x] Ao fechar o app, novas conexões são recusadas.
- [x] Requisições normais sem espera em andamento terminam com a resposta completa.
- [x] Streams, latências e `timeout` simulados em andamento são interrompidos: os timers são cancelados e as conexões encerradas.
- [x] Se o fechamento travar, um temporizador de segurança (`SHUTDOWN_TIMEOUT_MS`) força a saída com um log de aviso.
- [x] Testes pelo seam de montagem, sem sinal real, com prazo pequeno ou fake timers.
- [ ] Verificação manual com `Ctrl+C` no host e `docker stop` (SIGTERM) no container (depois do ticket 10).

## Pontos de atenção

- O `close` do Fastify espera as conexões abertas. Um `timeout` simulado segura o fechamento até o teto, a menos que o mock rastreie e encerre as esperas ativas.
- No Windows, SIGTERM não é entregue como sinal. O comportamento real com SIGTERM só é verificável em Linux (container, CI, WSL), como no E0.
