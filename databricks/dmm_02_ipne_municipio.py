# Databricks notebook source
# MAGIC %md
# MAGIC # dmm_02 - KPIs por municipio e IPNE (v2)
# MAGIC
# MAGIC **IPNE - Indice de Potencial Nao Explorado.** Estima quantas instalacoes solares cada
# MAGIC municipio "deveria" ter pelo seu perfil, e compara com o observado.
# MAGIC
# MAGIC Modelo: regressao linear em log, ajustada com todos os municipios
# MAGIC
# MAGIC     log(1 + instalacoes) = b0 + b1*log(PIB) + b2*log(populacao) + b3*log(dens) + b4*log(dens)^2
# MAGIC                            + b5*log(renda domiciliar pc) + b6*log(irradiacao) + b7*log(domicilios/hab) + efeito_UF
# MAGIC
# MAGIC - Efeito fixo por UF: cada municipio e comparado com os do proprio estado (absorve tarifa e distribuidora).
# MAGIC - Densidade em U invertido: municipios muito esparsos (rurais) e muito densos (verticalizados) adotam menos.
# MAGIC - Renda domiciliar (v2): separa renda das familias de PIB industrial/portuario (ex.: Cubatao, Paranagua).
# MAGIC - Irradiacao (v2): diferenca de sol dentro do estado.
# MAGIC - Domicilios por habitante (v2): mais domicilios por pessoa = mais telhados potenciais.
# MAGIC - O DF (municipio unico) fica sem IPNE.
# MAGIC
# MAGIC - `esperado = exp(previsto) - 1`
# MAGIC - `diferenca_pct = real / esperado - 1` (negativo = abaixo do esperado)
# MAGIC - `ipne` = percentil (0-100) do residuo invertido: 100 = mais abaixo do esperado
# MAGIC
# MAGIC Ressalva: e um proxy de oportunidade, nao medida de demanda nem previsao de vendas.
# MAGIC
# MAGIC Fontes: ANEEL (fato_empreendimentos, fonte_id 7 e 8); IBGE PIB 2023 (SIDRA 5938), Censo 2022
# MAGIC (populacao, densidade, domicilios, renda domiciliar per capita); INPE Atlas Solar 2017 (irradiacao global
# MAGIC horizontal, Wh/m2.dia convertido para kWh). Renda, domicilios e irradiacao vem das tabelas silver
# MAGIC ingeridas pelo Gustavo (`silver.ibge_*_2022`, `silver.inpe_solar_consolidado_2017`).
# MAGIC Municipios sem correspondencia no INPE recebem a media da UF (`irradiacao_estimada = true`).
# MAGIC
# MAGIC Gera (sem alterar tabelas de outros autores): `gold.dmm_municipio_resumo`, `gold.dmm_kpi_municipio_anual`,
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
),
irr AS (
  SELECT cod_municipio_ibge, irradiacao_horizontal_kwh_m2_dia_provisoria AS irradiacao_kwh_m2_dia
  FROM {CATALOG}.silver.inpe_solar_consolidado_2017 WHERE status_correspondencia = 'IDENTIFICADO'
)
SELECT l.cod_municipio_ibge, l.nom_municipio, l.sig_uf, l.nom_regiao,
       coalesce(e.qtd_instalacoes, 0) AS qtd_instalacoes,
       coalesce(e.potencia_kw, 0) AS potencia_kw,
       coalesce(e.qtd_uc_credito, 0) AS qtd_uc_credito,
       coalesce(n.qtd_novas_ultimo_ano, 0) AS qtd_novas_ultimo_ano,
       coalesce(n.qtd_novas_ano_anterior, 0) AS qtd_novas_ano_anterior,
       p.populacao, c.populacao_censo2022, b.pib_mil_reais, d.densidade_hab_km2,
       r.renda_pc_media_reais, dom.qtd_domicilios, i.irradiacao_kwh_m2_dia
FROM {CATALOG}.gold.dim_local l
LEFT JOIN estoque e USING (cod_municipio_ibge)
LEFT JOIN novas n USING (cod_municipio_ibge)
LEFT JOIN pop p USING (cod_municipio_ibge)
LEFT JOIN censo c USING (cod_municipio_ibge)
LEFT JOIN {CATALOG}.silver.dmm_pib_municipio b USING (cod_municipio_ibge)
LEFT JOIN {CATALOG}.silver.dmm_densidade_municipio d USING (cod_municipio_ibge)
LEFT JOIN {CATALOG}.silver.ibge_renda_domiciliar_2022 r USING (cod_municipio_ibge)
LEFT JOIN {CATALOG}.silver.ibge_domicilios_codificados_2022 dom USING (cod_municipio_ibge)
LEFT JOIN irr i USING (cod_municipio_ibge)
""").toPandas()

# Sem correspondencia no INPE: media da UF, marcada como estimada
base["irradiacao_estimada"] = base["irradiacao_kwh_m2_dia"].isna()
base["irradiacao_kwh_m2_dia"] = base["irradiacao_kwh_m2_dia"].fillna(
    base.groupby("sig_uf")["irradiacao_kwh_m2_dia"].transform("mean")
)
print(len(base), "municipios | pop", ano_pop, "| pib", ano_pib, "| referencia", periodo_ref,
      "| irradiacao estimada:", int(base["irradiacao_estimada"].sum()))

# COMMAND ----------

# Ajuste do modelo (5.5 mil linhas: pandas/numpy basta)
ok = (
    base["pib_mil_reais"].gt(0) & base["populacao_censo2022"].gt(0) & base["densidade_hab_km2"].gt(0)
    & base["renda_pc_media_reais"].gt(0) & base["qtd_domicilios"].gt(0) & base["irradiacao_kwh_m2_dia"].gt(0)
    & base["sig_uf"].ne("DF")  # municipio unico: com efeito de UF seria comparado consigo mesmo
)
m = base[ok]
y = np.log1p(m["qtd_instalacoes"].to_numpy())
log_dens = np.log(m["densidade_hab_km2"].to_numpy())

TERMOS = {
    "log_pib": np.log(m["pib_mil_reais"]),
    "log_populacao": np.log(m["populacao_censo2022"]),
    "log_densidade": log_dens,
    "log_densidade_2": log_dens ** 2,
    "log_renda_pc": np.log(m["renda_pc_media_reais"]),
    "log_irradiacao": np.log(m["irradiacao_kwh_m2_dia"]),
    "log_domicilios_por_hab": np.log(m["qtd_domicilios"] / m["populacao_censo2022"]),
}
X_uf = pd.get_dummies(m["sig_uf"], drop_first=True, dtype=float).to_numpy()
X = np.column_stack([np.ones(len(m))] + [np.asarray(v, dtype=float) for v in TERMOS.values()] + [X_uf])
X_v1 = np.column_stack([np.ones(len(m))] + [np.asarray(TERMOS[k], dtype=float) for k in list(TERMOS)[:4]] + [X_uf])

def r2_de(residuo):
    return 1 - (residuo ** 2).sum() / ((y - y.mean()) ** 2).sum()

def ajusta(X):
    coef, *_ = np.linalg.lstsq(X, y, rcond=None)
    return coef, y - X @ coef

def r2_validacao_cruzada(X, dobras=5, semente=42):
    """R2 fora da amostra: cada municipio e previsto por um modelo que nao o viu."""
    idx = np.random.default_rng(semente).permutation(len(y))
    sse = 0.0
    for k in range(dobras):
        teste = idx[k::dobras]
        treino = np.setdiff1d(idx, teste)
        c, *_ = np.linalg.lstsq(X[treino], y[treino], rcond=None)
        sse += ((y[teste] - X[teste] @ c) ** 2).sum()
    return 1 - sse / ((y - y.mean()) ** 2).sum()

coef, residuo = ajusta(X)
r2, r2_cv = r2_de(residuo), r2_validacao_cruzada(X)
r2_v1 = r2_de(ajusta(X_v1)[1])
print(f"R2 v1 = {r2_v1:.3f} | R2 v2 = {r2:.3f} | R2 v2 validacao cruzada 5 dobras = {r2_cv:.3f}")
print({k: round(float(c), 3) for k, c in zip(TERMOS, coef[1:])})

base.loc[ok, "qtd_esperada"] = np.expm1(y - residuo)
base.loc[ok, "residuo_log"] = residuo
base["diferenca_pct"] = base["qtd_instalacoes"] / base["qtd_esperada"] - 1
base["ipne"] = (-base["residuo_log"]).rank(pct=True).mul(100).round(0)

# COMMAND ----------

base["inst_por_mil_hab"] = base["qtd_instalacoes"] / base["populacao"] * 1000
base["inst_por_mil_domicilios"] = base["qtd_instalacoes"] / base["qtd_domicilios"] * 1000
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

for c in ["potencia_kw", "qtd_esperada", "inst_por_mil_hab", "inst_por_mil_domicilios", "kw_por_hab",
          "pib_per_capita_reais", "renda_pc_media_reais"]:
    base[c] = base[c].round(2)
for c in ["diferenca_pct", "crescimento_ultimo_ano_pct", "residuo_log", "irradiacao_kwh_m2_dia"]:
    base[c] = base[c].round(4)

spark.createDataFrame(base).write.mode("overwrite").option("overwriteSchema", "true") \
    .saveAsTable(f"{CATALOG}.gold.dmm_municipio_resumo")

# COMMAND ----------

modelo = pd.DataFrame([{
    "modelo": "ipne_v2_ols_log_efeito_uf",
    "formula": "log(1+instalacoes) ~ " + " + ".join(TERMOS) + " + UF",
    "b0": float(coef[0]),
    **{f"b_{k}": float(c) for k, c in zip(TERMOS, coef[1:])},
    "r2": float(r2), "r2_validacao_cruzada": float(r2_cv), "r2_v1": float(r2_v1),
    "n_municipios": int(ok.sum()),
    "ano_pib": int(ano_pib), "ano_populacao_modelo": 2022, "ano_irradiacao": 2017,
    "periodo_referencia": periodo_ref,
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
WHERE populacao > 100000 ORDER BY rank_ipne LIMIT 20
"""))
