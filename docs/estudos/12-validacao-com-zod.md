# 12 — Validação com Zod

> **Épicos:** E0 (config), E3 (requests), E11 (eventos), E15 (suítes de eval).
> **Onde:** `presentation/` (schemas HTTP), `libs/events`, `libs/common`, config.

---

## 1. O problema

Tipos do TypeScript **somem em runtime**. Se o corpo de uma requisição diz `temperature: "alta"` em vez de um número, o `tsc` não tem como saber: ele confiou na sua anotação. O dado externo (HTTP, variáveis de ambiente, mensagens do RabbitMQ, arquivos YAML) precisa ser **verificado em runtime**. E, se o tipo e o validador forem escritos separadamente, eles divergem com o tempo.

## 2. Como funciona

### 2.1 Schema como fonte única

Com Zod, você escreve o **schema** (que existe em runtime) e **deriva o tipo** dele:

```ts
import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
});

export const chatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(chatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean().default(false),
});

export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>;
```

Um lugar só define a forma do dado; tipo e validação nunca divergem.

### 2.2 `parse` × `safeParse`

- `schema.parse(input)` devolve o dado tipado ou **lança** um `ZodError`.
- `schema.safeParse(input)` devolve `{ success: true, data }` ou `{ success: false, error }`, sem exceção.

Na fronteira HTTP, o pipe de validação usa `safeParse` e converte o erro num `400` no formato da OpenAI, com o campo inválido em `param`.

### 2.3 Parse, don't validate

Princípio importante: **converta o dado não confiável num tipo confiável na fronteira, uma vez**. Depois dela, o código interno trabalha com tipos garantidos e não precisa revalidar. O Zod faz isso: o resultado de `parse` é o dado já limpo (com defaults aplicados, strings transformadas etc.).

### 2.4 Onde o projeto usa

| Fronteira | Exemplo |
|---|---|
| **Variáveis de ambiente** | `envSchema.parse(process.env)` na inicialização: o app não sobe com config inválida |
| **Requisições HTTP** | Pipe de validação no Nest |
| **Eventos** | `usageCompletedEventSchema` em `libs/events`, validado ao publicar e ao consumir |
| **Respostas de provedores** | O adapter valida o que o provedor devolveu antes de confiar |
| **Suítes de eval** | O YAML lido pelo `evals-cli` |

### 2.5 Complexidade

Validar é O(tamanho do dado): cada campo é visitado uma vez. Para um request com 100 mensagens, isso é desprezível frente a uma chamada de LLM, mas não é zero no caminho crítico. Medir antes de otimizar.

## 3. Analogia

É o **raio-X do aeroporto**. Dentro da área de embarque, todos confiam que ninguém tem objetos proibidos, porque **todo mundo passou pelo raio-X uma vez na entrada**. O raio-X fica na fronteira; lá dentro não se revista ninguém de novo. E a lista do que é proibido (o schema) é a mesma usada para treinar os fiscais e para informar os passageiros (o tipo): não existem duas listas diferentes.

## 4. Por que está nesta arquitetura

- Todas as fronteiras do gateway recebem dados de fora: clientes, provedores, filas, arquivos.
- Elimina a duplicação "interface TS + validação manual".
- Contratos de evento versionados em `libs/events` são compartilhados entre gateway e consumers; o mesmo schema valida nas duas pontas.

## 5. Ferramentas similares

| Ferramenta | Diferença principal | Quando escolher |
|---|---|---|
| **class-validator + class-transformer** | Padrão do NestJS; validação por decorators em classes | Projetos Nest clássicos; tipos e validação "juntos" via classe |
| **Joi** | Veterano (ecossistema hapi); não deriva tipos TS nativamente | Projetos JS legados |
| **Yup** | Popular em formulários no front-end | Validação de formulários |
| **Valibot** | API modular, bundle muito menor | Front-end e edge, onde o tamanho importa |
| **TypeBox** | Gera **JSON Schema** e tipos TS; integra nativamente com o Fastify | Quando se quer schema JSON padrão para serialização rápida |
| **ArkType** | Sintaxe parecida com a de tipos TS, muito rápido | Desempenho de validação crítico |

O Zod foi escolhido pela ergonomia e pelo ecossistema. A versão 4 trouxe ganho de desempenho e conversão nativa para JSON Schema, o que ajuda se um dia o Fastify precisar dos schemas.

## 6. Armadilhas

- **`z.object` remove campos desconhecidos por padrão** (`strip`). Para uma API compatível com a OpenAI, decidir se campos desconhecidos são rejeitados (`strict`), repassados (`passthrough`) ou ignorados é uma decisão de contrato.
- **Mensagens de erro do Zod** não estão no formato da OpenAI; a conversão é responsabilidade do pipe/filter.
- **Validar dados enormes** (um `messages` com megabytes) antes de checar o tamanho do corpo: limite o tamanho primeiro.
- **Schema de evento mudou?** Consumidores antigos podem receber o formato novo. Versione (`version: 1`) e evolua de forma compatível.
- **`z.infer` com transformações:** o tipo de entrada e o de saída podem diferir (`z.input` × `z.output`).

## 7. No Portunus

- E0: schema das variáveis de ambiente.
- E3: schemas de chat completions e o pipe de validação próprio (em vez do `ValidationPipe` padrão do Nest, que usa class-validator).
- E11: contratos de eventos em `libs/events`.

## 8. Para aprofundar

- Zod — documentação: https://zod.dev/
- Alexis King — *Parse, don't validate*: https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/
- NestJS — *Pipes* (validação com schema): https://docs.nestjs.com/pipes#schema-based-validation
