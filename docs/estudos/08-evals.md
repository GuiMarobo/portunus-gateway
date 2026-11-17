# 08 — Evals (avaliação de qualidade de LLM)

> **Épicos:** E15.
> **Pacote:** `apps/evals-cli`, suítes em `evals/`.

---

## 1. O problema

Em software tradicional, um teste diz se a função retornou o valor certo. Com LLMs, a chamada pode retornar `200 OK` e uma resposta **pior**: mais longa, no formato errado, alucinada ou simplesmente menos útil. Mudar um prompt ou trocar de modelo pode piorar a qualidade sem que nenhum teste quebre. É a "regressão silenciosa" do CONTEXT.md §2.

## 2. Como funciona

### 2.1 Anatomia de uma suíte

Um **eval** é um conjunto de casos: **entrada** + **critério** do que é uma resposta aceitável. Uma suíte roda todos os casos contra uma configuração (modelo/alias + prompt) e produz métricas.

```yaml
name: classificacao-tickets
target: { alias: rapido }
threshold: 0.9
cases:
  - input: 'Meu cartão foi cobrado duas vezes'
    expect: { type: equals, value: 'financeiro' }
  - input: 'O app fecha sozinho ao abrir'
    expect: { type: equals, value: 'bug' }
  - input: 'Explique a política de reembolso'
    expect: { type: llm_judge, rubric: 'Menciona prazo de 7 dias e não inventa condições' }
```

(Formato ilustrativo; o real será definido na spec do E15.)

### 2.2 Tipos de critério

| Critério                   | Como avalia                                              | Custo      | Confiabilidade                            |
| -------------------------- | -------------------------------------------------------- | ---------- | ----------------------------------------- |
| **Contém / igual**         | Comparação de strings                                    | Grátis     | Alta, mas rígido                          |
| **Regex**                  | Padrão de texto                                          | Grátis     | Alta                                      |
| **JSON Schema**            | A saída é um JSON válido para o schema?                  | Grátis     | Alta; ótimo para extração e classificação |
| **Similaridade semântica** | Embedding da resposta × embedding da referência ≥ limiar | Baixo      | Média (ver [05](./05-embeddings.md))      |
| **LLM-as-judge**           | Outro modelo dá nota segundo uma rubrica                 | Alto       | Média; tem vieses                         |
| **Avaliação humana**       | Pessoas julgam                                           | Muito alto | A referência, mas não escala              |

A regra prática: **use o critério mais barato e determinístico que responda à pergunta**. LLM-as-judge só onde nada mais serve.

### 2.3 LLM-as-judge e seus vieses

Um modelo avaliador recebe a pergunta, a resposta e uma rubrica, e devolve uma nota ou aprovação. Vieses conhecidos:

- **Viés de posição:** ao comparar A e B, tende a preferir o que vem primeiro (ou segundo). Mitigação: avaliar nas duas ordens.
- **Viés de verbosidade:** prefere respostas mais longas.
- **Auto-preferência:** um modelo tende a preferir respostas da própria família.
- **Inconsistência:** a mesma avaliação, repetida, pode mudar. Mitigação: temperatura 0, rubricas objetivas e notas em escala curta.

### 2.4 Lidando com o não determinismo

- Rodar cada caso mais de uma vez e usar a taxa de aprovação.
- Definir **margem** no gate (não barrar por 1 ponto percentual de ruído).
- Usar `seed` quando o provedor suportar.
- **Desligar o cache do gateway** (`no-cache`) para não medir a resposta guardada em vez da nova.

### 2.5 Comparação A/B

Rodar a mesma suíte em duas configurações (modelo A × B, prompt antigo × novo) e comparar **caso a caso**: quais passaram a falhar, quais melhoraram, e a diferença de custo e latência. Uma troca de modelo que reduz custo em 60% e perde 1% de qualidade pode ser ótima, e só o eval mostra isso.

### 2.6 Evals como gate no CI

```
pull request altera prompt → CI sobe gateway + mock (ou modelo real) → evals-cli roda a suíte
→ aprovação ≥ limiar? sim: passa · não: exit code ≠ 0, lista de casos que pioraram
```

## 3. Analogia

É a **prova de degustação de um restaurante** antes de mudar uma receita. Não basta o prato "sair da cozinha" (status 200): um grupo de provadores com uma ficha de critérios (sal, ponto, apresentação) avalia a receita nova contra a antiga. Se a nota cair abaixo do mínimo, a receita nova não entra no cardápio. Alguns critérios são objetivos (temperatura do prato = regex); outros dependem de um chef provador (LLM-as-judge), que tem suas preferências.

## 4. Por que está nesta arquitetura

- Fecha o ciclo de AI Engineering: o gateway mede custo e latência; os evals medem **qualidade**.
- Usa o gateway como cliente comum, o que prova a compatibilidade e exercita aliases (trocar o alvo de `rapido` e rodar a suíte).
- É um critério de portfólio: "um teste de qualidade barra uma mudança ruim automaticamente".

## 5. Ferramentas similares

| Ferramenta                          | Tipo                              | Diferença principal                                                 |
| ----------------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| **promptfoo**                       | CLI open source (Node), YAML      | Muito próximo do que o E15 constrói; ótimo para ler como referência |
| **OpenAI Evals**                    | Framework + plataforma            | Integrado à OpenAI                                                  |
| **DeepEval**                        | Framework Python, estilo pytest   | Muitas métricas prontas (incluindo para RAG)                        |
| **Ragas**                           | Python                            | Especializado em avaliar RAG                                        |
| **LangSmith, Braintrust, Langfuse** | Plataformas (SaaS ou self-hosted) | Datasets, experimentos e avaliação online em produção               |

## 6. Armadilhas

- **Suíte pequena demais** dá números instáveis; suíte grande demais fica cara de rodar a cada PR.
- **Dados de eval vazando para o prompt** (few-shot com os próprios casos de teste) inflam o resultado.
- **Juiz mais fraco que o avaliado** dá notas pouco confiáveis.
- **Gate flaky** faz o time ignorar o gate. Margem e repetições importam.
- **Custo:** LLM-as-judge dobra as chamadas. Contabilize.
- **Eval contra o mock** valida o pipeline, mas não a qualidade real; decidir isso é um ADR do E15.

## 7. No Portunus

- `apps/evals-cli`: suíte YAML validada com Zod, critérios como **Strategy**, relatório, A/B e exit code.
- `evals/`: suítes de exemplo.
- Workflow do GitHub Actions rodando a suíte (ver [34](./34-ci-github-actions.md)).

## 8. Para aprofundar

- promptfoo — docs: https://www.promptfoo.dev/docs/intro/
- Zheng et al. — _Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena_: https://arxiv.org/abs/2306.05685
- Hamel Husain — _Your AI Product Needs Evals_: https://hamel.dev/blog/posts/evals/
- OpenAI — _Evaluation best practices_: https://platform.openai.com/docs/guides/evaluation-best-practices
