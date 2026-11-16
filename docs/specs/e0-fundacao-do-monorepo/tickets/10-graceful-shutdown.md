# 10: Graceful shutdown

**O que construir:** ao receber SIGTERM ou SIGINT, o gateway para de aceitar novas conexões, deixa as requisições em andamento terminarem e encerra. Se o fechamento travar além de `SHUTDOWN_TIMEOUT_MS`, o processo termina mesmo assim, com um log de aviso. Um `Ctrl+C` durante o `pnpm dev` encerra de forma limpa, e os hooks de ciclo de vida do Nest passam a ser o lugar padrão para fechar conexões nos próximos épicos.

**Bloqueado por:** 09

**Status:** ready-for-agent

**Leitura:** [estudos/10 — NestJS e Fastify](../../../estudos/10-nestjs-e-fastify.md) §6

## Critérios de aceite

- [ ] `SHUTDOWN_TIMEOUT_MS` entra no contrato de configuração, com padrão e validação de número positivo.
- [ ] Hooks de shutdown do Nest habilitados para SIGTERM e SIGINT.
- [ ] Teste pelo seam: com uma requisição lenta em andamento (rota registrada só no teste), fechar a aplicação espera essa requisição terminar com sucesso.
- [ ] Teste: se o fechamento passar do prazo, a saída forçada acontece e um log de aviso é emitido, sem esperar tempo real (prazo pequeno ou fake timers).
- [ ] Verificação manual com `Ctrl+C` no `pnpm dev` registrada no PR (log de encerramento e código de saída).

## Pontos de atenção

- No Windows, SIGTERM não é entregue como sinal; o processo é morto à força. O teste com sinal real fica para Linux (CI, container ou WSL); localmente vale o SIGINT.
- Keep-alive: conexões HTTP ociosas podem segurar o `close` do servidor. Entender como o Fastify lida com isso.
- O temporizador de segurança não pode manter o processo vivo depois de um shutdown bem-sucedido.
