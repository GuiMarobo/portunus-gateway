# 23 — Webhooks, HMAC e SSRF

> **Épicos:** E14.
> **Módulos:** `async`; worker de webhooks em `apps/consumers`.

---

## 1. O problema

Quando um job assíncrono termina, o cliente precisa saber. Ele pode perguntar de tempos em tempos (*polling*), mas é ineficiente. A alternativa é o gateway **chamar uma URL do cliente** (webhook). Isso cria dois riscos de segurança:

1. **Do lado do cliente:** como ele sabe que a chamada veio mesmo do gateway, e não de um impostor?
2. **Do lado do gateway:** e se o "cliente" cadastrar uma URL que aponta para a **rede interna** do próprio gateway?

## 2. Como funciona

### 2.1 Webhook

É uma requisição HTTP (normalmente `POST` com JSON) que o servidor faz para uma URL cadastrada pelo cliente quando um evento acontece. É uma "API ao contrário". Por ser assíncrono e cruzar a internet, precisa de **retry** (o cliente pode estar fora do ar) e de **idempotência** do lado de quem recebe (o mesmo webhook pode chegar duas vezes).

### 2.2 Assinatura com HMAC

**HMAC** (*Hash-based Message Authentication Code*) combina uma função de hash (SHA-256) com uma **chave secreta compartilhada** para produzir uma assinatura que só quem tem o segredo consegue gerar.

```
assinatura = HMAC-SHA256(segredo_do_tenant, timestamp + "." + corpo_bruto)
headers:
  x-gateway-timestamp: 1763030400
  x-gateway-signature: v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

O receptor:

1. Recalcula o HMAC com o mesmo segredo sobre `timestamp + "." + corpo_bruto`.
2. Compara em **tempo constante** (`crypto.timingSafeEqual`).
3. Rejeita se o timestamp for muito antigo (ex.: > 5 min), o que impede o **replay** (alguém capturar e reenviar um webhook válido).

Isso garante **autenticidade** (veio de quem tem o segredo) e **integridade** (o corpo não foi alterado). É o mesmo padrão usado por Stripe e GitHub.

> Por que não só um token fixo num header? Porque um token fixo vazado permite forjar qualquer mensagem; o HMAC amarra a assinatura ao conteúdo e ao horário.

### 2.3 SSRF (Server-Side Request Forgery)

O gateway vai fazer uma requisição a uma URL **escolhida pelo cliente**. Um atacante pode cadastrar:

- `http://169.254.169.254/latest/meta-data/` → serviço de metadados da nuvem (pode expor credenciais).
- `http://localhost:6379` ou `http://10.0.0.5:5432` → serviços internos (Redis, Postgres).
- `http://meu-site.com`, que **redireciona** para um IP interno.
- `http://rebind.attacker.com`, que resolve para um IP público na validação e para `127.0.0.1` na hora da chamada (**DNS rebinding**).

**Defesas:**

1. Só `https` (e talvez `http` em desenvolvimento).
2. **Resolver o DNS e validar o IP** contra listas de bloqueio: loopback (`127.0.0.0/8`, `::1`), privados (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`), link-local (`169.254.0.0/16`, `fe80::/10`), `0.0.0.0`.
3. **Conectar ao IP validado** (e não resolver de novo), para fechar a janela do DNS rebinding.
4. **Não seguir redirects**, ou revalidar cada salto.
5. Timeout curto e tamanho máximo de resposta.
6. Opcional: sair por um **proxy de egress** dedicado, sem acesso à rede interna.

## 3. Analogia

- **Webhook:** em vez de você ligar para a lavanderia a cada hora perguntando "ficou pronto?", a lavanderia **te liga** quando termina.
- **HMAC:** a lavanderia e você combinaram uma **senha secreta**. Ao ligar, ela diz uma "contra-senha" calculada a partir da senha, do horário e do número do pedido. Um golpista que ouviu uma ligação antiga não consegue gerar a contra-senha de um pedido novo nem reaproveitar a antiga, porque o horário mudou.
- **SSRF:** um "cliente" pede à lavanderia: "quando terminar, entregue no endereço *Sala do Cofre, 2º andar, dentro da própria lavanderia*". Um entregador ingênuo obedeceria. A defesa é recusar endereços internos e conferir o endereço real na hora da entrega.

## 4. Por que está nesta arquitetura

- CONTEXT.md §5.3: "recebe um aviso automático (callback assinado)".
- ARQUITETURA.md §10: webhooks com HMAC e URLs validadas contra SSRF.
- SSRF está no OWASP Top 10, e qualquer feature "o servidor chama uma URL do usuário" está sujeita a ele.

## 5. Ferramentas similares

| Ferramenta | Diferença |
|---|---|
| **Svix** | Webhooks como serviço (assinatura, retry, portal para o cliente); define o padrão *Standard Webhooks* |
| **Hookdeck** | Infraestrutura de recebimento e entrega de webhooks |
| **Standard Webhooks** (especificação) | Padroniza headers e o esquema de assinatura; boa referência para o formato do gateway |
| **Polling** | Alternativa sem webhook: mais simples e seguro para o servidor, porém mais lento e custoso |
| **WebSockets / SSE** | Notificação com conexão aberta; não serve para processos de horas |
| **Bibliotecas anti-SSRF** (ex.: `ssrf-req-filter`, agentes HTTP com validação de IP) | Fazem a checagem de IP na conexão |

## 6. Armadilhas

- **Assinar o JSON re-serializado** em vez do corpo **bruto**: espaços e ordem de chaves mudam e a assinatura não confere.
- **Comparação com `===`**: timing attack.
- **Validar a URL só no cadastro**: o DNS pode mudar depois. Valide na hora de enviar.
- **Webhook de um tenant lento travando os outros**: fila e concorrência separadas, timeout curto.
- **Retry infinito** para um endpoint morto: limite de tentativas, DLQ e desativar o webhook após falhas contínuas.
- **Segredo do webhook = chave de API?** Não; são segredos separados, com rotação própria.

## 7. No Portunus

- E14: fila `webhooks` no BullMQ, assinatura HMAC com timestamp, validação anti-SSRF no envio, retry com backoff e reprocessamento.

## 8. Para aprofundar

- RFC 2104 — HMAC: https://www.rfc-editor.org/rfc/rfc2104
- Standard Webhooks: https://www.standardwebhooks.com/
- Stripe — *Verify webhook signatures*: https://docs.stripe.com/webhooks#verify-events
- OWASP — *SSRF Prevention Cheat Sheet*: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
