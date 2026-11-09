# Backlog

## ~~Validar o modelo de ML do Gustavo~~ (validado em 09/11/2026)

Tabela `gold.dmm_ml_potencial_municipio` (Random Forest, alvo em MW). Notebook de validação: `databricks/dmm_03_ml_potencial.py` (modo `comparar`, não grava nada).

| Pergunta | Resultado |
|---|---|
| Previsões fora da amostra? | **Sim.** O R² recalculado a partir da tabela é 0,695, igual ao reportado. Previsões feitas com os dados de treino dariam perto de 0,95 |
| Convenção da diferença | Coerente: `diferenca_mw = esperado − instalado` (positivo = espaço para crescer). Só é o oposto do IPNE; no app, mostrar como "potencial adicional" |
| Viés por tamanho? | **Pequeno.** % "acima do esperado" por faixa de população: 41 / 46 / 49 / 50 / 60 (ideal: 50). *A primeira análise agrupava por potência real, o que cria o padrão artificialmente (regressão à média); corrigido* |
| Alternativas testadas | RF com alvo em log: equilíbrio e MAE um pouco melhores (3,78 contra 3,83 MW), ganho pequeno. Gradient Boosting em log: menor erro total, mas estimativas absurdas nas maiores cidades (46 MW para São Paulo). **Mantido o modelo do Gustavo** |
| Concordância com o IPNE v2 | Mesma direção em 68% dos municípios. Divergem nas maiores cidades: árvores não estimam acima do que viram no treino (São Paulo: 135 MW estimados contra 249 instalados) |

Pendente: ao integrar no app, marcar a estimativa como menos confiável para municípios acima de 1 milhão de habitantes. Sugerir ao Gustavo um prefixo próprio (as tabelas dele usam `dmm_`, que identifica as do Daniel, com a tag `autor = dmm`).

## IPNE: proporção de apartamentos

Na v2, o topo do ranking concentra cidades ricas e verticalizadas (Santos, Vitória, Porto Alegre). A densidade capta só parte disso. Ingerir a proporção de domicílios do tipo apartamento (Censo 2022) e testar no modelo.

## Tabelas do Gustavo que copiam o IPNE

`gold.dmm_ranking_oportunidades` e `gold.dmm_municipio_potencial_solar` copiaram o IPNE v1 (01/11). Com a v2 (09/11), elas ficam desatualizadas até serem recalculadas a partir de `gold.dmm_municipio_resumo`.
