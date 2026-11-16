# 07: Contrato de configuração do gateway

**O que construir:** o gateway passa a ter um contrato de configuração completo para o que já existe. Sem `.env`, ele sobe com padrões de desenvolvimento. Com uma variável inválida, o processo termina com código `1` e uma mensagem que lista cada variável problemática e o motivo, sem nunca mostrar o valor enviado. O resto do código recebe a configuração já tipada por injeção de dependência e nunca lê `process.env` diretamente.

**Bloqueado por:** 06

**Status:** ready-for-agent

**Leitura:** [estudos/12 — Validação com Zod](../../../estudos/12-validacao-com-zod.md)

## Critérios de aceite

- [ ] Schema do gateway com `NODE_ENV` (`development` | `test` | `production`), `HOST` e `PORT`, com padrões de desenvolvimento, escrito em TDD (contrato de configuração).
- [ ] Erro de configuração legível: uma linha `variável → motivo` por campo inválido, sem o valor recebido (teste prova que um valor "secreto" enviado não aparece na mensagem).
- [ ] O ponto de entrada encerra o processo com código `1` quando a configuração é inválida.
- [ ] A configuração validada é um provider tipado no container do Nest e é injetada onde é usada. Esse é o primeiro uso real de injeção por construtor, e o teste pelo seam prova que os metadados do SWC funcionam.
- [ ] Ler `process.env` fora do ponto de carregamento da configuração é erro de lint (regra nativa do ESLint).
- [ ] `.env` local carregado pelo próprio Node (`--env-file-if-exists`), sem `dotenv`; `.env.example` versionado com todas as variáveis aceitas.

## Pontos de atenção

- Coerção: variáveis de ambiente são sempre strings. `PORT=abc` e `PORT=99999` precisam falhar.
- "Parse, don't validate": depois da fronteira, ninguém lida com `string | undefined`.
- Ordem: a configuração é validada antes de o Nest montar qualquer módulo, para que nenhum efeito colateral (porta aberta, conexão) aconteça com config inválida.
