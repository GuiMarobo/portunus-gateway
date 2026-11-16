# 30 — Grafana e alertas

> **Épicos:** E6 (dashboard "Visão geral"), E7 ("Provedores"), E11 ("Filas e eventos"), E12 ("Custo" e regras de alerta).
> **Onde:** `infra/grafana/dashboards/`, `infra/grafana/alerting/`.

---

## 1. O problema

Ter métricas, logs e traces não adianta se ninguém olha, e ninguém consegue olhar o tempo todo. São necessários **painéis** que respondam rápido às perguntas mais comuns e **alertas** que chamem alguém **só** quando algo exige ação.

## 2. Como funciona

### 2.1 Grafana

Uma ferramenta de **visualização**: não guarda dados, **consulta** outras fontes (*data sources*: Prometheus, Loki, Tempo, Postgres, Elasticsearch...) e as mostra em painéis.

- **Dashboard:** uma página de **painéis** (gráficos de série temporal, números, tabelas, mapas de calor).
- **Variáveis:** filtros no topo (ex.: `$tenant`, `$model`) que mudam todas as consultas da página.
- **Correlação entre sinais:** de um ponto no gráfico (exemplar) → trace no Tempo → logs no Loki daquele `trace_id`.
- **Explore:** modo livre de investigação, sem montar painel.

### 2.2 Provisionamento como código

Dashboards, data sources e alertas são definidos em **arquivos** (JSON/YAML) versionados no git e carregados na inicialização do Grafana. Ninguém cria painéis "na mão" que se perdem ao recriar o container. É o que `infra/grafana/` vai conter.

### 2.3 Como montar um bom dashboard

- **Uma pergunta por dashboard.** Visão geral, Custo, Provedores, Filas (ARQUITETURA.md §9).
- **De cima para baixo, do geral ao específico:** primeira linha com os sinais de ouro (req/s, erro, p95, hit rate), depois os detalhes.
- **Percentis, não médias**, e unidades corretas (s, USD, %).
- **Comparação com o objetivo:** linha de referência no SLO (ex.: p95 < 20 ms de overhead).

### 2.4 Alertas

O Grafana avalia **regras** periodicamente (ex.: uma consulta PromQL) e muda o estado do alerta: `Normal → Pending → Firing → Normal`.

```
Regra: taxa de erro > 5% por 5 minutos
  consulta: sum(rate(gateway_requests_total{status=~"5.."}[5m])) / sum(rate(gateway_requests_total[5m]))
  condição: > 0.05
  pending period: 5m           ← evita alarme por um pico de 10 s
  labels: severity=critical
  notificação → contact point (e-mail, Slack, webhook, PagerDuty)
```

Peças:

- **Regra de alerta:** consulta + condição + duração.
- **Contact point:** para onde vai (Slack, e-mail, webhook).
- **Notification policy:** roteamento por labels, agrupamento e silenciamento.
- **Silences:** calar um alerta durante uma manutenção.

### 2.5 Princípios de bons alertas

- **Alerte sobre sintomas, não sobre causas:** "clientes recebendo erro" (sintoma) antes de "CPU a 80%" (causa possível, nem sempre um problema).
- **Todo alerta precisa ser acionável:** se a resposta é "ignore", o alerta não deveria existir.
- **Fadiga de alertas:** alertas demais fazem as pessoas ignorarem os importantes.
- **Runbook:** cada alerta com um link para "o que fazer".
- **Burn rate de SLO:** alertar quando o *error budget* está sendo consumido rápido demais é mais robusto que limiares fixos.

## 3. Analogia

O Grafana é o **painel da torre de controle de um aeroporto**: ele não pilota aviões nem guarda dados de voo, mas junta radar (métricas), rádio (logs) e plano de voo (traces) numa tela. Os alertas são o **alarme da torre**: só tocam quando um avião sai da rota por tempo suficiente. Se tocassem a cada turbulência, os controladores passariam a ignorá-los.

## 4. Por que está nesta arquitetura

- É a "janela" de toda a stack de observabilidade (Prometheus, Loki, Tempo).
- CONTEXT.md §4.9: alertas quando algo sai do normal.
- ARQUITETURA.md §9 define os quatro dashboards e os alertas: erro acima de X% por 5 min, p95 acima do objetivo, circuito aberto, orçamento acima de 80%, DLQ crescendo e lag alto de consumidor.

## 5. Ferramentas similares

| Ferramenta | Diferença |
|---|---|
| **Grafana** | Multi-fonte, open source, provisionamento como código. **A escolha do projeto** |
| **Kibana** | Visualização do ecossistema Elastic; forte em logs e busca |
| **OpenSearch Dashboards** | Equivalente do Kibana no OpenSearch |
| **Prometheus Alertmanager** | Roteamento de alertas do ecossistema Prometheus (agrupamento, silenciamento); alternativa ao alerting do Grafana |
| **Datadog, New Relic** | Dashboards e alertas integrados na plataforma SaaS |
| **PagerDuty, Opsgenie** | Gestão de plantão e escalonamento; **recebem** alertas, não os geram |
| **Metabase, Superset** | BI e analytics de negócio (relatórios de custo a partir do Postgres), não monitoramento operacional |

## 6. Armadilhas

- **Dashboards criados à mão** e perdidos ao recriar o ambiente.
- **Consultas pesadas** em dashboards com atualização a cada 5 s, que sobrecarregam o Prometheus e o Loki.
- **Alertas sem `pending period`** (*flapping*).
- **Alertas sobre métricas que somem:** se o serviço cai, a métrica para de existir e a regra "erro > 5%" nunca dispara. Alerte também sobre ausência de dados (`absent()`).
- **Alerta de orçamento duplicado:** o "80% do orçamento" deve disparar uma vez por tenant por mês (dedupe, no E12).

## 7. No Portunus

- E6: Grafana provisionado com data sources e o dashboard "Visão geral".
- E7: "Provedores". E11: "Filas e eventos". E12: "Custo" + regras de alerta.
- Decisão em aberto (E12): o canal de notificação do Alerter (alerta do Grafana, webhook ou evento/log).

## 8. Para aprofundar

- Grafana — documentação: https://grafana.com/docs/grafana/latest/
- Grafana — *Provisioning*: https://grafana.com/docs/grafana/latest/administration/provisioning/
- Grafana — *Alerting*: https://grafana.com/docs/grafana/latest/alerting/
- Rob Ewaschuk — *My Philosophy on Alerting*: https://docs.google.com/document/d/199PqyG3UsyXlwieHaqbGiWVa8eMWi8zzAn0YfcApr8Q/
- Google SRE Workbook — *Alerting on SLOs*: https://sre.google/workbook/alerting-on-slos/
