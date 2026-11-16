# 17 — Rate limiting

> **Épicos:** E8.
> **Módulos:** `ratelimit`.
> **ADRs:** algoritmo de rate limit; 006 (fail-open).

---

## 1. O problema

Sem limite, um único cliente (ou um loop com bug) consome toda a capacidade do gateway e toda a cota que a empresa tem com o provedor. Os outros clientes começam a receber erros por culpa de alguém que eles nem conhecem. É a dor "um consumidor atrapalha todos" (CONTEXT.md §2).

## 2. Como funciona

Rate limiting é contar o uso de cada cliente numa janela de tempo e recusar o excesso com `429 Too Many Requests` e o header `Retry-After`. A diferença entre as técnicas está em **como contar o tempo**.

### 2.1 Janela fixa (fixed window)

Um contador por minuto do relógio: `rl:{tenant}:2026-11-13T10:05`. `INCR` + `EXPIRE`.

- **Complexidade:** O(1) em tempo e espaço.
- **Problema:** **rajada na borda.** Com limite de 100/min, o cliente faz 100 às 10:05:59 e mais 100 às 10:06:00, ou seja, 200 em 2 segundos.

### 2.2 Log de janela deslizante (sliding window log)

Guarda o **timestamp de cada requisição** num *sorted set*. A cada chamada: remove os mais antigos que 60 s, conta os restantes e decide.

- **Complexidade:** O(log n) por operação; espaço O(limite) por cliente.
- **Prós:** exato.
- **Contras:** memória cresce com o limite (10 mil req/min = 10 mil entradas por cliente).

### 2.3 Contador de janela deslizante (sliding window counter)

Combina a janela atual e a anterior com um peso:

```
estimativa = contagem_atual + contagem_anterior × (fração da janela anterior que ainda "conta")
```

- **Complexidade:** O(1) em tempo e espaço.
- **Prós:** quase tão preciso quanto o log, com custo da janela fixa. A Cloudflare usa uma variação disso.

### 2.4 Token bucket (balde de fichas)

Cada cliente tem um balde de capacidade **C** que recebe **r** fichas por segundo. Cada requisição consome uma ficha (ou N, para limite de tokens). Sem fichas → `429`.

- **Complexidade:** O(1); guarda só `(fichas, último_reabastecimento)` e calcula a reposição de forma preguiçosa a cada acesso.
- **Prós:** permite **rajadas controladas** (até C) mantendo a taxa média r. Natural para **limitar tokens** de LLM (cada chamada consome um número variável).

### 2.5 Leaky bucket (balde furado)

Requisições entram numa fila que "vaza" a uma taxa constante. Suaviza o tráfego, mas atrasa em vez de recusar. É usado pelo `limit_req` do NGINX. Uma variante sem fila é o **GCRA** (*Generic Cell Rate Algorithm*), equivalente matemático do token bucket com um único timestamp.

### 2.6 Resumo

| Algoritmo | Tempo | Espaço/cliente | Precisão | Rajadas |
|---|---|---|---|---|
| Janela fixa | O(1) | O(1) | Baixa na borda | Até 2× na virada |
| Sliding log | O(log n) | O(limite) | Exata | Não |
| Sliding counter | O(1) | O(1) | Boa (aproximada) | Suavizadas |
| Token bucket | O(1) | O(1) | Boa | Controladas (capacidade C) |
| Leaky bucket | O(1) | O(fila) | Boa | Enfileiradas |

### 2.7 Limitar tokens, não só requisições

Uma requisição de 10 tokens e outra de 100 mil não pesam igual. Para tokens/min:

1. **Antes:** estima os tokens (entrada contada ou aproximada + `max_tokens`) e **reserva**.
2. **Depois:** com o `usage` real, **ajusta** (devolve a diferença).

### 2.8 Atomicidade

"Ler o contador, comparar e incrementar" precisa ser **atômico** entre instâncias do gateway. A solução é um **script Lua** no Redis ([14](./14-redis.md)), que roda inteiro sem interrupção.

### 2.9 Headers de resposta

- `429` + `Retry-After: <segundos>`.
- `x-ratelimit-limit-requests`, `x-ratelimit-remaining-requests`, `x-ratelimit-reset-requests` (e as equivalentes para tokens), no estilo da OpenAI. Existe também um rascunho da IETF para headers `RateLimit` padronizados.

## 3. Analogia

- **Janela fixa:** a catraca do restaurante por quilo libera 100 pessoas por hora "cheia". Às 11:59 entram 100, às 12:00 entram mais 100: a cozinha colapsa.
- **Token bucket:** um **cartão de vale-transporte** que recarrega 1 passagem a cada 10 minutos, até no máximo 6. Você pode usar 6 de uma vez (rajada), mas depois precisa esperar a recarga.
- **Leaky bucket:** um **funil**. Por mais que você despeje rápido, a água sai num fio constante.

## 4. Por que está nesta arquitetura

- **Isolamento entre tenants:** um cliente com bug não derruba os outros.
- **Proteção da cota com o provedor:** o gateway tem limites contratados com a OpenAI e a Anthropic; precisa distribuí-los.
- Fica **cedo** na esteira (logo após auth): recusar barato, antes de gastar com cache, embedding ou provedor.

## 5. Ferramentas similares

| Ferramenta | Onde atua | Diferença |
|---|---|---|
| **NGINX `limit_req`** | Proxy reverso | Leaky bucket por IP/chave; sem noção de tokens de LLM |
| **Envoy / Istio** | Service mesh | Rate limit local e global (com um serviço de rate limit) |
| **Kong, AWS API Gateway** | API gateway | Plugins prontos; limites por consumidor |
| **Cloudflare** | Edge | Bloqueia antes de chegar à sua infraestrutura |
| **`@nestjs/throttler`** | Biblioteca Nest | Simples, por rota; armazenamento plugável |
| **`rate-limiter-flexible`** | Biblioteca Node | Vários algoritmos e backends (Redis, memória, Postgres) |
| **redis-cell** | Módulo do Redis | GCRA nativo num comando |

O projeto implementa à mão (com Strategy para trocar de algoritmo) porque o objetivo é aprender e porque precisa limitar **tokens**, algo que as soluções genéricas não fazem.

## 6. Armadilhas

- **Redis fora:** fail-open (deixa passar, com alerta) ou fail-closed (bloqueia tudo)? O projeto escolhe fail-open (ADR 006): a disponibilidade da inferência vem primeiro.
- **Relógios diferentes entre instâncias:** use o tempo do Redis (`TIME`) dentro do script Lua, não o relógio de cada processo.
- **Reserva de tokens nunca devolvida** quando a requisição falha → o cliente fica limitado sem ter usado.
- **Cardinalidade:** a métrica de rejeições por tenant é aceitável; por chave ou por IP pode explodir.
- **Limite global × por instância:** contador em memória do processo não funciona com várias instâncias.
- **Retry dos clientes:** clientes que ignoram `Retry-After` e reenviam imediatamente pioram tudo.

## 7. No Portunus

- E8: tabela `rate_limit_policies`, script Lua, limites de requisições e tokens por minuto, headers, fail-open e métrica `gateway_ratelimit_rejections_total{tenant}`.

## 8. Para aprofundar

- Cloudflare — *How we built rate limiting capable of scaling to millions of domains*: https://blog.cloudflare.com/counting-things-a-lot-of-different-things/
- Stripe — *Scaling your API with rate limiters*: https://stripe.com/blog/rate-limiters
- OpenAI — *Rate limits* (headers e conceitos de RPM/TPM): https://platform.openai.com/docs/guides/rate-limits
- IETF — *RateLimit header fields for HTTP* (rascunho): https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/
