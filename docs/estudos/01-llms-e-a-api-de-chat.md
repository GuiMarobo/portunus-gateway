# 01 — LLMs e a API de chat

> **Épicos:** E3 (chat síncrono), E4 (aliases e provedores), E7 (multi-provedor).
> **Módulos:** `inference`, `providers`.

---

## 1. O problema

Um LLM (*Large Language Model*) é um serviço remoto, caro, lento (comparado a uma API comum) e não determinístico. Para usá-lo bem, é preciso entender o que se envia, o que volta e o que cada parâmetro muda. Sem isso, um gateway não consegue decidir o que pode ser cacheado, como calcular custo ou quando é seguro repetir uma chamada.

## 2. Como funciona

### 2.1 O que o modelo faz

Um LLM é uma rede neural (arquitetura *Transformer*) treinada para uma tarefa só: **dado um texto, prever o próximo token**. Gerar uma resposta é repetir essa previsão em loop:

1. O texto de entrada (o *prompt*) é quebrado em tokens (ver [02](./02-tokens-e-tokenizacao.md)).
2. O modelo calcula uma distribuição de probabilidade para o próximo token.
3. Um token é **sorteado** dessa distribuição (*sampling*).
4. O token entra no final do contexto e o processo recomeça, até um token de parada ou o limite de tokens.

Consequências práticas:

- **Custo proporcional a tokens.** Os tokens de entrada são processados uma vez, em paralelo (fase de *prefill*). Os de saída são gerados um a um (fase de *decode*). Por isso a saída custa mais caro que a entrada.
- **Latência tem duas partes:** o *TTFT* (*time to first token*) e a velocidade de geração (tokens/segundo). É por isso que streaming existe ([04](./04-streaming-e-sse.md)).
- **Janela de contexto:** o modelo só "enxerga" um número máximo de tokens (entrada + saída). O modelo não tem memória: o histórico da conversa é **reenviado inteiro** em cada chamada.
- **Não determinismo:** com sampling, a mesma pergunta pode gerar respostas diferentes.

### 2.2 Parâmetros de sampling

| Parâmetro | O que faz | Impacto no gateway |
|---|---|---|
| `temperature` | Achata (alto) ou concentra (baixo) a distribuição. `0` ≈ sempre o token mais provável | Temperatura alta = respostas variadas = cache semântico desligado por padrão |
| `top_p` | Sorteia só entre os tokens que somam p% da probabilidade (*nucleus sampling*) | Entra na chave de cache |
| `max_tokens` / `max_completion_tokens` | Teto de tokens de saída | Base para estimar custo e o limite de tokens/min |
| `stop` | Sequências que encerram a geração | Entra na chave de cache |
| `seed` | Tenta tornar o sampling reprodutível (melhor esforço, sem garantia) | Útil em evals |
| `n` | Quantas respostas gerar | Multiplica o custo de saída |

### 2.3 A API de Chat Completions (formato OpenAI)

É o padrão de fato do mercado: muitos provedores e ferramentas aceitam esse formato, e é por isso que o gateway o adota (ADR 001).

**Requisição** (`POST /v1/chat/completions`):

```json
{
  "model": "gpt-x",
  "messages": [
    { "role": "system", "content": "Você é um atendente de suporte." },
    { "role": "user", "content": "Qual o prazo de reembolso?" }
  ],
  "temperature": 0.2,
  "max_tokens": 300,
  "stream": false
}
```

Papéis (`role`) das mensagens:

- `system` (ou `developer` nos modelos mais novos da OpenAI): instruções de comportamento.
- `user`: o que o usuário diz.
- `assistant`: respostas anteriores do modelo (o histórico).
- `tool`: o resultado de uma ferramenta que o modelo pediu para chamar.

**Resposta:**

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "model": "gpt-x",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "O prazo é de 7 dias." },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 25, "completion_tokens": 9, "total_tokens": 34 }
}
```

- `finish_reason` diz **por que** parou: `stop` (terminou naturalmente), `length` (bateu no `max_tokens`, ou seja, a resposta está cortada), `tool_calls` (quer chamar uma ferramenta) ou `content_filter`.
- `usage` é a fonte da verdade para o custo.

**Erros** seguem um envelope próprio, que os SDKs sabem interpretar:

```json
{ "error": { "message": "Rate limit exceeded", "type": "rate_limit_error", "param": null, "code": "rate_limit_exceeded" } }
```

Por isso o invariante 10 do projeto: o gateway **sempre** devolve erros nesse formato, senão o SDK do cliente quebra ou mostra mensagens estranhas.

### 2.4 Tools / function calling

O app descreve funções (nome, descrição, JSON Schema dos parâmetros) em `tools`. O modelo pode responder com `tool_calls` em vez de texto ("chame `buscar_pedido` com `{id: 42}`"). O app executa, devolve o resultado numa mensagem `role: "tool"` e chama o modelo de novo. O modelo **não executa nada**: ele só pede.

Para o gateway, isso importa porque respostas com tools dependem de estado externo (o resultado da função), então não devem passar pelo cache semântico por padrão.

### 2.5 Structured outputs

`response_format` com `json_schema` obriga o modelo a responder num JSON válido para um schema. É útil para classificação e extração, e será útil nos evals ([08](./08-evals.md)).

### 2.6 Outros formatos que você vai encontrar

- **Anthropic Messages API:** o `system` é um campo separado, e não uma mensagem; `max_tokens` é obrigatório; o conteúdo vem em *blocos* (`text`, `tool_use`); `stop_reason` usa outros valores (`end_turn`, `max_tokens`, `tool_use`); o uso aparece como `input_tokens`/`output_tokens`; o streaming tem eventos nomeados (`message_start`, `content_block_delta`, `message_stop`...). O `AnthropicAdapter` (E7) traduz tudo isso para o formato OpenAI e de volta.
- **OpenAI Responses API:** a API mais nova da OpenAI, com estado e ferramentas nativas. O Chat Completions continua sendo o "idioma comum" entre provedores, e é ele que o gateway fala.

## 3. Analogia

Pense num **intérprete simultâneo muito culto, mas sem memória**. Você entrega a ele uma ficha com todo o histórico da conversa (as `messages`), e ele continua a frase palavra por palavra, escolhendo cada palavra com um pouco de improviso (a `temperature`). Ele cobra por palavra lida e, mais caro, por palavra falada (tokens de entrada e de saída). Se você quer que ele lembre de algo, precisa entregar a ficha inteira de novo.

## 4. Por que está nesta arquitetura

O LLM é o "produto" que o gateway entrega. Cada decisão do gateway depende do contrato dessa API:

- **Cache:** o que entra na chave depende de quais parâmetros mudam a saída.
- **Custo:** vem de `usage` e da tabela de preços.
- **Resiliência:** os códigos de erro dizem o que é transitório (429, 5xx) e o que não é (400).
- **Compatibilidade:** falar o formato OpenAI faz qualquer SDK existente funcionar só trocando `baseURL`.

## 5. Ferramentas similares (provedores e formas de servir modelos)

| Opção | O que é | Diferença principal |
|---|---|---|
| **OpenAI** | Provedor proprietário, criador do formato de fato | Referência de compatibilidade |
| **Anthropic (Claude)** | Provedor proprietário | API própria (Messages); não oferece modelo de embeddings (recomenda Voyage AI) |
| **Google (Gemini)** | Provedor proprietário | API própria, com camada compatível com OpenAI |
| **Mistral, Cohere** | Provedores com modelos próprios | APIs próprias, parte delas compatível |
| **Groq, Together, Fireworks** | Hospedam modelos abertos (Llama, Qwen...) | Geralmente compatíveis com OpenAI; foco em velocidade e preço |
| **Ollama, vLLM, llama.cpp** | Rodar modelos abertos na sua máquina ou servidor | Sem custo por token; você paga com hardware e operação. vLLM e Ollama expõem endpoints compatíveis com OpenAI |

## 6. Armadilhas

- **`finish_reason: "length"` não é sucesso completo.** A resposta está truncada. Decida se ela pode ir para o cache.
- **`max_tokens` está sendo substituído por `max_completion_tokens`** em modelos novos da OpenAI. O adapter precisa lidar com os dois.
- **Contexto reenviado em cada chamada:** conversas longas ficam caras e lentas. É um bom motivo para não usar cache semântico nelas.
- **Mesmo prompt ≠ mesma resposta.** Testes que comparam o texto exato de um LLM real são frágeis; por isso o mock determinístico existe.
- **Chaves do provedor** nunca saem do gateway (invariante e item de segurança).

## 7. No Portunus

- E3 define os schemas Zod de request/response desse formato.
- E4 traduz o alias (`inteligente`) para o `model` real.
- E7 escreve o tradutor OpenAI ↔ Anthropic, um exemplo clássico do padrão **Adapter**.

## 8. Para aprofundar

- OpenAI — API reference de Chat: https://platform.openai.com/docs/api-reference/chat
- Anthropic — Messages API: https://docs.anthropic.com/en/api/messages
- Jay Alammar — *The Illustrated Transformer*: https://jalammar.github.io/illustrated-transformer/
- Andrej Karpathy — *Intro to Large Language Models* (vídeo, YouTube)
