# ADR 010 — Nome do projeto: Portunus Gateway

- **Status:** Aceito
- **Data:** 2026-11-16

## Contexto

O projeto nasceu com o nome de trabalho `llm-gateway`. Esse nome descreve a categoria do sistema, não o sistema: no GitHub existem centenas de repositórios chamados `llm-gateway`, `ai-gateway` ou variações com "proxy" e "router". Um nome genérico atrapalha a busca, não deixa o repositório ter identidade própria e confunde quando se fala do projeto e quando se fala do conceito.

Como o escopo dos pacotes do workspace (`@llm-gateway/*`) também vinha desse nome, convém fixar o nome definitivo antes que exista código importando esses pacotes. Hoje a troca só mexe em documentação.

## Decisão

- **Nome:** **Portunus Gateway**. No texto corrido, apenas **Portunus**.
- **Repositório e pasta:** `portunus-gateway`.
- **Escopo dos pacotes do workspace:** `@portunus/*` (ex.: `@portunus/gateway`, `@portunus/events`, `@portunus/consumers`).
- O termo "LLM gateway" continua nos documentos quando se refere à **categoria** de sistema (ex.: `docs/estudos/03-llm-gateway.md`), e não a este projeto.

### Por que Portunus

Portunus é o deus romano das **chaves, portas e portos**, representado segurando uma chave. A metáfora cobre o papel do sistema:

- **Chaves:** as API keys do gateway, emitidas e revogadas por tenant.
- **Portas:** o ponto único de entrada que decide quem passa (auth, rate limit, orçamento).
- **Portos:** o lugar de onde as requisições partem para destinos diferentes (roteamento e fallback entre provedores).

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| Manter `llm-gateway` | Genérico demais; colide com centenas de repositórios. |
| Janus (deus romano das passagens, com duas faces) | A metáfora é boa, mas o nome já é muito usado em projetos de infraestrutura. |
| Catraca, Pedágio | São nomes em português; a preferência foi por um nome em inglês ou de origem clássica. |
| Hufu (o "tally do tigre" chinês, um token de autenticação) | É original, mas a metáfora cobre só a autenticação. |
| Cursus (o *cursus publicus*, correio romano com troca de cavalos) | Destaca bem a resiliência, mas não o controle de acesso nem o custo. |
| Escopo `@portunus-gateway/*` | Fica redundante: `@portunus-gateway/gateway`. |

## Consequências

- **Disponibilidade, verificada em 2026-11-16:** nenhum repositório se chama `portunus-gateway` no GitHub, e `@portunus/gateway` está livre no npm. Existe o `Lixiuxiu559/portunus`, um roteador de LLM pequeno (5 estrelas); o sufixo "-gateway" diferencia os dois.
- O pacote `portunus` sem escopo já existe no npm (um conversor de números romanos). Isso não afeta o projeto, porque os pacotes do workspace são privados e sempre usam escopo.
- `CLAUDE.md`, `CONTEXT.md`, `ARQUITETURA.md`, `ROADMAP.md`, `arquitetura.mermaid` e `docs/estudos/` foram atualizados para o novo nome e o novo escopo.
- Falta renomear a pasta local e o repositório remoto para `portunus-gateway`.
