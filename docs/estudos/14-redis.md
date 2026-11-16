# 14 — Redis

> **Épicos:** E2 (cache de chaves), E7 (circuit breaker), E8 (rate limit e orçamento), E9 (cache exato), E14 (BullMQ).
> **Onde:** adapters em `infrastructure/` de vários módulos; cliente `ioredis`.

---

## 1. O problema

Várias etapas do caminho crítico precisam de um estado **compartilhado entre instâncias** do gateway e **muito rápido** (frações de milissegundo): contadores de rate limit, cache de respostas, estado do circuit breaker, filas de jobs. O Postgres é durável, mas lento demais e caro demais para ser consultado várias vezes em cada requisição. Guardar em memória do processo não funciona com mais de uma instância.

## 2. Como funciona

### 2.1 O essencial

- **Banco em memória** de chave → valor, com estruturas de dados ricas.
- **Execução de comandos single-threaded:** um comando roda por vez, do início ao fim. Isso torna **cada comando atômico** sem locks. (Versões 6+ usam threads para I/O de rede, mas a execução continua sequencial.)
- **Latência sub-milissegundo** numa rede local; a maioria dos comandos é O(1) ou O(log n).

### 2.2 Estruturas de dados e onde servem

| Estrutura | Comandos típicos | Complexidade | Uso no projeto |
|---|---|---|---|
| **String** | `GET`, `SET key val EX 60`, `INCR`, `INCRBY` | O(1) | Cache exato, cache de chave de API, contadores |
| **Hash** | `HSET`, `HGET`, `HINCRBY` | O(1) por campo | Estado do circuit breaker (estado, falhas, aberto em) |
| **Sorted set** | `ZADD`, `ZRANGEBYSCORE`, `ZREMRANGEBYSCORE` | O(log n) | Rate limit por janela deslizante (log) |
| **List** | `LPUSH`, `BRPOP` | O(1) nas pontas | Filas simples (o BullMQ usa por baixo) |
| **Stream** | `XADD`, `XREADGROUP`, `XACK` | O(1) amortizado | Log de eventos com grupos de consumidores |
| **Pub/Sub** | `PUBLISH`, `SUBSCRIBE` | O(assinantes) | Notificações efêmeras (sem persistência) |

### 2.3 TTL e expiração

`SET chave valor EX 300` expira em 300 s. O Redis remove chaves expiradas de forma preguiçosa (ao acessar) e por amostragem periódica. TTL é a ferramenta principal de "limpeza automática" de cache e de janelas de rate limit.

### 2.4 Atomicidade composta: Lua e MULTI

Um comando é atômico, mas "ler, decidir e escrever" são três comandos, e entre eles outra instância pode agir (race condition). Soluções:

- **Scripts Lua** (`EVAL`/`EVALSHA`): o script inteiro roda atomicamente no servidor. É o padrão para rate limit.
- **`MULTI`/`EXEC`:** enfileira comandos e os executa juntos (sem lógica condicional no meio).
- **`WATCH`:** controle otimista (aborta se a chave mudou).

```lua
-- janela fixa: incrementa e define TTL na primeira vez, de forma atômica
local current = redis.call("INCR", KEYS[1])
if current == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
return current
```

### 2.5 Memória e eviction

O Redis tem um teto (`maxmemory`). Ao atingi-lo, aplica uma **política de remoção**: `noeviction` (recusa escritas), `allkeys-lru`, `volatile-lru` (só chaves com TTL), `allkeys-lfu`... Para cache, `allkeys-lru` ou `allkeys-lfu` faz sentido. Mas cuidado: se o mesmo Redis guarda contadores de rate limit e filas do BullMQ, uma eviction pode apagar dados que não são cache. **O BullMQ exige `noeviction`.**

### 2.6 Persistência

- **RDB:** snapshots periódicos (rápido de restaurar, pode perder os últimos minutos).
- **AOF:** log de cada escrita (mais durável, arquivo maior).

No projeto, cache e contadores podem ser perdidos (há fallback e reconciliação); as filas do BullMQ, nem tanto.

## 3. Analogia

O Redis é o **quadro branco da sala de operações**. Todo mundo olha para ele, as anotações são rápidas de ler e escrever, e cada pessoa escreve uma coisa por vez (single-threaded), então ninguém rabisca por cima do outro. Mas ele não é o arquivo oficial: se alguém apaga o quadro, a operação continua, só fica mais lenta até reescreverem (o Postgres é o arquivo oficial). E há um espaço limitado: quando o quadro enche, apaga-se o que ninguém olha há mais tempo (LRU).

## 4. Por que está nesta arquitetura

- **Rate limit e orçamento:** contadores atômicos compartilhados entre instâncias.
- **Cache exato:** `GET` O(1) com TTL.
- **Auth:** evita uma query no Postgres por requisição.
- **Circuit breaker:** todas as instâncias enxergam o mesmo estado do provedor.
- **BullMQ:** as filas de jobs assíncronos vivem no Redis.
- Uma tecnologia só resolve vários problemas, com operação simples.

## 5. Ferramentas similares

| Ferramenta | Diferença principal | Quando escolher |
|---|---|---|
| **Valkey** | Fork open source do Redis (Linux Foundation), criado após a mudança de licença do Redis em 2024; compatível com o protocolo | Quer garantia de licença open source |
| **Memcached** | Só strings, multi-thread, sem persistência nem estruturas | Cache puro e simples |
| **Dragonfly** | Compatível com Redis, multi-thread, alto throughput numa máquina | Instância única muito carregada |
| **KeyDB** | Fork multi-thread do Redis | Similar ao Dragonfly |
| **Hazelcast, Apache Ignite** | Grid de dados distribuído (JVM) | Ecossistema Java, computação distribuída |
| **Cache em memória do processo** (`lru-cache`) | Sem rede, mais rápido, mas não compartilhado | Dados imutáveis ou por instância (ex.: tabela de preços) |

Sobre licença: o Redis mudou para licenças source-available em 2024 e voltou a oferecer a AGPLv3 a partir do Redis 8. Para um projeto de estudo isso não muda nada, mas é um tema que aparece em entrevistas e decisões de empresa.

## 6. Armadilhas

- **Comandos O(n) em produção** (`KEYS *`, `SMEMBERS` de sets enormes) travam o servidor inteiro, já que ele é single-threaded. Use `SCAN`.
- **Hot keys:** uma chave acessada por todas as requisições (ex.: o circuit breaker de um provedor) concentra carga.
- **Race conditions** em "ler e depois escrever" sem Lua.
- **Redis fora do ar:** precisa de comportamento definido (fail-open no rate limit e no cache, ADR 006; `503` no assíncrono).
- **Eviction apagando o que não é cache.** Considere instâncias (ou bancos lógicos e políticas) separados para cache × filas.
- **Chaves sem tenant:** violaria o isolamento (invariante 3). Padronize um *key builder*.

## 7. No Portunus

| Chave | Épico |
|---|---|
| `auth:key:{hash}` | E2 |
| `cb:{provider}` | E7 |
| `rl:{tenant}:{janela}`, `budget:{tenant}:{aaaamm}` | E8 |
| `cache:exact:{tenant}:{hash}` | E9 |
| Filas BullMQ `async-chat`, `webhooks` | E14 |

## 8. Para aprofundar

- Redis — documentação de tipos de dados: https://redis.io/docs/latest/develop/data-types/
- Redis — *Programmability with Lua*: https://redis.io/docs/latest/develop/interact/programmability/eval-intro/
- Redis — *Key eviction*: https://redis.io/docs/latest/develop/reference/eviction/
- ioredis: https://github.com/redis/ioredis
- Valkey: https://valkey.io/
