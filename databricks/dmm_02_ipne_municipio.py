# Databricks notebook source
# MAGIC %md
# MAGIC # dmm_02 - KPIs por municipio e IPNE
# MAGIC
# MAGIC **IPNE - Indice de Potencial Nao Explorado.** Estima quantas instalacoes solares cada
# MAGIC municipio "deveria" ter dado seu PIB e sua populacao, e compara com o observado.
# MAGIC
# MAGIC Modelo: regressao linear em log, ajustada com todos os municipios
# MAGIC
# MAGIC     log(1 + instalacoes) = b0 + b1 * log(PIB) + b2 * log(populacao) + b3 * log(dens) + b4 * log(dens)^2 + efeito_UF
# MAGIC
# MAGIC O efeito fixo por UF faz cada municipio ser comparado com os do proprio estado (absorve radiacao,
# MAGIC tarifa e distribuidora). A densidade controla verticalizacao. O DF (municipio unico) fica sem IPNE.
# MAGIC
# MAGIC - `esperado = exp(previsto) - 1`
# MAGIC - `diferenca_pct = real / esperado - 1` (negativo = abaixo do esperado)
# MAGIC - `ipne` = percentil (0-100) do residuo invertido: 100 = mais abaixo do esperado
# MAGIC
# MAGIC Ressalva: e um proxy de oportunidade, nao medida de demanda nem previsao de vendas.
# MAGIC Fatores fora do modelo (tarifa, radiacao, ruralidade, distribuidora) explicam parte do residuo.
# MAGIC
# MAGIC Decisoes de dados (ver auditoria em `docs/`):
# MAGIC - Solar = `fonte_id` 7 e 8 (UFV micro e minigeracao).
# MAGIC - A serie anual usa `data_atualizacao_cadastral` (unica data da fonte ANEEL) como proxy da conexao;
# MAGIC   datas de 1900 sao marcador de ausencia e ficam fora da serie, mas contam no estoque.
# MAGIC - Modelo: PIB 2023 (SIDRA 5938) + populacao Censo 2022. Indicadores por habitante: estimativa mais recente.
# MAGIC
# MAGIC Gera (sem alterar tabelas existentes): `gold.dmm_municipio_resumo`, `gold.dmm_kpi_municipio_anual`,
# MAGIC `gold.dmm_ipne_modelo`. Nenhuma coluna pessoal (CPF/CNPJ, titular) e lida.

# COMMAND ----------

import numpy as np
import pandas as pd
from datetime import datetime, timezone

CATALOG = "`pi-6`"
FONTES_SOLARES = (7, 8)

spark.sql(f"""
CREATE OR REPLACE TEMP VIEW solar AS
SELECT l.cod_municipio_ibge, t.ano, e.potencia_instalada_kw, e.qtd_uc_recebe_credito, e.periodo_referencia
FROM {CATALOG}.gold.fato_empreendimentos e
JOIN {CATALOG}.gold.dim_local l USING (local_id)
JOIN {CATALOG}.gold.dim_tempo t USING (tempo_id)
WHERE e.fonte_id IN {FONTES_SOLARES} AND e.potencia_instalada_kw > 0
""")

# COMMAND ----------

# Serie anual por municipio (sem 1900) com acumulado
spark.sql(f"""
CREATE OR REPLACE TABLE {CATALOG}.gold.dmm_kpi_municipio_anual AS
WITH anual AS (
  SELECT cod_municipio_ibge, ano,
         count(*) AS qtd_novas,
         round(sum(potencia_instalada_kw), 2) AS potencia_kw_nova
  FROM solar WHERE ano > 1900
  GROUP BY cod_municipio_ibge, ano
)
SELECT *,
  sum(qtd_novas) OVER (PARTITION BY cod_municipio_ibge ORDER BY ano) AS qtd_acumulada,
  round(sum(potencia_kw_nova) OVER (PARTITION BY cod_municipio_ibge ORDER BY ano), 2) AS potencia_kw_acumulada
FROM anual
""")

# COMMAND ----------

ano_pop = spark.sql(f"SELECT max(cast(ano as int)) FROM {CATALOG}.bronze.ibge_populacao_municipio").first()[0]
ano_pib = spark.sql(f"SELECT max(ano) FROM {CATALOG}.silver.dmm_pib_municipio").first()[0]
periodo_ref = spark.sql("SELECT max(periodo_referencia) FROM solar").first()[0]
ano_completo = spark.sql("SELECT max(ano) - 1 FROM solar").first()[0]  # o ultimo ano da base e parcial

base = spark.sql(f"""
WITH estoque AS (
  SELECT cod_municipio_ibge,
         count(*) AS qtd_instalacoes,
         sum(potencia_instalada_kw) AS potencia_kw,
         sum(qtd_uc_recebe_credito) AS qtd_uc_credito
  FROM solar GROUP BY cod_municipio_ibge
),
novas AS (
  SELECT cod_municipio_ibge,
         sum(CASE WHEN ano = {ano_completo} THEN qtd_novas END) AS qtd_novas_ultimo_ano,
         sum(CASE WHEN ano = {ano_completo} - 1 THEN qtd_novas END) AS qtd_novas_ano_anterior
  FROM {CATALOG}.gold.dmm_kpi_municipio_anual GROUP BY cod_municipio_ibge
),
pop AS (
  SELECT cast(cod_municipio_ibge as int) AS cod_municipio_ibge, cast(populacao as bigint) AS populacao
  FROM {CATALOG}.bronze.ibge_populacao_municipio WHERE cast(ano as int) = {ano_pop}
),
censo AS (
  SELECT cast(cod_municipio_ibge as int) AS cod_municipio_ibge, cast(populacao as bigint) AS populacao_censo2022
  FROM {CATALOG}.bronze.ibge_populacao_censo2022
)
SELECT l.cod_municipio_ibge, l.nom_municipio, l.sig_uf, l.nom_regiao,
       coalesce(e.qtd_instalacoes, 0) AS qtd_instalacoes,
       coalesce(e.potencia_kw, 0) AS potencia_kw,
       coalesce(e.qtd_uc_credito, 0) AS qtd_uc_credito,
       coalesce(n.qtd_novas_ultimo_ano, 0) AS qtd_novas_ultimo_ano,
       coalesce(n.qtd_novas_ano_anterior, 0) AS qtd_novas_ano_anterior,
       p.populacao, c.populacao_censo2022, b.pib_mil_reais, d.densidade_hab_km2
FROM {CATALOG}.gold.dim_local l
LEFT JOIN estoque e USING (cod_municipio_ibge)
LEFT JOIN novas n USING (cod_municipio_ibge)
LEFT JOIN pop p USING (cod_municipio_ibge)
LEFT JOIN censo c USING (cod_municipio_ibge)
LEFT JOIN {CATALOG}.silver.dmm_pib_municipio b USING (cod_municipio_ibge)
LEFT JOIN {CATALOG}.silver.dmm_densidade_municipio d USING (cod_municipio_ibge)
""").toPandas()

print(len(base), "municipios | pop", ano_pop, "| pib", ano_pib, "| referencia", periodo_ref)

# COMMAND ----------

# Ajuste do modelo (5.5 mil linhas: pandas/numpy basta)
# O DF tem um unico municipio: com efeito fixo por UF ele seria comparado consigo mesmo
ok = (
    base["pib_mil_reais"].gt(0) & base["populacao_censo2022"].gt(0)
    & base["densidade_hab_km2"].gt(0) & base["sig_uf"].ne("DF")
)
m = base[ok]
y = np.log1p(m["qtd_instalacoes"].to_numpy())
X_base = np.column_stack([np.ones(len(m)), np.log(m["pib_mil_reais"]), np.log(m["populacao_censo2022"])])
# Efeito fixo por UF: cada municipio e comparado com os do proprio estado,
# o que absorve radiacao, tarifa e distribuidora (fora do modelo, variam mais entre UFs).
# Densidade entra em U invertido (log + log^2): municipios muito esparsos (rurais) e muito densos
# (verticalizados, menos telhado proprio) adotam menos. O termo linear sozinho da coeficiente ~0.
X_uf = pd.get_dummies(m["sig_uf"], drop_first=True, dtype=float).to_numpy()
log_dens = np.log(m["densidade_hab_km2"].to_numpy())
X = np.column_stack([X_base, log_dens, log_dens ** 2, X_uf])

def ajusta(X):
    coef, *_ = np.linalg.lstsq(X, y, rcond=None)
    residuo = y - X @ coef
    return coef, residuo, 1 - (residuo ** 2).sum() / ((y - y.mean()) ** 2).sum()

_, _, r2_sem_uf = ajusta(X_base)
coef, residuo, r2 = ajusta(X)
print(f"R2 so PIB+pop = {r2_sem_uf:.3f} | R2 final = {r2:.3f} | b_pib = {coef[1]:.3f} | b_pop = {coef[2]:.3f} | b_dens = {coef[3]:.3f} | b_dens2 = {coef[4]:.3f}")

base.loc[ok, "qtd_esperada"] = np.expm1(y - residuo)
base.loc[ok, "residuo_log"] = residuo
base["diferenca_pct"] = base["qtd_instalacoes"] / base["qtd_esperada"] - 1
base["ipne"] = (-base["residuo_log"]).rank(pct=True).mul(100).round(0)

# COMMAND ----------

base["inst_por_mil_hab"] = base["qtd_instalacoes"] / base["populacao"] * 1000
base["kw_por_hab"] = base["potencia_kw"] / base["populacao"]
base["pib_per_capita_reais"] = base["pib_mil_reais"] * 1000 / base["populacao_censo2022"]
base["crescimento_ultimo_ano_pct"] = np.where(
    base["qtd_novas_ano_anterior"] > 0,
    base["qtd_novas_ultimo_ano"] / base["qtd_novas_ano_anterior"] - 1,
    np.nan,
)
base["rank_adocao"] = base["qtd_instalacoes"].rank(ascending=False, method="min").astype(int)
base["rank_ipne"] = base["residuo_log"].rank(method="first")  # 1 = mais abaixo do esperado
base["ano_populacao"] = ano_pop
base["ano_pib"] = ano_pib
base["ano_completo"] = ano_completo
base["periodo_referencia"] = periodo_ref

for c in ["potencia_kw", "qtd_esperada", "inst_por_mil_hab", "kw_por_hab", "pib_per_capita_reais"]:
    base[c] = base[c].round(2)
for c in ["diferenca_pct", "crescimento_ultimo_ano_pct", "residuo_log"]:
    base[c] = base[c].round(4)

spark.createDataFrame(base).write.mode("overwrite").option("overwriteSchema", "true") \
    .saveAsTable(f"{CATALOG}.gold.dmm_municipio_resumo")

# COMMAND ----------

modelo = pd.DataFrame([{
    "modelo": "ols_log_pib_populacao_densidade_efeito_uf",
    "formula": "log(1+instalacoes) ~ log(pib_mil_reais) + log(populacao_censo2022) + log(densidade) + log(densidade)^2 + UF",
    "b0": float(coef[0]), "b_log_pib": float(coef[1]), "b_log_populacao": float(coef[2]),
    "b_log_densidade": float(coef[3]), "b_log_densidade_2": float(coef[4]),
    "r2": float(r2), "r2_so_pib_populacao": float(r2_sem_uf), "n_municipios": int(ok.sum()),
    "ano_pib": int(ano_pib), "ano_populacao_modelo": 2022, "periodo_referencia": periodo_ref,
    "treinado_em": datetime.now(timezone.utc).isoformat(),
}])
spark.createDataFrame(modelo).write.mode("overwrite").option("overwriteSchema", "true") \
    .saveAsTable(f"{CATALOG}.gold.dmm_ipne_modelo")

for t in ["dmm_municipio_resumo", "dmm_kpi_municipio_anual", "dmm_ipne_modelo"]:
    spark.sql(f"ALTER TABLE {CATALOG}.gold.{t} SET TAGS ('autor' = 'dmm')")

# COMMAND ----------

display(spark.sql(f"""
SELECT nom_municipio, sig_uf, qtd_instalacoes, round(qtd_esperada) esperado,
       round(diferenca_pct * 100, 1) dif_pct, ipne
FROM {CATALOG}.gold.dmm_municipio_resumo
WHERE populacao > 100000 ORDER BY ipne DESC LIMIT 20
"""))
