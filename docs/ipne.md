# IPNE: metodologia, resultados e como apresentar

Material para o grupo defender o índice na banca.

## Em 1 minuto (roteiro de fala)

> "Mostrar onde já existe painel solar é fácil: a ANEEL publica isso. O que o SolarData faz é mostrar **onde deveria haver mais e ainda não há**.
>
> Um estudo da PUC-Rio mostrou que a adoção solar nos municípios é explicada mais por fatores de demanda, como renda e tamanho da população, do que pela quantidade de sol. Então treinamos um modelo com os 5.565 municípios: ele estima quantas instalações cada cidade teria pela renda das famílias, PIB, população, densidade, domicílios e irradiação solar, comparando com cidades do mesmo estado.
>
> O IPNE compara quantas instalações a cidade tem hoje com o esperado pelo perfil dela, numa nota de 0 a 100. Quanto maior, mais espaço para crescer: perto de 100 é alta oportunidade; perto de 0, mercado maduro. Esse modelo explica 86% da variação entre municípios, inclusive para municípios que ele não viu no treino. Ele não garante venda: aponta onde vale investigar."

## O modelo

Regressão linear em escala logarítmica, ajustada no Databricks (`databricks/dmm_02_ipne_municipio.py`):

```
log(1 + instalações) = b0 + b1·log(PIB) + b2·log(população) + b3·log(densidade) + b4·log(densidade)²
                       + b5·log(renda domiciliar per capita) + b6·log(irradiação) + b7·log(domicílios/habitante)
                       + efeito da UF
```

- **Esperado** = valor previsto pelo modelo. **No app, aparece como "Esperado pelo perfil"**, e a diferença aparece em instalações ("espaço para cerca de X instalações"), não em porcentagem. Não é a média de uma lista de cidades: a lista "Cidades com perfil semelhante" do Início é um recurso à parte (vizinhos mais próximos no Brasil todo em população, PIB per capita, renda, densidade e domicílios por habitante, sem o sol), só para comparar pares.
- **Diferença** = real ÷ esperado − 1 (negativa = abaixo do esperado).
- **IPNE** = percentil do resíduo invertido: 100 = entre os mais abaixo do esperado no país.

### Por que cada termo existe (evolução que a banca pode perguntar)

| Versão | R² | O que aconteceu | Decisão |
|---|---|---|---|
| PIB + população (proposta original) | 0,66 | O ranking de oportunidade virou "Grande SP", e o Nordeste ficou todo como "saturado" | O modelo estava captando o sol e a tarifa do Nordeste, que não estão nele |
| + efeito fixo por UF | 0,77 | Cada cidade passa a ser comparada com as do próprio estado. Absorve radiação, tarifa e distribuidora | Mantido |
| + densidade (linear) | 0,77 | Coeficiente zero: a densidade não tem efeito linear | Investigado por faixas |
| + densidade em U invertido | 0,79 | Acima de 1.000 hab/km², a adoção cai muito (verticalização: apartamento não tem telhado próprio). Municípios muito esparsos (rurais) também adotam menos | v1 (31/10) |
| + renda domiciliar, irradiação e domicílios por habitante (dados do Gustavo, Censo 2022 e INPE) | **0,86** (0,86 em validação cruzada de 5 dobras) | A renda das famílias separa riqueza de PIB industrial: Cubatão e Itapevi saíram do topo. A irradiação mede diferença de sol **dentro** do estado | **v2 (09/11), modelo atual** |

O IPNE médio por região ficou entre 49 e 51, ou seja, o índice não favorece nenhuma região.

**O que mudou da v1 para a v2 (para não estranhar na demo):** cidades de renda alta subiram no índice, porque o modelo passou a "esperar" mais delas. Campinas foi de 57 para 92, e o topo passou a ter Santos, Vitória, Porto Alegre e Florianópolis.

## Dados e decisões

| Item | Decisão | Motivo |
|---|---|---|
| Fonte solar | `fonte_id` 7 e 8 (UFV micro e mini) | 99,98% dos registros de GD |
| Série histórica | `data_atualizacao_cadastral` como aproximação da conexão | A base ANEEL não tem data de conexão; confirmado que `tempo_id` bate 100% com essa coluna |
| Datas de 1900 | Fora da série, contam no estoque | 56 registros; marcador de data ausente |
| PIB | 2023, SIDRA 5938 | Mais recente publicado |
| Renda domiciliar per capita e domicílios | Censo 2022 (silver do Gustavo) | Mede renda das famílias, não da produção |
| Irradiação | INPE Atlas Solar 2017, global horizontal na sede municipal (Wh/m²·dia ÷ 1000) | 18 municípios sem correspondência recebem a média da UF, marcados como "estimada" |
| População do modelo | Censo 2022 | Contagem oficial mais próxima do ano do PIB |
| População dos indicadores por habitante | Estimativa 2026, SIDRA 6579 | Mais atual, compatível com a base ANEEL 10/2026 |
| Distrito Federal | Sem IPNE | Município único: não há com quem comparar dentro da UF |
| Último ano (2026) | Marcado como parcial | Não é comparado com anos completos |

## Limitações (dizer antes que perguntem)

1. **É um proxy de oportunidade, não demanda.** Pouca adoção pode ter causas fora do modelo: tarifa local, distribuidora lenta, renda concentrada, área rural.
2. **Verticalização ainda pesa nas cidades ricas.** Na v2, o topo do ranking tem capitais e cidades litorâneas de renda alta (Santos, Vitória, Porto Alegre), onde muita gente mora em apartamento, sem telhado próprio. A densidade capta parte disso. Próximo passo: a proporção de apartamentos do Censo 2022. *(Resolvido na v2: o PIB industrial de Cubatão e Paranaguá deixou de inflar o esperado.)*
3. **Data de atualização cadastral não é data de conexão.** A curva histórica é uma aproximação.
4. **Modelo transversal.** Compara municípios hoje; não prevê a evolução no tempo (a previsão de 12 meses da proposta PI6 ficou fora deste escopo).

## Perguntas prováveis da banca

**"São Paulo capital tem espaço para cerca de 64 mil instalações. É a maior oportunidade?"**
Está entre as maiores (IPNE 99), mas é o caso que mais pede cautela: muitos apartamentos e pouco telhado próprio. O modelo já desconta a densidade, mas não mede diretamente o tipo de moradia. É a próxima melhoria (proporção de apartamentos do Censo).

**"E o modelo de Machine Learning? Por que dois modelos?"**
Eles respondem perguntas diferentes. O IPNE (regressão) compara o município com o esperado pelo perfil, explica o porquê termo a termo e gera a nota de 0 a 100 e o espaço em número de instalações. O Random Forest do Gustavo estima a **potência em MW** que o município comportaria. Ele foi validado fora da amostra (R² de 0,84 em escala log e 0,70 em MW, erro médio de 3,8 MW), e os dois apontam a mesma direção em 68% dos municípios. Onde divergem, nas maiores cidades, o motivo é conhecido: árvores de decisão não estimam acima do que viram no treino. Ver [backlog](backlog.md).

**"Por que regressão linear e não um modelo de machine learning?"**
O objetivo é explicar o esperado com fatores interpretáveis, para o usuário entender por que a cidade tem aquela nota. Os coeficientes são públicos em `/api/modelo`. Um modelo mais complexo ganharia pouco R² e perderia explicabilidade.

**"Como vocês validaram?"**
Pelo R² (0,86) e pela validação cruzada de 5 dobras (0,86: cada município é previsto por um modelo treinado sem ele, então não há sobreajuste). Também pela coerência regional (IPNE médio de 49 a 51 em todas as regiões) e pela análise dos resíduos por faixa de densidade, que motivou o termo em U.

**"Onde está o Big Data?"**
4,67 milhões de empreendimentos processados no Databricks em arquitetura medalhão (bronze, silver, gold), cruzados com 3 bases do IBGE. O app consulta o Lake ao vivo pelo SQL Warehouse.

**"E a LGPD?"**
A base da ANEEL tem CPF/CNPJ e nome do titular na silver. O app só lê tabelas gold agregadas por município, então nenhum dado pessoal sai do Lake.
