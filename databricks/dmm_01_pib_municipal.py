# Databricks notebook source
# MAGIC %md
# MAGIC # dmm_01 - PIB municipal (IBGE/SIDRA tabela 5938)
# MAGIC
# MAGIC Ingere o PIB a precos correntes (variavel 37, em mil reais) de todos os municipios
# MAGIC para o ano mais recente publicado pelo IBGE.
# MAGIC
# MAGIC Gera (sem alterar nenhuma tabela existente):
# MAGIC - `pi-6`.bronze.dmm_ibge_pib_municipio - resposta bruta do SIDRA, tudo string
# MAGIC - `pi-6`.silver.dmm_pib_municipio - tipado: cod_municipio_ibge, ano, pib_mil_reais
# MAGIC
# MAGIC Fonte: https://apisidra.ibge.gov.br/values/t/5938/n6/all/v/37/p/last%201

# COMMAND ----------

import requests
from datetime import datetime, timezone
from pyspark.sql import functions as F

CATALOG = "`pi-6`"
URL = "https://apisidra.ibge.gov.br/values/t/5938/n6/all/v/37/p/last%201"

resp = requests.get(URL, timeout=120)
resp.raise_for_status()
linhas = resp.json()[1:]  # a primeira linha do SIDRA e o cabecalho
print("municipios recebidos:", len(linhas))
assert len(linhas) > 5500, "SIDRA devolveu menos municipios que o esperado"

# COMMAND ----------

ingestao = datetime.now(timezone.utc).isoformat()
bronze = spark.createDataFrame(
    [
        (l["D1C"], l["D1N"], l["D3N"], l["V"], l["MN"], "IBGE/SIDRA 5938 v37", ingestao)
        for l in linhas
    ],
    "cod_municipio_ibge string, nom_municipio_uf string, ano string, pib string, unidade string, fonte string, data_ingestao string",
)
bronze.write.mode("overwrite").saveAsTable(f"{CATALOG}.bronze.dmm_ibge_pib_municipio")

# COMMAND ----------

# Valores nao numericos do SIDRA ("-", "...", "X") viram nulo
silver = (
    spark.table(f"{CATALOG}.bronze.dmm_ibge_pib_municipio")
    .select(
        F.col("cod_municipio_ibge").cast("int").alias("cod_municipio_ibge"),
        F.col("ano").cast("int").alias("ano"),
        F.expr("try_cast(pib as bigint)").alias("pib_mil_reais"),
    )
    .where("cod_municipio_ibge is not null")
)
silver.write.mode("overwrite").saveAsTable(f"{CATALOG}.silver.dmm_pib_municipio")

for t in ["bronze.dmm_ibge_pib_municipio", "silver.dmm_pib_municipio"]:
    spark.sql(f"ALTER TABLE {CATALOG}.{t} SET TAGS ('autor' = 'dmm')")

display(spark.sql(f"""
    SELECT ano, count(*) municipios, count(pib_mil_reais) com_pib, sum(pib_mil_reais) pib_total_mil_reais
    FROM {CATALOG}.silver.dmm_pib_municipio GROUP BY ano
"""))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Densidade demografica (Censo 2022, SIDRA tabela 4714, variavel 614)
# MAGIC
# MAGIC Usada no IPNE como proxy de verticalizacao: cidades densas tem mais apartamentos
# MAGIC e menos telhado proprio, o que limita a GD residencial independente de renda.
# MAGIC
# MAGIC Gera `pi-6`.bronze.dmm_ibge_densidade_municipio e `pi-6`.silver.dmm_densidade_municipio.

# COMMAND ----------

URL_DENSIDADE = "https://apisidra.ibge.gov.br/values/t/4714/n6/all/v/614/p/2022"
resp = requests.get(URL_DENSIDADE, timeout=120)
resp.raise_for_status()
linhas = resp.json()[1:]
print("municipios recebidos:", len(linhas))
assert len(linhas) > 5500, "SIDRA devolveu menos municipios que o esperado"

spark.createDataFrame(
    [(l["D1C"], l["D1N"], l["D3N"], l["V"], l["MN"], "IBGE/SIDRA 4714 v614 (Censo 2022)", ingestao) for l in linhas],
    "cod_municipio_ibge string, nom_municipio_uf string, ano string, densidade string, unidade string, fonte string, data_ingestao string",
).write.mode("overwrite").saveAsTable(f"{CATALOG}.bronze.dmm_ibge_densidade_municipio")

(
    spark.table(f"{CATALOG}.bronze.dmm_ibge_densidade_municipio")
    .select(
        F.col("cod_municipio_ibge").cast("int").alias("cod_municipio_ibge"),
        F.col("ano").cast("int").alias("ano"),
        F.expr("try_cast(densidade as double)").alias("densidade_hab_km2"),
    )
    .where("cod_municipio_ibge is not null")
    .write.mode("overwrite").saveAsTable(f"{CATALOG}.silver.dmm_densidade_municipio")
)

for t in ["bronze.dmm_ibge_densidade_municipio", "silver.dmm_densidade_municipio"]:
    spark.sql(f"ALTER TABLE {CATALOG}.{t} SET TAGS ('autor' = 'dmm')")
