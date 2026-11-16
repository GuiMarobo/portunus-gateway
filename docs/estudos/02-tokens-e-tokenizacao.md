# 02 — Tokens e tokenização

> **Épicos:** E4 (custo), E5 (streaming sem `usage`), E8 (limite de tokens/min).
> **Módulos:** `pricing`, `ratelimit`, `inference`.

---

## 1. O problema

Provedores cobram, limitam e medem tudo em **tokens**, não em caracteres nem em requisições. Quem não entende tokens não consegue prever custo, aplicar limite de tokens por minuto nem explicar por que o mesmo texto em português custa mais que em inglês.

## 2. Como funciona

### 2.1 O que é um token

Um token é um pedaço de texto: às vezes uma palavra inteira, às vezes parte de uma palavra, uma pontuação ou um espaço. O modelo não vê letras; vê uma sequência de **IDs inteiros**, cada um correspondendo a um token de um vocabulário fixo (dezenas a centenas de milhares de entradas).

```
"Qual o prazo de reembolso?"
→ ["Qual", " o", " prazo", " de", " re", "emb", "olso", "?"]
→ [45213, 293, 81277, 409, 312, 9123, 11872, 30]
```

(Os IDs acima são ilustrativos; cada tokenizer tem os seus.)

### 2.2 BPE (Byte Pair Encoding)

O algoritmo mais comum para montar o vocabulário:

1. Começa com o texto quebrado em bytes individuais.
2. Conta qual **par** de símbolos vizinhos aparece mais vezes no corpus de treino.
3. Funde esse par num símbolo novo e adiciona ao vocabulário.
4. Repete até atingir o tamanho desejado.

Resultado: sequências frequentes (palavras comuns em inglês, trechos de código) viram um token só; sequências raras viram vários tokens. Como os corpora de treino têm muito inglês, **português gasta mais tokens por palavra**. A regra de bolso da OpenAI é ~4 caracteres por token em inglês; em português, conte com menos caracteres por token.

**Complexidade:** tokenizar um texto de *n* caracteres com BPE é aproximadamente O(n log n) nas implementações práticas, rápido o bastante para o caminho crítico, mas não de graça.

### 2.3 Cada modelo tem seu tokenizer

- OpenAI: encodings como `cl100k_base` e `o200k_base`, disponíveis na biblioteca `tiktoken` (com ports para JS).
- Anthropic: tokenizer próprio, não público; há um endpoint de contagem de tokens na API.
- Modelos abertos: o tokenizer vem junto com o modelo (biblioteca `tokenizers` da Hugging Face).

Ou seja, **o mesmo texto tem contagens diferentes em provedores diferentes**. Uma contagem local é sempre uma **estimativa**, a não ser que seja exatamente o tokenizer do modelo.

### 2.4 Onde os tokens aparecem

- **Entrada (prompt tokens):** system + histórico + mensagem atual + definições de tools + formatação interna do chat (cada mensagem tem alguns tokens de "moldura").
- **Saída (completion tokens):** o que o modelo gerou. Modelos de raciocínio também cobram tokens de "pensamento" que você não vê no texto.
- **Tokens em cache do provedor:** OpenAI e Anthropic oferecem *prompt caching* (prefixos repetidos custam menos). É diferente do cache do gateway (ver [15](./15-cache-exato.md)), mas aparece no `usage`.

## 3. Analogia

Tokens são como **sílabas cobradas num telegrama**, só que o "dicionário de sílabas" foi montado a partir de textos em inglês. Palavras inglesas comuns cabem numa sílaba; "reembolso" vira três. Cada agência de telegrama (provedor) usa seu próprio dicionário, então o mesmo texto custa diferente em cada uma.

## 4. Por que está nesta arquitetura

| Uso | Por que tokens importam |
|---|---|
| **Custo (E4)** | `custo = tokens_in × preço_in + tokens_out × preço_out` |
| **Rate limit de tokens/min (E8)** | É preciso **estimar antes** da chamada (entrada + `max_tokens`) e **ajustar depois** com o `usage` real |
| **Streaming (E5)** | Se o provedor não mandar `usage` no fim do stream, o gateway precisa contar localmente |
| **Cache** | Um hit economiza exatamente os tokens que a chamada teria gastado; é assim que a economia é medida |

## 5. Ferramentas similares (contagem de tokens)

| Ferramenta | Diferença |
|---|---|
| `tiktoken` (Python, Rust) | Oficial da OpenAI; exato para modelos OpenAI |
| `js-tiktoken` / `@dqbd/tiktoken` | Ports para JavaScript (puro JS vs. WASM: o WASM é mais rápido, o puro é mais portátil) |
| `tokenizers` (Hugging Face) | Para modelos abertos |
| API de contagem da Anthropic | Exata para Claude, mas é uma chamada de rede |
| Heurística (caracteres ÷ 4) | Grátis e instantânea, imprecisa; pode servir para pré-checagem de rate limit |

Adicionar um tokenizer é uma **dependência nova** e uma decisão registrada no ROADMAP (decisões em aberto).

## 6. Armadilhas

- **Estimar ≠ medir.** Use estimativa só onde é inevitável (antes da chamada) e reconcilie com o `usage` real.
- **`max_tokens` é um teto, não o gasto.** Reservar o teto inteiro no rate limit é conservador; reservar menos é arriscado. Discutir no E8.
- **Tools e system prompt contam** como tokens de entrada em toda chamada.
- **Tokens de raciocínio** podem estar no `usage` sem aparecer no texto, e mesmo assim são cobrados.
- **Contar tokens no caminho crítico** tem custo de CPU. Meça antes de assumir que é desprezível.

## 7. No Portunus

- E4: cálculo de custo a partir de `usage`.
- E5: estratégia para streams sem `usage` (pedir `stream_options: { include_usage: true }` ao provedor e ter um plano B).
- E8: limite de tokens/min com reserva e ajuste.

## 8. Para aprofundar

- OpenAI tokenizer (interativo): https://platform.openai.com/tokenizer
- `tiktoken`: https://github.com/openai/tiktoken
- Hugging Face — *Byte-Pair Encoding tokenization*: https://huggingface.co/learn/nlp-course/chapter6/5
- Andrej Karpathy — *Let's build the GPT Tokenizer* (vídeo, YouTube)
