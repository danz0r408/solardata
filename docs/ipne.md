# IPNE: metodologia, resultados e como apresentar

Material para o grupo defender o índice na banca.

## Em 1 minuto (roteiro de fala)

> "Mostrar onde já existe painel solar é fácil: a ANEEL publica isso. O que o SolarData faz é mostrar **onde deveria haver mais e ainda não há**.
>
> Um estudo da PUC-Rio mostrou que a adoção solar nos municípios é explicada mais por fatores de demanda, como renda e tamanho da população, do que pela quantidade de sol. Então treinamos um modelo com os 5.565 municípios: ele estima quantas instalações cada cidade teria pelo seu PIB, população e densidade, comparando com cidades do mesmo estado.
>
> O IPNE é a distância entre o esperado e o real, numa nota de 0 a 100. Perto de 100, a cidade está muito abaixo do que o perfil dela sugere. Esse modelo explica 79% da variação entre municípios. Ele não garante venda: aponta onde vale investigar."

## O modelo

Regressão linear em escala logarítmica, ajustada no Databricks (`databricks/dmm_02_ipne_municipio.py`):

```
log(1 + instalações) = b0 + b1·log(PIB) + b2·log(população) + b3·log(densidade) + b4·log(densidade)² + efeito da UF
```

- **Esperado** = valor previsto pelo modelo.
- **Diferença** = real ÷ esperado − 1 (negativa = abaixo do esperado).
- **IPNE** = percentil do resíduo invertido: 100 = entre os mais abaixo do esperado no país.

### Por que cada termo existe (evolução que a banca pode perguntar)

| Versão | R² | O que aconteceu | Decisão |
|---|---|---|---|
| PIB + população (proposta original) | 0,66 | O ranking de oportunidade virou "Grande SP", e o Nordeste ficou todo como "saturado" | O modelo estava captando o sol e a tarifa do Nordeste, que não estão nele |
| + efeito fixo por UF | 0,77 | Cada cidade passa a ser comparada com as do próprio estado. Absorve radiação, tarifa e distribuidora | Mantido |
| + densidade (linear) | 0,77 | Coeficiente zero: a densidade não tem efeito linear | Investigado por faixas |
| + densidade em U invertido | **0,79** | Acima de 1.000 hab/km², a adoção cai muito (verticalização: apartamento não tem telhado próprio). Municípios muito esparsos (rurais) também adotam menos | **Modelo final** |

O IPNE médio por região ficou entre 49 e 51, ou seja, o índice não favorece nenhuma região.

## Dados e decisões

| Item | Decisão | Motivo |
|---|---|---|
| Fonte solar | `fonte_id` 7 e 8 (UFV micro e mini) | 99,98% dos registros de GD |
| Série histórica | `data_atualizacao_cadastral` como aproximação da conexão | A base ANEEL não tem data de conexão; confirmado que `tempo_id` bate 100% com essa coluna |
| Datas de 1900 | Fora da série, contam no estoque | 56 registros; marcador de data ausente |
| PIB | 2023, SIDRA 5938 | Mais recente publicado |
| População do modelo | Censo 2022 | Contagem oficial mais próxima do ano do PIB |
| População dos indicadores por habitante | Estimativa 2026, SIDRA 6579 | Mais atual, compatível com a base ANEEL 10/2026 |
| Distrito Federal | Sem IPNE | Município único: não há com quem comparar dentro da UF |
| Último ano (2026) | Marcado como parcial | Não é comparado com anos completos |

## Limitações (dizer antes que perguntem)

1. **É um proxy de oportunidade, não demanda.** Pouca adoção pode ter causas fora do modelo: tarifa local, distribuidora lenta, renda concentrada, área rural.
2. **PIB empresarial infla o esperado.** Cidades portuárias e industriais (Cubatão, Paranaguá) têm PIB alto que não é renda das famílias. Aparecem como oportunidade, mas merecem leitura cuidadosa. Próximo passo: usar renda domiciliar do Censo 2022.
3. **Data de atualização cadastral não é data de conexão.** A curva histórica é uma aproximação.
4. **Modelo transversal.** Compara municípios hoje; não prevê a evolução no tempo (a previsão de 12 meses da proposta PI6 ficou fora deste escopo).

## Perguntas prováveis da banca

**"Por que São Paulo capital não é a maior oportunidade, se está 69% abaixo do esperado?"**
Está no topo (IPNE 96), mas o modelo já desconta a verticalização. Sem o termo de densidade, a capital e a Grande SP dominavam o ranking, o que seria só um efeito de cidade grande e densa.

**"Por que regressão linear e não um modelo de machine learning?"**
O objetivo é explicar o esperado com fatores interpretáveis, para o usuário entender por que a cidade tem aquela nota. Os coeficientes são públicos em `/api/modelo`. Um modelo mais complexo ganharia pouco R² e perderia explicabilidade.

**"Como vocês validaram?"**
Pelo R² (0,79), pela coerência regional (IPNE médio de 49 a 51 em todas as regiões) e pela análise dos resíduos por faixa de densidade, que motivou o termo em U.

**"Onde está o Big Data?"**
4,67 milhões de empreendimentos processados no Databricks em arquitetura medalhão (bronze, silver, gold), cruzados com 3 bases do IBGE. O app consulta o Lake ao vivo pelo SQL Warehouse.

**"E a LGPD?"**
A base da ANEEL tem CPF/CNPJ e nome do titular na silver. O app só lê tabelas gold agregadas por município, então nenhum dado pessoal sai do Lake.
