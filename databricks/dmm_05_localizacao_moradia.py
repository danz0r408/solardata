# Databricks notebook source
# MAGIC %md
# MAGIC # dmm_05 - Localizacao dos municipios e proporcao de apartamentos (IBGE)
# MAGIC
# MAGIC Duas fontes publicas do IBGE, usadas pelo app e pelo IPNE v3:
# MAGIC
# MAGIC 1. **Centroide de cada municipio** (API de Malhas v3, metadados): latitude e longitude do centro geometrico
# MAGIC    do territorio. Usado para o filtro "oportunidades num raio de X km a partir da sua base".
# MAGIC    Ressalva: e o centro do territorio, nao a sede; em municipios muito extensos (Norte) pode ficar
# MAGIC    dezenas de km da cidade. Para um raio de 50 a 200 km, a aproximacao basta.
# MAGIC 2. **Proporcao de domicilios do tipo apartamento** (Censo 2022, SIDRA tabela 6326, variavel 1000381,
# MAGIC    categoria 3247 da classificacao 125). Apartamento nao tem telhado proprio: mede a verticalizacao
# MAGIC    melhor que a densidade.
# MAGIC
# MAGIC Gera (sem alterar tabelas de outros autores):
# MAGIC - `pi-6`.bronze.dmm_ibge_centroide_municipio / `pi-6`.silver.dmm_centroide_municipio
# MAGIC - `pi-6`.bronze.dmm_ibge_apartamento_municipio / `pi-6`.silver.dmm_apartamento_municipio
# MAGIC
# MAGIC Fontes:
# MAGIC - https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR/metadados?intrarregiao=municipio
# MAGIC - https://apisidra.ibge.gov.br/values/t/6326/n6/all/v/1000381/p/2022/c125/3247

# COMMAND ----------

import json
import requests
from datetime import datetime, timezone
from pyspark.sql import functions as F

CATALOG = "`pi-6`"
URL_CENTROIDE = "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR/metadados?intrarregiao=municipio"
URL_APARTAMENTO = "https://apisidra.ibge.gov.br/values/t/6326/n6/all/v/1000381/p/2022/c125/3247"
ingestao = datetime.now(timezone.utc).isoformat()

# COMMAND ----------

# Centroides: bronze guarda o JSON de cada municipio como veio
resp = requests.get(URL_CENTROIDE, timeout=180)
resp.raise_for_status()
itens = resp.json()
print("municipios recebidos:", len(itens))
assert len(itens) > 5500, "IBGE devolveu menos municipios que o esperado"

spark.createDataFrame(
    [(i["id"], json.dumps(i, ensure_ascii=False), "IBGE API Malhas v3 (metadados, centroide)", ingestao) for i in itens],
    "cod_municipio_ibge string, json string, fonte string, data_ingestao string",
).write.mode("overwrite").saveAsTable(f"{CATALOG}.bronze.dmm_ibge_centroide_municipio")

(
    spark.table(f"{CATALOG}.bronze.dmm_ibge_centroide_municipio")
    .select(
        F.col("cod_municipio_ibge").cast("int").alias("cod_municipio_ibge"),
        F.get_json_object("json", "$.centroide.latitude").cast("double").alias("latitude"),
        F.get_json_object("json", "$.centroide.longitude").cast("double").alias("longitude"),
        F.get_json_object("json", "$.area.dimensao").cast("double").alias("area_km2"),
    )
    .where("cod_municipio_ibge is not null")
    # o Brasil fica entre ~-34 e ~6 de latitude e ~-74 e ~-28 de longitude
    .where("latitude between -34.5 and 6 and longitude between -74.5 and -28")
    .write.mode("overwrite").saveAsTable(f"{CATALOG}.silver.dmm_centroide_municipio")
)

# COMMAND ----------

# Apartamentos (% dos domicilios particulares permanentes ocupados, Censo 2022)
resp = requests.get(URL_APARTAMENTO, timeout=180)
resp.raise_for_status()
linhas = resp.json()[1:]  # a primeira linha do SIDRA e o cabecalho
print("municipios recebidos:", len(linhas))
assert len(linhas) > 5500, "SIDRA devolveu menos municipios que o esperado"

spark.createDataFrame(
    [(l["D1C"], l["D1N"], l["D3N"], l["V"], l["MN"], "IBGE/SIDRA 6326 v1000381 c125/3247 (Censo 2022)", ingestao)
     for l in linhas],
    "cod_municipio_ibge string, nom_municipio_uf string, ano string, pct_apartamento string, unidade string, fonte string, data_ingestao string",
).write.mode("overwrite").saveAsTable(f"{CATALOG}.bronze.dmm_ibge_apartamento_municipio")

# "-" no SIDRA = zero absoluto (nenhum apartamento); "..." e "X" = sem dado
(
    spark.table(f"{CATALOG}.bronze.dmm_ibge_apartamento_municipio")
    .select(
        F.col("cod_municipio_ibge").cast("int").alias("cod_municipio_ibge"),
        F.col("ano").cast("int").alias("ano"),
        F.when(F.col("pct_apartamento") == "-", F.lit(0.0))
         .otherwise(F.expr("try_cast(pct_apartamento as double)")).alias("pct_apartamento"),
    )
    .where("cod_municipio_ibge is not null")
    .write.mode("overwrite").saveAsTable(f"{CATALOG}.silver.dmm_apartamento_municipio")
)

for t in ["bronze.dmm_ibge_centroide_municipio", "silver.dmm_centroide_municipio",
          "bronze.dmm_ibge_apartamento_municipio", "silver.dmm_apartamento_municipio"]:
    spark.sql(f"ALTER TABLE {CATALOG}.{t} SET TAGS ('autor' = 'dmm')")

# COMMAND ----------

resumo = spark.sql(f"""
SELECT
  (SELECT count(*) FROM {CATALOG}.silver.dmm_centroide_municipio) AS municipios_com_centroide,
  (SELECT count(pct_apartamento) FROM {CATALOG}.silver.dmm_apartamento_municipio) AS municipios_com_apartamento,
  (SELECT round(avg(pct_apartamento), 2) FROM {CATALOG}.silver.dmm_apartamento_municipio) AS pct_apartamento_medio
""").first().asDict()
print(resumo)
dbutils.notebook.exit(json.dumps(resumo))
