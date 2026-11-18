# 10: Graceful shutdown

**O que construir:** ao receber SIGTERM ou SIGINT, o gateway para de aceitar novas conexões, deixa as requisições em andamento terminarem e encerra. Se o fechamento travar além de `SHUTDOWN_TIMEOUT_MS`, o processo termina mesmo assim, com um log de aviso. Um `Ctrl+C` durante o `pnpm dev` encerra de forma limpa, e os hooks de ciclo de vida do Nest passam a ser o lugar padrão para fechar conexões nos próximos épicos.

**Bloqueado por:** 09

**Status:** done

**Leitura:** [estudos/10 — NestJS e Fastify](../../../estudos/10-nestjs-e-fastify.md) §6

## Critérios de aceite

- [x] `SHUTDOWN_TIMEOUT_MS` entra no contrato de configuração, com padrão e validação de número positivo.
- [x] Hooks de shutdown do Nest habilitados para SIGTERM e SIGINT.
- [x] Teste pelo seam: com uma requisição lenta em andamento (rota registrada só no teste), fechar a aplicação espera essa requisição terminar com sucesso.
- [x] Teste: se o fechamento passar do prazo, a saída forçada acontece e um log de aviso é emitido, sem esperar tempo real (prazo pequeno ou fake timers).
- [x] Verificação manual com `Ctrl+C` no `pnpm dev` registrada no PR (log de encerramento e código de saída).

## Pontos de atenção

- No Windows, SIGTERM não é entregue como sinal; o processo é morto à força. O teste com sinal real fica para Linux (CI, container ou WSL); localmente vale o SIGINT.
- Keep-alive: conexões HTTP ociosas podem segurar o `close` do servidor. Entender como o Fastify lida com isso.
- O temporizador de segurança não pode manter o processo vivo depois de um shutdown bem-sucedido.

## Verificação manual

Feita em 2026-11-18, macOS, Node 22 (`.nvmrc`). Vai para a descrição do PR.

| Cenário                                            | Logs de encerramento                                        | Código de saída                                   |
| -------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| `pnpm dev` + `GET /health` + `Ctrl+C`              | `Graceful shutdown started` → `Graceful shutdown completed` | 130 (do watcher do `pnpm dev`, morto pelo SIGINT) |
| `pnpm --filter @portunus/gateway start` + `Ctrl+C` | `Graceful shutdown started` → `Graceful shutdown completed` | 0                                                 |
| `start` + `kill -TERM <pid>`                       | `Graceful shutdown started` → `Graceful shutdown completed` | 0                                                 |

Depois de cada encerramento, a porta 3000 ficou livre (`lsof -i :3000` sem resultado).

A saída forçada pelo prazo (`SHUTDOWN_TIMEOUT_MS`) não tem verificação manual, porque ainda não há rota lenta. Ela é coberta pelo teste automatizado em `graceful-shutdown.spec.ts`.
