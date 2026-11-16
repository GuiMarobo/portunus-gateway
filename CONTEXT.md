# CONTEXT.md — Portunus Gateway

> Nome do projeto: **Portunus Gateway** (repositório `portunus-gateway`, pacotes `@portunus/*`; ver [ADR 010](./docs/adr/010-nome-do-projeto-portunus-gateway.md)). Este documento descreve **o que** a aplicação é, **que dor resolve**, **como se comporta na prática** e **o que precisa funcionar**.
> Detalhes técnicos (componentes, stack, dados, fluxos internos) estão em [`ARQUITETURA.md`](./ARQUITETURA.md) e no diagrama [`arquitetura.mermaid`](./arquitetura.mermaid).

---

## 1. O que é

Um gateway que fica **entre as aplicações e os provedores de LLM** (OpenAI, Anthropic, etc.). Em vez de cada app chamar o provedor diretamente, todas chamam o gateway, e ele cuida do que é comum a todas: custo, cache, limites, falhas e visibilidade.

Para quem usa, a mudança é mínima: só troca o endereço da API e usa uma chave do gateway. O formato da requisição continua o mesmo da OpenAI, então SDKs e código existentes seguem funcionando.

## 2. A dor que resolve

Quem coloca LLM em produção chamando o provedor direto costuma enfrentar:

- **Custo sem dono.** Ninguém sabe quanto cada time, feature ou cliente gasta. A fatura chega no fim do mês e não há como explicar nem limitar.
- **Pagar várias vezes pela mesma coisa.** Perguntas iguais ou muito parecidas são enviadas ao provedor repetidamente, gerando custo e latência desnecessários.
- **Dependência de um único provedor.** Se o provedor cai, dá timeout ou limita as requisições, o produto inteiro para.
- **Um consumidor atrapalha todos.** Um cliente (ou um loop com bug) consome toda a cota e os demais ficam sem acesso.
- **Chaves do provedor espalhadas.** Ficam em vários serviços, são difíceis de revogar e arriscadas de vazar.
- **Caixa-preta.** Não dá para saber o que foi perguntado, o que foi respondido, quanto custou e por que algo deu errado.
- **Trocar de modelo dói.** Mudar de provedor ou de modelo exige mexer em código de todos os apps.
- **Regressão silenciosa.** Uma mudança de prompt ou de modelo piora a qualidade e ninguém percebe até o usuário reclamar.

## 3. Quem usa

- **Dev de aplicação:** quer chamar um LLM sem se preocupar com provedor, falhas ou cota.
- **Admin/plataforma:** cria clientes, emite e revoga chaves, define limites e orçamentos.
- **Gestão/finanças:** quer saber quanto cada cliente e cada modelo custam.
- **Dev de IA:** quer testar mudanças de prompt e modelo e garantir que a qualidade não caiu.

## 4. O que precisa funcionar

### 4.1 Receber chamadas como se fosse a OpenAI
- Aceitar requisições de chat e de embeddings no formato da OpenAI.
- Suportar respostas em streaming (texto chegando aos poucos).
- Devolver erros no mesmo formato, para os SDKs existentes entenderem.
- Informar, em cada resposta, se veio do cache, qual provedor respondeu e quanto custou.

### 4.2 Clientes e chaves
- Cada cliente (tenant) tem suas próprias chaves do gateway.
- Chaves podem ser criadas, revogadas e ter validade.
- As chaves reais dos provedores ficam só no gateway, nunca com os clientes.
- Um cliente nunca enxerga dados de outro.

### 4.3 Modelos por apelido
- Em vez de citar um modelo específico, o app usa um apelido (ex.: `rapido`, `inteligente`).
- O gateway decide qual provedor e modelo atende cada apelido, podendo mudar isso sem os apps saberem.

### 4.4 Resiliência
- Se o provedor falhar ou demorar demais, tentar de novo de forma inteligente.
- Se continuar falhando, passar automaticamente para outro provedor.
- Se um provedor estiver claramente fora do ar, parar de insistir nele por um tempo.
- Para o cliente, tudo isso deve ser transparente.

### 4.5 Cache
- **Cache exato:** a mesma pergunta já respondida volta na hora, sem pagar de novo.
- **Cache semântico:** perguntas com o mesmo sentido, escritas de outra forma, também reaproveitam a resposta.
- O cache nunca mistura respostas entre clientes.
- Dá para desligar o cache por requisição ou por rota.
- Mostrar quanto o cache economizou.

### 4.6 Limites e orçamento
- Limite de uso por cliente (ex.: requisições e tokens por minuto), para um não derrubar os outros.
- Orçamento mensal por cliente, com aviso ao se aproximar e bloqueio (ou apenas alerta) ao estourar.
- Custo calculado em cada chamada, com base nos preços de cada modelo.

### 4.7 Chamadas assíncronas
- Para tarefas longas ou em lote: enviar o pedido, receber um identificador e consultar o resultado depois (ou ser avisado por callback).
- Processar muitos pedidos de uma vez sem travar conexões.
- Pedidos que falham repetidamente não podem se perder; ficam guardados para análise e reprocessamento.

### 4.8 Registro e busca
- Cada chamada fica registrada: quem chamou, modelo, provedor, tempo, tokens, custo, se usou cache e se deu erro.
- Prompts e respostas podem ser pesquisados por texto, com filtros (cliente, período, modelo, erro, custo).
- Dados sensíveis (e-mail, CPF, telefone, cartão) podem ser mascarados antes de guardar.
- Cada cliente pode optar por **não guardar o conteúdo**, só os metadados.
- O registro nunca pode atrasar nem derrubar a resposta ao cliente: se ele falhar, a resposta sai normalmente.

### 4.9 Visibilidade (observabilidade)
- Ver, em tempo real, volume de chamadas, erros, latência, cache, custo e saúde dos provedores.
- Acompanhar o caminho completo de uma requisição, etapa por etapa, inclusive quando houve retry ou fallback.
- Alertas quando algo sai do normal (erros altos, provedor fora, orçamento perto do limite, filas acumulando).

### 4.10 Administração e relatórios
- Gerenciar clientes, chaves, apelidos de modelos, limites e preços.
- Relatórios: custo por cliente, por modelo e por dia; prompts mais caros; economia gerada pelo cache.

### 4.11 Avaliação de qualidade (evals)
- Definir conjuntos de casos de teste para prompts e modelos (entrada + o que se espera).
- Rodar esses testes contra um modelo/apelido e ver taxa de acerto, custo e tempo.
- Comparar duas configurações (ex.: modelo A vs. modelo B, prompt antigo vs. novo).
- Rodar automaticamente a cada mudança e **barrar** a mudança se a qualidade cair abaixo do mínimo.

## 5. Como funciona na prática

### 5.1 O caminho de uma chamada normal

Quando um app envia uma pergunta ao gateway, acontece sempre esta sequência, do mais barato ao mais caro:

1. **Quem é você?** O gateway confere a chave e descobre a qual cliente ela pertence. Chave inválida, revogada ou vencida é recusada na hora.
2. **Você pode chamar agora?** Confere o limite de uso do cliente. Se passou, responde "tente de novo em X segundos".
3. **Ainda há orçamento?** Confere se o cliente ainda tem orçamento no mês (e bloqueia ou só avisa, conforme a regra dele).
4. **Já respondi isso?** Procura a mesma pergunta no cache exato. Se achar, responde na hora.
5. **Já respondi algo com o mesmo sentido?** Procura no cache semântico. Se achar uma pergunta suficientemente parecida, reaproveita a resposta.
6. **Quem vai responder?** Traduz o apelido do modelo (ex.: `inteligente`) para o provedor e modelo reais, na ordem de preferência configurada.
7. **Chama o provedor.** Com tempo máximo de espera. Se falhar por algo temporário, tenta de novo; se continuar falhando, passa para o próximo da lista.
8. **Calcula o custo** com base nos tokens usados e na tabela de preços.
9. **Responde ao cliente**, informando nos cabeçalhos: se veio do cache, qual provedor respondeu, quanto custou e o identificador da chamada.
10. **Depois de responder**, registra tudo (sem atrasar o cliente): quem chamou, o que foi perguntado e respondido, tempo, custo, tentativas. Esse registro alimenta a busca, os relatórios, o controle de orçamento e os alertas.

### 5.2 Respostas em streaming

Com streaming, o texto chega aos poucos. O gateway repassa cada pedaço assim que recebe do provedor. A troca de provedor (fallback) só é possível **antes** de começar a enviar texto; se o provedor falhar no meio, a resposta termina com um aviso de erro, em vez de misturar duas respostas. O custo é calculado quando o texto termina.

### 5.3 Chamadas assíncronas

Para tarefas longas ou em lote:

1. O app envia o pedido (ou uma lista de pedidos) e recebe na hora um identificador.
2. O gateway processa em segundo plano, usando as mesmas regras de uma chamada normal (cache, limites, custo, fallback).
3. O app consulta o resultado pelo identificador ou recebe um aviso automático (callback assinado) quando terminar.
4. Se um pedido falhar todas as tentativas, ele **não se perde**: vai para uma área de falhas, onde pode ser inspecionado e reenviado.

### 5.4 O que acontece quando algo dá errado

| Situação | O que o cliente vê |
|---|---|
| Provedor principal fora do ar | Nada. O gateway usa o provedor reserva |
| Todos os provedores fora do ar | Erro claro de indisponibilidade |
| Cliente passou do limite de uso | Erro 429 com o tempo de espera |
| Cliente estourou o orçamento | Erro de orçamento (ou segue normal, se a regra for só avisar) |
| Chave inválida ou revogada | Erro de autenticação |
| Sistema de busca de logs fora do ar | Nada. As respostas continuam; a busca volta a funcionar e se atualiza depois |
| Sistema de mensagens fora do ar | Nada. Os registros ficam guardados e são enviados quando voltar |
| Cache fora do ar | Nada visível, só mais lento e mais caro |

### 5.5 Como um novo cliente entra

1. O admin cria o cliente (tenant) com nome, orçamento mensal e regras de privacidade (mascarar dados sensíveis? guardar conteúdo?).
2. O admin define os limites de uso do cliente.
3. O admin gera uma chave para ele; ela aparece **uma única vez**.
4. O admin configura (ou reaproveita) os apelidos de modelo disponíveis, com provedor preferido e reservas.
5. O dev do cliente troca o endereço e a chave no app dele e já está funcionando.
6. Desse momento em diante, custos, uso e erros do cliente aparecem nos relatórios e dashboards.

### 5.6 Regras de comportamento importantes

- **Cache e privacidade:** a resposta guardada de um cliente nunca é entregue a outro, mesmo que as perguntas sejam idênticas.
- **Cache e criatividade:** pedidos que pedem respostas muito variadas (alta "temperatura") ou que usam ferramentas/funções não usam o cache semântico por padrão.
- **Cache sob controle:** o cliente pode pedir "sem cache" numa chamada específica.
- **Dinheiro:** todo custo é calculado com a tabela de preços vigente; mudar um preço não altera o passado.
- **Privacidade dos logs:** os logs técnicos do sistema nunca contêm o texto das conversas; o conteúdo só existe na base de busca, mascarado quando configurado, e some depois do período de retenção.
- **Prioridade:** responder ao cliente vem sempre antes de registrar, indexar ou alertar.

### 5.7 Como a qualidade é protegida (evals)

1. O dev de IA escreve casos de teste: uma entrada e o que é esperado da resposta (conter certa palavra, seguir certo formato, ser parecida com uma resposta de referência ou ser aprovada por outro modelo avaliador).
2. Roda os testes contra um apelido de modelo, e recebe taxa de acerto, custo e tempo.
3. Ao mudar um prompt ou um modelo, roda de novo e compara com a versão anterior, caso a caso.
4. No fluxo automático do repositório, se a taxa de acerto cair abaixo do mínimo combinado, a mudança é barrada, com a lista dos casos que pioraram.

### 5.8 Glossário

- **Gateway:** a aplicação deste projeto; o intermediário entre apps e provedores.
- **Tenant (cliente):** quem consome o gateway (um time, um app, uma empresa).
- **Provedor:** quem fornece o modelo (OpenAI, Anthropic...).
- **Apelido de modelo (alias):** nome lógico, como `rapido` ou `inteligente`, que o gateway traduz para provedor e modelo reais.
- **Cache exato / semântico:** reaproveitar resposta quando a pergunta é idêntica / quando tem o mesmo sentido.
- **Fallback:** passar para outro provedor quando o principal falha.
- **Circuit breaker:** parar de chamar um provedor por um tempo quando ele está claramente com problema.
- **Rate limit:** limite de uso por período.
- **Orçamento:** teto de gasto mensal de um cliente.
- **Eval:** teste automatizado de qualidade de prompts e modelos.
- **DLQ (fila de falhas):** lugar onde ficam os itens que falharam todas as tentativas, para análise e reenvio.

## 6. Exemplos de uso

**Uso básico.** Um app que já usa o SDK da OpenAI muda só o endereço e a chave. Pede o modelo `inteligente`. O gateway escolhe o provedor, responde e informa o custo da chamada.

**Cache semântico.** Primeiro usuário pergunta "Qual o prazo de reembolso?" e a chamada é paga. Outro pergunta "Em quantos dias consigo reembolso?". O gateway reconhece que é a mesma dúvida, responde na hora e sem custo.

**Provedor fora do ar.** O provedor principal começa a falhar. O gateway tenta de novo, desiste, e responde pelo provedor reserva. O cliente não percebe; no registro aparece o que aconteceu.

**Cliente com bug.** O sistema de um cliente entra em loop e dispara milhares de chamadas. Ao passar do limite, ele começa a receber "tente de novo em X segundos". Os outros clientes continuam normais.

**Orçamento.** O time de marketing tem US$ 200/mês. Aos US$ 160 o time recebe um aviso. Aos US$ 200 as novas chamadas são bloqueadas (ou seguem, se a regra for só alertar).

**Lote.** Uma empresa precisa classificar 50 mil tickets de suporte. Envia o lote, recebe um identificador, e é avisada quando terminar, sem manter conexão aberta.

**Auditoria.** Um usuário reclama de uma resposta estranha. O time busca pelo texto, acha a chamada, vê modelo, custo e tempo, e abre o caminho completo da requisição para entender o que houve.

**Mudança segura de prompt.** Alguém altera um prompt de classificação. Os testes automáticos rodam e a taxa de acerto cai de 94% para 81%. A mudança é barrada, com a lista dos casos que pioraram.

## 7. O que NÃO é (por enquanto)

- Não treina nem hospeda modelos próprios.
- Não é um framework de agentes; esses podem *usar* o gateway.
- Não cobra clientes (só mede e reporta custo).
- Não precisa de interface elaborada; foco é a API e os dashboards.
- Não precisa suportar todos os provedores: dois reais e um falso (para testes) bastam.

## 8. Como saber que está pronto (visão de portfólio)

- Um app com o SDK da OpenAI funciona apontando para o gateway sem outra mudança.
- Dá para demonstrar: cache economizando, provedor caindo sem o cliente perceber e um cliente sendo limitado sem afetar os outros.
- Dá para demonstrar que o registro/busca pode ficar fora do ar sem afetar as respostas.
- Existe medição real de desempenho (requisições por segundo, latência, taxa de cache) documentada.
- Dá para seguir uma requisição do início ao fim nos dashboards.
- Um teste de qualidade barra uma mudança ruim automaticamente.
- O README explica o problema, mostra uma demonstração e como rodar tudo rapidamente.

## 9. Em aberto (para decidir ao longo do caminho)

- Nome final do projeto.
- Quais provedores reais usar.
- Quanto da parte de evals entra na primeira versão.
- Como será a administração (só API ou também uma tela simples).
