# 05 — Embeddings

> **Épicos:** E4 (`/v1/embeddings`), E10 (cache semântico), E15 (critério de similaridade nos evals).
> **Módulos:** `inference`, `cache`, `providers`.

---

## 1. O problema

Computadores comparam textos por igualdade de caracteres. "Qual o prazo de reembolso?" e "Em quantos dias consigo reembolso?" são completamente diferentes para um `===`, mas têm o mesmo sentido. Para reconhecer **significado**, é preciso uma representação em que textos parecidos fiquem "perto" um do outro.

## 2. Como funciona

### 2.1 Texto vira vetor

Um **modelo de embedding** recebe um texto e devolve um **vetor de números reais** de dimensão fixa (por exemplo, 384, 1536 ou 3072 números). Cada texto vira um ponto num espaço de muitas dimensões.

```
"Qual o prazo de reembolso?"        → [0.012, -0.344, 0.051, ..., 0.208]  (1536 números)
"Em quantos dias consigo reembolso?" → [0.015, -0.339, 0.047, ..., 0.199]
"Como troco minha senha?"            → [-0.410, 0.122, 0.330, ..., -0.051]
```

O modelo foi treinado (geralmente com **aprendizado contrastivo**: pares de textos parecidos são aproximados e pares diferentes são afastados) para que **proximidade geométrica ≈ proximidade de sentido**.

### 2.2 Medindo proximidade

| Medida | Fórmula (intuição) | Observação |
|---|---|---|
| **Similaridade de cosseno** | cos(θ) entre os vetores: 1 = mesma direção, 0 = sem relação | A mais usada para texto |
| **Produto interno (dot product)** | Soma de aᵢ·bᵢ | Igual ao cosseno se os vetores forem normalizados (comprimento 1) |
| **Distância euclidiana (L2)** | Comprimento de a − b | Para vetores normalizados, ordena igual ao cosseno |

Os embeddings da OpenAI vêm **normalizados**, então cosseno e produto interno dão o mesmo ranking, e o produto interno é mais barato de calcular.

**Complexidade:** comparar dois vetores de dimensão *d* custa O(d). Comparar uma consulta com *n* vetores armazenados (força bruta) custa O(n·d). Com 1 milhão de entradas de 1536 dimensões, são ~1,5 bilhão de multiplicações por busca. É isso que motiva os índices aproximados ([06](./06-busca-vetorial-e-pgvector.md)).

### 2.3 Dimensão: trade-offs

- Mais dimensões → mais nuance, mais memória e busca mais lenta.
- Alguns modelos (ex.: `text-embedding-3-*` da OpenAI) permitem **reduzir a dimensão** na chamada, trocando um pouco de qualidade por espaço.
- Espaço: 1536 dimensões × 4 bytes (float32) ≈ 6 KB por vetor; 1 milhão de vetores ≈ 6 GB só de vetores, antes de índices.

### 2.4 Limitações importantes

- **Embeddings capturam tema e sentido, mas são ruins com detalhes precisos.** "Reembolso em 7 dias" e "reembolso em 30 dias" ficam muito próximos, mas não têm o mesmo sentido. Esse é o maior risco do cache semântico.
- **Negação** é fraca: "posso cancelar" e "não posso cancelar" podem ficar próximos.
- **Vetores de modelos diferentes não são comparáveis.** Trocar de modelo de embedding exige recalcular tudo.
- **Similaridade é relativa ao modelo:** um limiar de 0,92 num modelo não significa o mesmo em outro.

## 3. Analogia

Imagine uma **biblioteca onde os livros são posicionados por assunto num salão gigante**, e não por ordem alfabética. Livros sobre reembolso ficam todos num canto; livros sobre senha, em outro. Para achar "algo parecido" com sua pergunta, você vai até o ponto onde ela ficaria e olha os livros mais próximos. O embedding é a **coordenada** de cada livro nesse salão. O problema: dois livros sobre reembolso com prazos diferentes ficam lado a lado na mesma prateleira.

## 4. Por que está nesta arquitetura

- **Cache semântico (E10):** é o mecanismo que permite reconhecer perguntas com o mesmo sentido.
- **Endpoint `/v1/embeddings` (E4):** clientes também usam embeddings diretamente (para RAG, busca, classificação); o gateway os atende como qualquer chamada, com custo.
- **Evals (E15):** critério de "resposta parecida com a de referência".

## 5. Ferramentas similares (modelos e formas de gerar embeddings)

| Opção | Tipo | Diferença principal |
|---|---|---|
| **OpenAI `text-embedding-3-small` / `-large`** | API paga | Baratos, multilíngues, 1536 / 3072 dimensões, dimensão reduzível |
| **Voyage AI** | API paga | Recomendado pela Anthropic (que não tem modelo próprio de embeddings) |
| **Cohere Embed** | API paga | Forte em multilíngue e em busca |
| **Google (Gemini embeddings)** | API paga | Integração com o ecossistema Google |
| **sentence-transformers** (ex.: `all-MiniLM-L6-v2`, 384 dims) | Open source, Python | Roda localmente, sem custo por chamada |
| **Ollama** (ex.: `nomic-embed-text`) | Local, via HTTP | Fácil de subir em Docker |
| **Transformers.js** | Local, em JavaScript | Roda dentro do próprio processo Node |

O ranking público **MTEB** (Massive Text Embedding Benchmark) compara modelos por tarefa e idioma.

## 6. Armadilhas

- **O mock não tem semântica.** Um mock determinístico (hash do texto → vetor) gera vetores iguais para textos iguais, mas não aproxima paráfrases. Essa é a decisão em aberto do E10: fixtures de paráfrases, modelo local, ou provedor real só na calibração.
- **Custo e latência do embedding** entram em **todo miss** do cache semântico. Se pouca coisa se repete, o cache semântico pode custar mais do que economiza.
- **O que embedar:** só a última mensagem do usuário? O histórico inteiro? Essa escolha muda o que é "a mesma pergunta". O system prompt fica fora do embedding e entra no escopo exato (hash).
- **Mudou o modelo de embedding? Invalide o cache semântico inteiro.**
- **Limite de tokens** do modelo de embedding: textos longos são truncados.

## 7. No Portunus

- E4: `POST /v1/embeddings` passa pela esteira, com custo.
- E10: o gateway chama o endpoint de embeddings internamente para cada pergunta candidata ao cache semântico.
- E15: critério de similaridade semântica nos evals.

## 8. Para aprofundar

- OpenAI — *Embeddings guide*: https://platform.openai.com/docs/guides/embeddings
- MTEB leaderboard: https://huggingface.co/spaces/mteb/leaderboard
- Sentence-Transformers: https://www.sbert.net/
- Vicki Boykis — *What are embeddings?* (livro gratuito): https://vickiboykis.com/what_are_embeddings/
