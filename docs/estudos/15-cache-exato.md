# 15 — Cache: fundamentos e cache exato

> **Épicos:** E9 (cache exato); base para o E10 (cache semântico) e o E2 (cache de chaves).
> **Módulos:** `cache`.

---

## 1. O problema

Uma chamada de LLM custa dinheiro e leva segundos. Se a mesma pergunta, com os mesmos parâmetros, já foi respondida, pagar e esperar de novo é desperdício. Mas cachear de forma errada é pior: entregar a resposta de um cliente para outro, ou uma resposta cortada, ou uma desatualizada.

## 2. Como funciona

### 2.1 Vocabulário de cache

- **Hit:** o dado estava no cache. **Miss:** não estava.
- **Hit rate:** hits ÷ (hits + misses). É a métrica número um.
- **TTL (_time to live_):** por quanto tempo uma entrada vale.
- **Invalidação:** remover ou atualizar uma entrada quando o dado de origem muda. ("Há só duas coisas difíceis em Ciência da Computação: invalidação de cache e dar nomes às coisas." — Phil Karlton)
- **Eviction:** remoção por falta de espaço (LRU, LFU...).

### 2.2 Estratégias de leitura e escrita

| Estratégia                     | Como funciona                                                           | Uso                                  |
| ------------------------------ | ----------------------------------------------------------------------- | ------------------------------------ |
| **Cache-aside (lazy loading)** | A aplicação consulta o cache; no miss, busca na origem e grava no cache | **A usada no gateway**               |
| **Read-through**               | O próprio cache busca na origem no miss                                 | Bibliotecas e CDNs                   |
| **Write-through**              | Toda escrita vai ao cache e à origem juntas                             | Dados que mudam e são lidos muito    |
| **Write-behind (write-back)**  | Escreve no cache e grava na origem depois, em lote                      | Alto volume de escrita, tolera perda |

### 2.3 A chave do cache exato

A chave precisa identificar **exatamente** tudo o que muda a resposta, e **nada além disso**:

```
chave = SHA-256( canonical_json({
  tenant_id,
  resolved_model,          // o modelo real, não o alias
  messages_normalizadas,
  temperature, top_p, max_tokens, stop, seed, tools, response_format, ...
}) )
→ cache:exact:{tenant}:{hash}
```

- **Tenant na chave:** invariante 3. Sem isso, dois clientes com o mesmo prompt compartilhariam resposta.
- **Modelo resolvido, não o alias:** se o alias `rapido` passa a apontar para outro modelo, as respostas antigas não devem ser servidas como se fossem do novo.
- **JSON canônico:** `{"a":1,"b":2}` e `{"b":2,"a":1}` são o mesmo objeto, mas geram strings diferentes. É preciso ordenar as chaves, padronizar números e remover campos irrelevantes antes do hash.
- **Campos que não mudam a saída** (ex.: `user`, `stream`) ficam **fora**, para não reduzir o hit rate à toa. `stream` fica fora porque a mesma resposta pode ser servida em stream ou não.

### 2.4 Por que hash?

- Tamanho fixo (64 caracteres hex para SHA-256), independente do tamanho do prompt.
- Distribuição uniforme e probabilidade de colisão desprezível.
- Não expõe o conteúdo do prompt no nome da chave.

**Complexidade:** serializar e calcular o hash é O(n) no tamanho do request; o `GET` no Redis é O(1). O custo total é dominado pela serialização, que é muito menor que uma chamada de LLM.

### 2.5 O que pode ir para o cache

- Só respostas **bem-sucedidas e completas** (`finish_reason: "stop"`; decidir sobre `length`).
- Nunca erros.
- Em streaming: acumula os chunks e grava ao final; num hit, reproduz como stream.

### 2.6 Cache stampede

Uma entrada popular expira e 100 requisições simultâneas dão miss, chamando o provedor 100 vezes. Mitigações:

- **Single-flight / request coalescing:** só a primeira requisição chama a origem; as outras esperam o resultado.
- **Lock** no Redis (`SET lock NX EX`).
- **Expiração antecipada probabilística:** recalcular um pouco antes do TTL, de forma aleatória.

## 3. Analogia

É o **caderno de respostas de um professor particular**. Quando um aluno pergunta algo que já foi perguntado **exatamente igual**, ele consulta o caderno em vez de resolver de novo. Mas o caderno tem uma página por aluno (tenant), anota também qual livro foi usado (modelo) e o enunciado completo (parâmetros), porque "resolva a equação" com outros números é outra questão. E respostas que ele não terminou de escrever não entram no caderno.

## 4. Por que está nesta arquitetura

- É a etapa mais **barata** de economia: um hash e um `GET`.
- Fica **antes** do cache semântico (que precisa de embedding e busca vetorial) e do provedor.
- Reduz custo e latência: a meta é p95 < 30 ms num hit.

## 5. Ferramentas similares (camadas de cache)

| Ferramenta / camada                        | Diferença                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Redis / Valkey**                         | Cache distribuído, compartilhado entre instâncias; **a escolha do projeto**                                 |
| **Memcached**                              | Cache distribuído mais simples (só strings)                                                                 |
| **Cache em memória** (`lru-cache`)         | Mais rápido, mas por instância; bom para dados quase imutáveis (preços, aliases)                            |
| **CDN / cache HTTP** (Cloudflare, Varnish) | Cacheia por URL em GET; não serve para POST com corpo variável, como chat                                   |
| **Prompt caching do provedor**             | Reaproveita o processamento de prefixos dentro do provedor; reduz custo de entrada, mas não evita a chamada |

## 6. Armadilhas

- **Chave incompleta** → resposta errada (ex.: esquecer `tools` ou `response_format`).
- **Chave com campos demais** → hit rate perto de zero.
- **Cachear respostas personalizadas** ou com dados sensíveis sem pensar no tenant.
- **Cache como dependência crítica:** se o Redis cair, o gateway segue sem cache (fail-open), só mais caro.
- **Métrica de economia honesta:** economia = custo que a chamada **teria** (calculado pelos tokens da resposta guardada × preço vigente).
- **TTL infinito:** modelos e prompts evoluem; respostas antigas ficam para sempre.

## 7. No Portunus

- E9: normalização, hash, `x-gateway-cache` (`hit-exact`/`miss`), `x-gateway-cache-control: no-cache`, desligar por alias, métricas de hit rate e economia.
- E2 usa o mesmo princípio (cache-aside com TTL curto) para as chaves de API.

## 8. Para aprofundar

- AWS — _Caching best practices_: https://aws.amazon.com/caching/best-practices/
- RFC 8785 — _JSON Canonicalization Scheme_: https://www.rfc-editor.org/rfc/rfc8785
- Wikipedia — _Cache stampede_ (inclui a expiração probabilística): https://en.wikipedia.org/wiki/Cache_stampede
- Livro: _Designing Data-Intensive Applications_ (Kleppmann), seções sobre caches e consistência
