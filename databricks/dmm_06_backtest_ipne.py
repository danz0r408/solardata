# Databricks notebook source
# MAGIC %md
# MAGIC # dmm_06 - Backtest do IPNE: a nota de 2023 antecipou o crescimento de 2024-2025?
# MAGIC
# MAGIC Pergunta da banca: "a nota acerta?". O teste refaz o IPNE v3 como se estivessemos no fim de 2023
# MAGIC (mesmas variaveis e mesmo metodo, mas com as instalacoes acumuladas ate 2023) e compara a nota daquele
# MAGIC momento com o que aconteceu depois: novas instalacoes em 2024 e 2025 (os dois ultimos anos completos).
# MAGIC
# MAGIC Se o indice mede espaco real, os municipios com nota alta em 2023 devem crescer mais, em proporcao ao
# MAGIC que ja tinham, do que os de nota baixa. O resultado e reportado seja ele bom ou ruim.
# MAGIC
# MAGIC Ressalvas: (1) a data da instalacao e a data de atualizacao cadastral da ANEEL, uma aproximacao da
# MAGIC conexao; (2) as variaveis explicativas sao de 2022-2023 (Censo e PIB) nos dois momentos.
# MAGIC
# MAGIC So le tabelas gold e devolve as metricas: NAO grava nada.

# COMMAND ----------

import json
import numpy as np
import pandas as pd

CATALOG = "`pi-6`"
ANO_CORTE = 2023
ANOS_DEPOIS = (2024, 2025)

base = spark.sql(f"SELECT * FROM {CATALOG}.gold.dmm_municipio_resumo").toPandas()
anual = spark.sql(f"""
SELECT cod_municipio_ibge,
       max(CASE WHEN ano <= {ANO_CORTE} THEN qtd_acumulada END) AS inst_corte,
       sum(CASE WHEN ano IN {ANOS_DEPOIS} THEN qtd_novas ELSE 0 END) AS novas_depois
FROM {CATALOG}.gold.dmm_kpi_municipio_anual GROUP BY cod_municipio_ibge
""").toPandas()
d = base.merge(anual, on="cod_municipio_ibge", how="left")
d["inst_corte"] = d["inst_corte"].fillna(0)
d["novas_depois"] = d["novas_depois"].fillna(0)

ok = (d["pib_mil_reais"].gt(0) & d["populacao_censo2022"].gt(0) & d["densidade_hab_km2"].gt(0)
      & d["renda_pc_media_reais"].gt(0) & d["qtd_domicilios"].gt(0) & d["irradiacao_kwh_m2_dia"].gt(0)
      & d["pct_apartamento"].notna() & d["sig_uf"].ne("DF"))
m = d[ok].reset_index(drop=True)

# COMMAND ----------

def matriz(m):
    log_dens = np.log(m["densidade_hab_km2"].to_numpy())
    termos = [np.log(m["pib_mil_reais"]), np.log(m["populacao_censo2022"]), log_dens, log_dens ** 2,
              np.log(m["renda_pc_media_reais"]), np.log(m["irradiacao_kwh_m2_dia"]),
              np.log(m["qtd_domicilios"] / m["populacao_censo2022"]), m["pct_apartamento"] / 100]
    uf = pd.get_dummies(m["sig_uf"], drop_first=True, dtype=float).to_numpy()
    return np.column_stack([np.ones(len(m))] + [np.asarray(t, dtype=float) for t in termos] + [uf])

X = matriz(m)
y = np.log1p(m["inst_corte"].to_numpy())
coef, *_ = np.linalg.lstsq(X, y, rcond=None)
residuo = y - X @ coef
m["nota_2023"] = pd.Series(-residuo).rank(pct=True).mul(100).to_numpy()
m["esperado_2023"] = np.expm1(X @ coef)
m["espaco_2023"] = (m["esperado_2023"] - m["inst_corte"]).clip(lower=0)
r2 = 1 - (residuo ** 2).sum() / ((y - y.mean()) ** 2).sum()

# Crescimento relativo: novas em 2024-2025 em relacao ao que ja havia em 2023 (log para nao explodir nos pequenos)
m["cresc_log"] = np.log1p(m["inst_corte"] + m["novas_depois"]) - np.log1p(m["inst_corte"])
m["novas_por_mil_dom"] = m["novas_depois"] / m["qtd_domicilios"] * 1000

def spearman(a, b):
    return float(pd.Series(a).rank().corr(pd.Series(b).rank()))

# Quintis da nota de 2023: crescimento mediano de cada grupo
m["quintil"] = pd.qcut(m["nota_2023"], 5, labels=["1 (nota baixa)", "2", "3", "4", "5 (nota alta)"])
quintis = (m.groupby("quintil", observed=True)
            .agg(municipios=("nota_2023", "size"),
                 crescimento_mediano_pct=("cresc_log", lambda s: float(np.expm1(s.median()) * 100)),
                 novas_por_mil_dom_mediana=("novas_por_mil_dom", "median"))
            .round(1).reset_index().astype({"quintil": str}).to_dict("records"))

# Os clientes em potencial de 2023 viraram instalacoes? Fracao do espaco ocupada em 2 anos, por quintil
m["ocupacao_espaco"] = np.where(m["espaco_2023"] > 0, np.minimum(m["novas_depois"] / m["espaco_2023"], 5), np.nan)

# Comparacao com regras ingenuas: so renda e so "poucas instalacoes por domicilio"
ingenuo_renda = spearman(m["renda_pc_media_reais"], m["cresc_log"])
inst_por_dom_2023 = m["inst_corte"] / m["qtd_domicilios"]
ingenuo_pouca_adocao = spearman(-inst_por_dom_2023, m["cresc_log"])

# Mesmo teste so com municipios acima de 50 mil hab. (o porte padrao do ranking do app)
g = m[m["populacao"] >= 50_000]

resultado = {
    "municipios": int(len(m)),
    "r2_modelo_2023": round(float(r2), 3),
    "spearman_nota_vs_crescimento": round(spearman(m["nota_2023"], m["cresc_log"]), 3),
    "spearman_nota_vs_novas_por_mil_dom": round(spearman(m["nota_2023"], m["novas_por_mil_dom"]), 3),
    "spearman_nota_vs_crescimento_50mil": round(spearman(g["nota_2023"], g["cresc_log"]), 3),
    "municipios_50mil": int(len(g)),
    "spearman_ingenuo_renda": round(ingenuo_renda, 3),
    "spearman_ingenuo_pouca_adocao": round(ingenuo_pouca_adocao, 3),
    "quintis": quintis,
    "ocupacao_mediana_do_espaco_2023_pct": round(float(np.nanmedian(m["ocupacao_espaco"]) * 100), 1),
    "correlacao_nota_2023_x_nota_atual": round(spearman(m["nota_2023"], m["ipne"]), 3),
}
print(json.dumps(resultado, ensure_ascii=False, indent=1))
dbutils.notebook.exit(json.dumps(resultado, ensure_ascii=False))
