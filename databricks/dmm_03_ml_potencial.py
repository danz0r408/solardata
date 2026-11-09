# Databricks notebook source
# MAGIC %md
# MAGIC # dmm_03 - Potencia solar esperada por Machine Learning (v2 do modelo do Gustavo)
# MAGIC
# MAGIC Parte do modelo do Gustavo (`gold.dmm_ml_potencial_municipio`): Random Forest que estima a potencia
# MAGIC instalada (MW) de cada municipio pelas suas caracteristicas, com previsoes fora da amostra
# MAGIC (validacao cruzada de 5 dobras). Mesmas variaveis: populacao, PIB per capita, densidade, domicilios,
# MAGIC renda per capita, empresas, irradiacao e UF.
# MAGIC
# MAGIC **Problema corrigido:** com o alvo em MW, o modelo "puxa" todos os municipios para a media.
# MAGIC Pequenos saem quase sempre "abaixo do esperado" e grandes quase sempre "acima" (91% dos acima de 150 MW),
# MAGIC entao a classificacao reflete o tamanho do municipio, nao a oportunidade.
# MAGIC
# MAGIC **Correcao:** alvo em log, `log(1 + MW)`, e escolha do modelo por metricas que nao sao dominadas pelas
# MAGIC grandes cidades (R2 em log e equilibrio da classificacao por faixa de tamanho).
# MAGIC
# MAGIC Modo `MODO = "comparar"`: so mede as configuracoes e devolve as metricas (nao grava nada).
# MAGIC Modo `MODO = "publicar"`: grava `gold.dmm_ml_potencial_v2` com a configuracao escolhida.
# MAGIC Nao altera a tabela do Gustavo.

# COMMAND ----------

dbutils.widgets.text("modo", "comparar")
dbutils.widgets.text("config", "hgb_log")
MODO = dbutils.widgets.get("modo")
CONFIG_ESCOLHIDA = dbutils.widgets.get("config")

import json
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.model_selection import KFold, cross_val_predict

CATALOG = "`pi-6`"
SEMENTE = 42

df = spark.sql(f"""
SELECT r.cod_municipio_ibge, r.nom_municipio, r.sig_uf, r.potencia_kw / 1000 AS potencia_mw,
       r.populacao_censo2022, r.pib_per_capita_reais, r.densidade_hab_km2, r.qtd_domicilios,
       r.renda_pc_media_reais, e.empresas_organizacoes, r.irradiacao_kwh_m2_dia,
       r.diferenca_pct AS ipne_diferenca_pct
FROM {CATALOG}.gold.dmm_municipio_resumo r
LEFT JOIN {CATALOG}.silver.ibge_empresas_2022 e USING (cod_municipio_ibge)
""").toPandas()

VARIAVEIS = ["populacao_censo2022", "pib_per_capita_reais", "densidade_hab_km2", "qtd_domicilios",
             "renda_pc_media_reais", "empresas_organizacoes", "irradiacao_kwh_m2_dia"]
ok = df[VARIAVEIS].notna().all(axis=1)
dados = df[ok].reset_index(drop=True)
X = pd.concat([dados[VARIAVEIS].astype(float), pd.get_dummies(dados["sig_uf"], prefix="uf", dtype=float)], axis=1)
y_mw = dados["potencia_mw"].to_numpy()
y_log = np.log1p(y_mw)
print(len(dados), "municipios com todas as variaveis de", len(df))

# COMMAND ----------

def rf():
    return RandomForestRegressor(n_estimators=400, min_samples_leaf=3, n_jobs=-1, random_state=SEMENTE)

def hgb():
    return HistGradientBoostingRegressor(max_iter=600, learning_rate=0.04, min_samples_leaf=20,
                                         l2_regularization=1.0, random_state=SEMENTE)

# nome -> (modelo, alvo em log?)
CONFIGS = {
    "rf_mw": (rf, False),     # reproducao do modelo "Original" do Gustavo
    "rf_log": (rf, True),
    "hgb_log": (hgb, True),
}
dobras = KFold(n_splits=5, shuffle=True, random_state=SEMENTE)

def previsao_fora_da_amostra(nome):
    fabrica, em_log = CONFIGS[nome]
    alvo = y_log if em_log else y_mw
    p = cross_val_predict(fabrica(), X, alvo, cv=dobras, n_jobs=1)
    # alvo em log: expm1 devolve a mediana condicional, que e o que queremos para "acima/abaixo"
    return np.clip(np.expm1(p) if em_log else p, 0, None)

# Faixas de POPULACAO, nao de potencia real: agrupar pelo proprio resultado cria o padrao
# "grandes acima, pequenos abaixo" mesmo num modelo sem vies (regressao a media).
FAIXAS = [(0, 1e4, "<10 mil hab"), (1e4, 5e4, "10-50 mil"), (5e4, 2e5, "50-200 mil"),
          (2e5, 1e6, "200 mil-1 mi"), (1e6, 1e9, "1 mi+")]
populacao = dados["populacao_censo2022"].to_numpy()

def equilibrio(acima):
    """% de municipios 'acima do esperado' por faixa de populacao. Sem vies de porte: perto de 50% em todas."""
    return {rot: {"n": int(((populacao >= lo) & (populacao < hi)).sum()),
                  "pct_acima": round(float(acima[(populacao >= lo) & (populacao < hi)].mean() * 100), 1)}
            for lo, hi, rot in FAIXAS}

def metricas(esperado):
    r2 = lambda a, b: 1 - ((a - b) ** 2).sum() / ((a - a.mean()) ** 2).sum()
    por_faixa = equilibrio(y_mw > esperado)
    pcts = [v["pct_acima"] for v in por_faixa.values()]
    dif = y_mw / np.maximum(esperado, 1e-3) - 1
    concorda = float(np.mean((dif < 0) == (dados["ipne_diferenca_pct"].to_numpy() < 0)) * 100)
    return {
        "r2_mw": round(float(r2(y_mw, esperado)), 3),
        "r2_log": round(float(r2(y_log, np.log1p(esperado))), 3),
        "mae_mw": round(float(np.abs(y_mw - esperado).mean()), 2),
        "wape": round(float(np.abs(y_mw - esperado).sum() / y_mw.sum()), 3),
        "amplitude_pct_acima": round(max(pcts) - min(pcts), 1),
        "concorda_ipne_pct": round(concorda, 1),
        "faixas": por_faixa,
    }

def exemplos(esperado):
    nomes = {3550308: "Sao Paulo", 3547809: "Santo Andre", 3524709: "Jaguariuna", 3509502: "Campinas", 2611101: "Petrolina"}
    out = {}
    for cod, n in nomes.items():
        i = np.flatnonzero(dados["cod_municipio_ibge"].to_numpy() == cod)
        if len(i):
            out[n] = {"real": round(float(y_mw[i[0]]), 1), "esperado": round(float(esperado[i[0]]), 1)}
    return out

# COMMAND ----------

if MODO == "comparar":
    # referencias: o IPNE e o modelo publicado pelo Gustavo, medidos do mesmo jeito
    ipne = dados["ipne_diferenca_pct"].to_numpy()
    tem_ipne = ~np.isnan(ipne)
    ref_ipne = equilibrio(np.where(tem_ipne, ipne > 0, False))
    gus = spark.table(f"{CATALOG}.gold.dmm_ml_potencial_municipio").select(
        "cod_municipio_ibge", "potencia_esperada_ml_mw").toPandas()
    esp_gus = dados[["cod_municipio_ibge"]].merge(gus, how="left", on="cod_municipio_ibge")["potencia_esperada_ml_mw"].to_numpy()
    resultado = {"ipne_v2 (referencia)": {"faixas": ref_ipne},
                 "gustavo_publicado": {**metricas(np.nan_to_num(esp_gus)), "exemplos": exemplos(np.nan_to_num(esp_gus))}}
    for nome in CONFIGS:
        esp = previsao_fora_da_amostra(nome)
        resultado[nome] = {**metricas(esp), "exemplos": exemplos(esp)}
        print(nome, json.dumps(resultado[nome], ensure_ascii=False))
    dbutils.notebook.exit(json.dumps(resultado))

# COMMAND ----------

# MODO == "publicar": grava a configuracao escolhida, no mesmo formato da tabela do Gustavo + metricas
esperado = previsao_fora_da_amostra(CONFIG_ESCOLHIDA)
m = metricas(esperado)
saida = dados[["cod_municipio_ibge", "nom_municipio", "sig_uf"]].copy()
saida["potencia_instalada_mw"] = y_mw.round(3)
saida["potencia_esperada_ml_mw"] = esperado.round(3)
# mesma convencao do Gustavo: positivo = espaco para crescer (esperado acima do instalado)
saida["diferenca_mw"] = (esperado - y_mw).round(3)
saida["real_sobre_esperado_pct"] = ((y_mw / np.maximum(esperado, 1e-3) - 1) * 100).round(1)
saida["situacao_ml"] = np.where(y_mw < esperado, "Abaixo do esperado", "Acima do esperado")
saida["algoritmo_ml"] = {"rf_mw": "Random Forest", "rf_log": "Random Forest", "hgb_log": "Gradient Boosting"}[CONFIG_ESCOLHIDA]
saida["modelo_ml"] = CONFIG_ESCOLHIDA
saida["metodologia_previsao"] = "Fora da amostra: validacao cruzada 5 dobras (cross_val_predict)"
saida["r2_log"], saida["r2_mw"], saida["wape"] = m["r2_log"], m["r2_mw"], m["wape"]
saida["treinado_em"] = datetime.now(timezone.utc).isoformat()

spark.createDataFrame(saida).write.mode("overwrite").option("overwriteSchema", "true") \
    .saveAsTable(f"{CATALOG}.gold.dmm_ml_potencial_v2")
spark.sql(f"ALTER TABLE {CATALOG}.gold.dmm_ml_potencial_v2 SET TAGS ('autor' = 'dmm')")
dbutils.notebook.exit(json.dumps({"publicado": CONFIG_ESCOLHIDA, **m}))
