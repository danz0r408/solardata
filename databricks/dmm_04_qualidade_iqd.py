# Databricks notebook source
# MAGIC %md
# MAGIC # dmm_04 - Framework de Controle da Qualidade de Dados (IQD)
# MAGIC
# MAGIC Mede a qualidade de todas as tabelas publicadas que alimentam o app SolarData e grava o resultado em
# MAGIC `gold.dmm_qualidade_indicadores` (uma linha por tabela e medicao; o historico e mantido para
# MAGIC acompanhar a evolucao).
# MAGIC
# MAGIC **Dimensoes obrigatorias (entram no IQD, pesos iguais). Cada nulo e cobrado uma unica vez, na completude:**
# MAGIC - Completude: media, entre os campos criticos, do % de valores preenchidos (nao nulos e nao vazios).
# MAGIC   Nas tabelas por municipio entra tambem a cobertura: municipios distintos que existem na referencia
# MAGIC   (no ano mais recente, quando a tabela tem ano) / numero esperado de municipios (declarado).
# MAGIC   Chaves primarias, tecnicas e estrangeiras entram automaticamente como campos criticos.
# MAGIC - Integridade: entre os registros com chave estrangeira preenchida, % que encontra a referencia.
# MAGIC   Inclui reconciliacao de contagem entre camadas quando declarada. Sem relacionamento = "nao se aplica".
# MAGIC - Unicidade: entre os registros com chave preenchida, chaves distintas / registros. Toda tabela precisa
# MAGIC   ter a chave declarada; sem chave (ou com coluna inexistente) = 0%. Dimensoes medem tambem a chave
# MAGIC   tecnica (`*_id`) usada pela tabela fato, e vale a pior das duas.
# MAGIC
# MAGIC **Dimensao complementar (fora do IQD):**
# MAGIC - Validade: % de registros que passam em todas as regras de formato, tamanho e dominio da tabela.
# MAGIC   Valor nulo e aceito aqui; a ausencia so e cobrada (uma vez) nos campos criticos.
# MAGIC
# MAGIC **Faixas:** verde acima de 90%; amarelo de 80% a 90%; vermelho abaixo de 80%.
# MAGIC A cor e definida pelo pior caso: a dimensao recebe a faixa do seu pior campo, chave ou regra, e a tabela
# MAGIC recebe a faixa da sua pior dimensao obrigatoria. O IQD numerico continua sendo a media.
# MAGIC
# MAGIC **Falha estrutural nunca melhora a nota:** campo critico, FK ou coluna de regra inexistente conta 0%;
# MAGIC tabela vazia ou nao encontrada recebe 0% e faixa vermelha.
# MAGIC
# MAGIC Somente leitura sobre as tabelas medidas: nao altera, nao apaga e nao executa VACUUM.
# MAGIC A unica escrita e o INSERT em `gold.dmm_qualidade_indicadores`.

# COMMAND ----------

import json
from datetime import datetime, timezone

from pyspark.sql import Row

CATALOG = "`pi-6`"
DESTINO = f"{CATALOG}.gold.dmm_qualidade_indicadores"
REF_MUNICIPIO = ("silver.populacao_municipio", "cod_municipio_ibge")  # lista oficial de municipios do IBGE
# Numero esperado de municipios, declarado (revisar quando o IBGE instalar um municipio novo).
# 5.571 em 2026: inclui Boa Esperanca do Norte/MT. A propria referencia e conferida contra ele.
N_MUNICIPIOS = 5571
VERSAO_REGRAS = "2.1"

# Membros desconhecidos das dimensoes (linhas criadas para que registros sem a informacao nao sumam nas
# juncoes). Contam como preenchidos na completude; a fato tem regras de validade que medem quantos
# registros apontam para eles.
def _ids(sql):
    try:
        return [str(r[0]) for r in spark.sql(sql).collect()]
    except Exception:
        return []

DESCONHECIDOS = {
    "agente_id": _ids(f"SELECT agente_id FROM {CATALOG}.gold.dim_agente WHERE sig_agente IS NULL"),
    "fonte_id": _ids(f"SELECT fonte_id FROM {CATALOG}.gold.dim_fonte_geracao "
                     "WHERE sig_tipo_geracao IS NULL OR dsc_fonte_geracao IS NULL"),
    "tempo_id": _ids(f"SELECT tempo_id FROM {CATALOG}.gold.dim_tempo WHERE data = DATE'1900-01-01'"),
    "local_id": _ids(f"SELECT local_id FROM {CATALOG}.gold.dim_local "
                     "WHERE cod_municipio_ibge IS NULL OR nom_municipio IS NULL"),
}
SEM_DESCONHECIDO = [(f"{col} diferente do membro desconhecido", f"{col} NOT IN ({', '.join(ids)})")
                    for col, ids in DESCONHECIDOS.items() if ids]

UF_COD = {"11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
          "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
          "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS",
          "50": "MS", "51": "MT", "52": "GO", "53": "DF"}
LISTA_UFS = ", ".join(f"'{u}'" for u in UF_COD.values())
LISTA_COD_UF = ", ".join(f"'{c}'" for c in UF_COD)
_PREFIXO = "substr(cast(cod_municipio_ibge AS string), 1, 2)"
_UF_DO_CODIGO = "CASE " + " ".join(f"WHEN {_PREFIXO} = '{c}' THEN '{u}'" for c, u in UF_COD.items()) + " END"

# Regras de validade reutilizadas (expressao SQL verdadeira quando o valor e valido)
COD_MUN = ("cod_municipio_ibge com 7 digitos e prefixo de UF existente",
           f"cast(cod_municipio_ibge AS string) RLIKE '^[0-9]{{7}}$' AND {_PREFIXO} IN ({LISTA_COD_UF})")
UF_VALIDA = ("sig_uf entre as 27 UFs", f"sig_uf IN ({LISTA_UFS})")
UF_COERENTE = ("sig_uf coerente com o prefixo do codigo do municipio", f"sig_uf = {_UF_DO_CODIGO}")
CNPJ = ("cnpj_distribuidora com 12 caracteres alfanumericos + 2 digitos (formato numerico e alfanumerico)",
        "regexp_replace(upper(cnpj_distribuidora), '[^0-9A-Z]', '') RLIKE '^[0-9A-Z]{12}[0-9]{2}$'")
POTENCIA = ("potencia_instalada_kw maior que zero e ate 5.000 kW (limite da minigeracao, Lei 14.300/2022)",
            "potencia_instalada_kw > 0 AND potencia_instalada_kw <= 5000")
SEM_DATA_1900 = ("data_atualizacao_cadastral diferente de 1900-01-01",
                 "data_atualizacao_cadastral <> DATE'1900-01-01'")
DATA_PERIODO = ("data_atualizacao_cadastral entre 17/04/2012 (REN 482) e hoje",
                "data_atualizacao_cadastral = DATE'1900-01-01' OR "
                "data_atualizacao_cadastral BETWEEN DATE'2012-04-17' AND current_date()")
TIPO_CONSUMIDOR = ("sig_tipo_consumidor PF ou PJ", "sig_tipo_consumidor IN ('PF', 'PJ')")
TIPOS_GERACAO = ("sig_tipo_geracao no dominio da ANEEL (UFV, UTE, EOL, CGH)",
                 "sig_tipo_geracao IN ('UFV', 'UTE', 'EOL', 'CGH')")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Catalogo de regras por tabela
# MAGIC `pk` = chave de negocio; `pk_tecnica` = chave substituta usada pela fato (dimensoes);
# MAGIC `criticos` = campos cobrados na completude; `cobertura` = tabela com uma linha por municipio;
# MAGIC `fks` = (coluna, tabela, coluna de referencia); `reconcilia` = (descricao, tabela cuja contagem deve ser igual);
# MAGIC `validade` = (descricao, expressao SQL). `steward` segue o item 04 do documento de governanca.
# MAGIC Tabela nova so e medida depois de cadastrada aqui, no momento em que e publicada para o app.

# COMMAND ----------

TABELAS = [
    # Grupo 1 - ANEEL
    dict(tabela="silver.empreendimentos_geracao", grupo="ANEEL", steward="Breno",
         pk=["cod_empreendimento"],
         criticos=["cod_empreendimento", "cod_municipio_ibge", "sig_agente", "sig_tipo_geracao",
                   "cnpj_distribuidora", "dsc_classe_consumo", "potencia_instalada_kw", "data_atualizacao_cadastral"],
         fks=[("cod_municipio_ibge", *REF_MUNICIPIO)],
         validade=[COD_MUN, UF_VALIDA, UF_COERENTE, CNPJ, POTENCIA, SEM_DATA_1900, DATA_PERIODO, TIPO_CONSUMIDOR,
                   # 8 caracteres: 5 digitos + 3 digitos ou '*' (mascara da ANEEL). So o tamanho nao basta:
                   # ha CEPs com ponto ('01.31***') ou tabulacao no lugar do zero inicial.
                   ("cod_cep com 8 caracteres (5 digitos + 3 digitos ou *)", "cod_cep RLIKE '^[0-9]{5}[0-9*]{3}$'"),
                   TIPOS_GERACAO]),
    dict(tabela="gold.fato_empreendimentos", grupo="ANEEL", steward="Breno",
         pk=["cod_empreendimento"],
         criticos=["cod_empreendimento", "agente_id", "local_id", "tempo_id", "fonte_id", "potencia_instalada_kw"],
         fks=[("agente_id", "gold.dim_agente", "agente_id"), ("local_id", "gold.dim_local", "local_id"),
              ("tempo_id", "gold.dim_tempo", "tempo_id"), ("fonte_id", "gold.dim_fonte_geracao", "fonte_id")],
         reconcilia=[("mesma quantidade de registros da silver", "silver.empreendimentos_geracao")],
         validade=[POTENCIA, SEM_DATA_1900, DATA_PERIODO, TIPO_CONSUMIDOR, *SEM_DESCONHECIDO]),
    dict(tabela="gold.dim_local", grupo="ANEEL", steward="Breno",
         pk=["cod_municipio_ibge"], pk_tecnica="local_id", cobertura=True,
         criticos=["local_id", "cod_municipio_ibge", "nom_municipio", "sig_uf"],
         fks=[("cod_municipio_ibge", *REF_MUNICIPIO)],
         validade=[COD_MUN, UF_VALIDA, UF_COERENTE,
                   ("cod_uf_ibge igual ao prefixo do codigo do municipio",
                    f"cast(cod_uf_ibge AS string) IN ({LISTA_COD_UF}) AND cast(cod_uf_ibge AS string) = {_PREFIXO}")]),
    dict(tabela="gold.dim_agente", grupo="ANEEL", steward="Breno",
         pk=["cnpj_distribuidora"], pk_tecnica="agente_id",
         criticos=["agente_id", "sig_agente", "nom_agente", "cnpj_distribuidora"], fks=[],
         validade=[CNPJ]),
    dict(tabela="gold.dim_fonte_geracao", grupo="ANEEL", steward="Breno",
         pk=["sig_tipo_geracao", "dsc_fonte_geracao", "dsc_porte"], pk_tecnica="fonte_id",
         criticos=["fonte_id", "sig_tipo_geracao", "dsc_fonte_geracao", "dsc_porte"], fks=[],
         validade=[TIPOS_GERACAO]),
    dict(tabela="gold.dim_tempo", grupo="ANEEL", steward="Breno",
         pk=["data"], pk_tecnica="tempo_id", criticos=["tempo_id", "data", "ano", "mes"], fks=[],
         validade=[("ano e mes coerentes com a data", "ano = year(data) AND mes = month(data)")]),

    # Grupo 2 - IBGE populacao (referencia de municipios: nao tem FK)
    dict(tabela="silver.populacao_municipio", grupo="IBGE populacao", steward="Bruno",
         pk=["cod_municipio_ibge", "ano"], cobertura=True,
         criticos=["cod_municipio_ibge", "ano", "populacao", "origem"], fks=[],
         validade=[COD_MUN, ("populacao maior que zero", "populacao > 0"),
                   ("ano entre 2012 e o ano atual", "ano BETWEEN 2012 AND year(current_date())")]),

    # Grupo 3 - IBGE PIB e densidade
    dict(tabela="silver.dmm_pib_municipio", grupo="IBGE PIB e densidade", steward="Bruno",
         pk=["cod_municipio_ibge", "ano"], cobertura=True, criticos=["cod_municipio_ibge", "ano", "pib_mil_reais"],
         fks=[("cod_municipio_ibge", *REF_MUNICIPIO)],
         validade=[COD_MUN, ("pib_mil_reais maior que zero", "pib_mil_reais > 0")]),
    dict(tabela="silver.dmm_densidade_municipio", grupo="IBGE PIB e densidade", steward="Bruno",
         pk=["cod_municipio_ibge", "ano"], cobertura=True,
         criticos=["cod_municipio_ibge", "ano", "densidade_hab_km2"],
         fks=[("cod_municipio_ibge", *REF_MUNICIPIO)],
         validade=[COD_MUN, ("densidade_hab_km2 maior que zero", "densidade_hab_km2 > 0")]),
    # dmm_05: usadas pelo IPNE v3 (apartamentos) e pelo filtro por raio do app (centroides)
    dict(tabela="silver.dmm_apartamento_municipio", grupo="IBGE PIB e densidade", steward="Bruno",
         pk=["cod_municipio_ibge", "ano"], cobertura=True, criticos=["cod_municipio_ibge", "ano", "pct_apartamento"],
         fks=[("cod_municipio_ibge", *REF_MUNICIPIO)],
         validade=[COD_MUN, ("pct_apartamento entre 0 e 100", "pct_apartamento BETWEEN 0 AND 100")]),
    dict(tabela="silver.dmm_centroide_municipio", grupo="IBGE PIB e densidade", steward="Bruno",
         pk=["cod_municipio_ibge"], cobertura=True, criticos=["cod_municipio_ibge", "latitude", "longitude"],
         fks=[("cod_municipio_ibge", *REF_MUNICIPIO)],
         validade=[COD_MUN, ("coordenadas dentro do Brasil",
                             "latitude BETWEEN -34.5 AND 6 AND longitude BETWEEN -74.5 AND -28"),
                   ("area_km2 maior que zero", "area_km2 > 0")]),

    # Grupo 4 - Censo 2022 e INPE
    dict(tabela="silver.ibge_renda_domiciliar_2022", grupo="Censo 2022 e INPE", steward="Gustavo",
         pk=["cod_municipio_ibge"], cobertura=True, criticos=["cod_municipio_ibge", "renda_pc_media_reais"],
         fks=[("cod_municipio_ibge", *REF_MUNICIPIO)],
         validade=[COD_MUN, ("renda_pc_media_reais maior que zero", "renda_pc_media_reais > 0")]),
    dict(tabela="silver.ibge_domicilios_codificados_2022", grupo="Censo 2022 e INPE", steward="Gustavo",
         pk=["cod_municipio_ibge"], cobertura=True, criticos=["cod_municipio_ibge", "sig_uf", "qtd_domicilios"],
         fks=[("cod_municipio_ibge", *REF_MUNICIPIO)],
         validade=[COD_MUN, UF_VALIDA, UF_COERENTE, ("qtd_domicilios maior que zero", "qtd_domicilios > 0")]),
    dict(tabela="silver.ibge_empresas_2022", grupo="Censo 2022 e INPE", steward="Gustavo",
         pk=["cod_municipio_ibge"], cobertura=True, criticos=["cod_municipio_ibge", "empresas_organizacoes"],
         fks=[("cod_municipio_ibge", *REF_MUNICIPIO)],
         validade=[COD_MUN, ("empresas_organizacoes nao negativo", "empresas_organizacoes >= 0")]),
    dict(tabela="silver.inpe_solar_consolidado_2017", grupo="Censo 2022 e INPE", steward="Gustavo",
         pk=["cod_municipio_ibge"], cobertura=True,
         criticos=["cod_municipio_ibge", "sig_uf", "irradiacao_horizontal_kwh_m2_dia_provisoria"],
         fks=[("cod_municipio_ibge", *REF_MUNICIPIO)],
         validade=[COD_MUN, UF_VALIDA, UF_COERENTE,
                   ("irradiacao horizontal entre 3 e 7 kWh/m2.dia",
                    "irradiacao_horizontal_kwh_m2_dia_provisoria BETWEEN 3 AND 7")]),

    # Grupo 5 - Gold consumida pela API/app
    dict(tabela="gold.dmm_municipio_resumo", grupo="Gold do app", steward="Daniel",
         pk=["cod_municipio_ibge"], cobertura=True,
         criticos=["cod_municipio_ibge", "nom_municipio", "sig_uf", "qtd_instalacoes", "populacao", "ipne"],
         fks=[("cod_municipio_ibge", *REF_MUNICIPIO)],
         validade=[COD_MUN, UF_VALIDA, UF_COERENTE, ("ipne entre 0 e 100", "ipne BETWEEN 0 AND 100"),
                   ("populacao maior que zero", "populacao > 0"),
                   ("qtd_instalacoes nao negativa", "qtd_instalacoes >= 0")]),
    dict(tabela="gold.dmm_kpi_municipio_anual", grupo="Gold do app", steward="Daniel",
         pk=["cod_municipio_ibge", "ano"], criticos=["cod_municipio_ibge", "ano", "qtd_novas", "potencia_kw_nova"],
         fks=[("cod_municipio_ibge", *REF_MUNICIPIO)],
         validade=[COD_MUN, ("ano entre 2012 e o ano atual", "ano BETWEEN 2012 AND year(current_date())"),
                   ("qtd_novas nao negativa", "qtd_novas >= 0"),
                   ("potencia_kw_nova nao negativa", "potencia_kw_nova >= 0")]),
    dict(tabela="gold.dmm_ipne_modelo", grupo="Gold do app", steward="Daniel",
         pk=["modelo"], criticos=["modelo", "formula", "r2", "n_municipios", "treinado_em"], fks=[],
         validade=[("r2 entre 0 e 1", "r2 BETWEEN 0 AND 1"),
                   ("n_municipios entre 1 e o total de municipios", f"n_municipios BETWEEN 1 AND {N_MUNICIPIOS}")]),
    dict(tabela="gold.dmm_ml_potencial_municipio", grupo="Gold do app", steward="Gustavo",
         pk=["cod_municipio_ibge"], cobertura=True,
         criticos=["cod_municipio_ibge", "potencia_instalada_mw", "potencia_esperada_ml_mw", "situacao_ml"],
         fks=[("cod_municipio_ibge", *REF_MUNICIPIO)],
         validade=[COD_MUN, ("potencia esperada nao negativa", "potencia_esperada_ml_mw >= 0"),
                   ("potencia instalada nao negativa", "potencia_instalada_mw >= 0"),
                   ("situacao_ml no dominio", "situacao_ml IN ('Acima do esperado', 'Abaixo do esperado')")]),
]

# COMMAND ----------

ORDEM_FAIXA = {"verde": 0, "amarelo": 1, "vermelho": 2}


def faixa(p):
    if p is None:
        return "nao se aplica"
    return "verde" if p > 90 else ("amarelo" if p >= 80 else "vermelho")


def pior_faixa(valores):
    """Faixa do pior caso entre os percentuais aplicaveis."""
    fx = [faixa(v) for v in valores if v is not None]
    return max(fx, key=ORDEM_FAIXA.get) if fx else "nao se aplica"


def pct(parte, total):
    return 100.0 * parte / total if total else None


def media(valores):
    v = [x for x in valores if x is not None]
    return sum(v) / len(v) if v else None


def r3(x):
    return None if x is None else round(x, 3)


def mede(cfg: dict):
    """Retorna as medidas da tabela. Falhas estruturais contam 0%, nunca 'nao se aplica'."""
    nome = f"{CATALOG}.{cfg['tabela']}"
    obs = []
    zero = dict(total=0, completude=0.0, integridade=0.0 if cfg["fks"] or cfg.get("reconcilia") else None,
                unicidade=0.0, validade=0.0 if cfg["validade"] else None, detalhe={},
                faixas=dict(completude="vermelho", integridade="vermelho" if cfg["fks"] or cfg.get("reconcilia")
                            else "nao se aplica", unicidade="vermelho",
                            validade="vermelho" if cfg["validade"] else "nao se aplica"))
    try:
        colunas = set(spark.table(nome).columns)
    except Exception:
        obs.append("tabela nao encontrada")
        return zero, obs

    # Regras de validade: testa cada expressao; regra quebrada (coluna renomeada) conta 0%
    regras, regras_quebradas = [], []
    for d, e in cfg["validade"]:
        try:
            spark.sql(f"SELECT {e} FROM {nome} LIMIT 0").collect()
            regras.append((d, e))
        except Exception:
            regras_quebradas.append(d)
            obs.append(f"regra de validade invalida: {d}")

    pk = cfg["pk"]
    pk_ok = bool(pk) and set(pk) <= colunas
    if not pk_ok:
        obs.append(f"chave de negocio ausente ou invalida: {pk}")
    pk_tec = cfg.get("pk_tecnica")
    if pk_tec and pk_tec not in colunas:
        obs.append(f"chave tecnica inexistente: {pk_tec}")
    # PK, chave tecnica e FKs sao sempre criticas: o nulo delas so e cobrado aqui
    declarados = list(dict.fromkeys(cfg["criticos"] + pk + ([pk_tec] if pk_tec else [])
                                    + [f[0] for f in cfg["fks"]]))
    criticos = [c for c in declarados if c in colunas]
    ausentes = [c for c in declarados if c not in colunas]
    obs += [f"campo critico inexistente: {c}" for c in ausentes]
    fks = [f for f in cfg["fks"] if f[0] in colunas]
    obs += [f"FK inexistente: {f[0]}" for f in cfg["fks"] if f[0] not in colunas]

    # Uma unica leitura da tabela para total, completude, cobertura, unicidade, FKs preenchidas e validade
    exprs = ["count(*) AS total"]
    exprs += [f"count(nullif(trim(cast(`{c}` AS string)), '')) AS `c_{c}`" for c in criticos]
    if pk_ok:
        cols = ", ".join(f"`{c}`" for c in pk)
        exprs.append(f"count(DISTINCT {cols}) AS pk_distintas")
        exprs.append(f"count_if({' AND '.join(f'`{c}` IS NOT NULL' for c in pk)}) AS pk_preenchidas")
    if pk_tec and pk_tec in colunas:
        exprs += [f"count(DISTINCT `{pk_tec}`) AS pkt_distintas", f"count(`{pk_tec}`) AS pkt_preenchidas"]
    exprs += [f"count(`{col}`) AS `f_{col}`" for col, _, _ in fks]
    exprs += [f"count_if(coalesce({e}, true)) AS `v_{i}`" for i, (_, e) in enumerate(regras)]
    todas = " AND ".join(f"coalesce({e}, true)" for _, e in regras) or "true"
    exprs.append(f"count_if({todas}) AS validos")
    try:
        r = spark.sql(f"SELECT {', '.join(exprs)} FROM {nome}").first().asDict()
    except Exception as e:
        obs.append(f"falha na leitura: {str(e)[:150]}")
        return zero, obs
    n = r["total"]
    if n == 0:
        obs.append("tabela vazia")
        return zero, obs

    # Completude: cada campo critico (ausente = 0%) e, quando aplicavel, a cobertura de municipios
    det_c = {c: pct(r[f"c_{c}"], n) for c in criticos}
    det_c.update({c: 0.0 for c in ausentes})
    if cfg.get("cobertura"):
        try:
            filtro_ano = f"WHERE t.ano = (SELECT max(ano) FROM {nome})" if "ano" in pk else ""
            mun = spark.sql(f"""
                SELECT count(DISTINCT t.cod_municipio_ibge) AS n FROM {nome} t
                LEFT SEMI JOIN {CATALOG}.{REF_MUNICIPIO[0]} r ON t.cod_municipio_ibge = r.{REF_MUNICIPIO[1]}
                {filtro_ano}
            """).first()["n"]
            det_c["cobertura de municipios"] = min(100.0, pct(mun, N_MUNICIPIOS))
        except Exception:
            det_c["cobertura de municipios"] = 0.0
            obs.append("cobertura nao calculada (coluna ou referencia inexistente)")

    # Integridade: so registros com FK preenchida (o nulo ja e cobrado na completude)
    det_i = {}
    for col, ref_tab, ref_col in fks:
        preenchidas = r[f"f_{col}"]
        chave = f"{col} -> {ref_tab}.{ref_col}"
        try:
            orfaos = spark.sql(f"""
                SELECT count(*) AS n FROM {nome} t
                LEFT ANTI JOIN (SELECT DISTINCT `{ref_col}` AS k FROM {CATALOG}.{ref_tab}) r ON t.`{col}` = r.k
                WHERE t.`{col}` IS NOT NULL
            """).first()["n"]
            # FK toda vazia: 100% aqui, mas a FK e campo critico e o nulo derruba a completude
            det_i[chave] = pct(preenchidas - orfaos, preenchidas) if preenchidas else 100.0
        except Exception:
            det_i[chave] = 0.0
            obs.append(f"referencia inexistente: {ref_tab}.{ref_col}")
    for col, *_ in cfg["fks"]:
        if col not in colunas:
            det_i[f"{col} (inexistente)"] = 0.0
    for desc, ref_tab in cfg.get("reconcilia", []):
        try:
            n_ref = spark.sql(f"SELECT count(*) AS n FROM {CATALOG}.{ref_tab}").first()["n"]
            det_i[desc] = 100.0 * min(n, n_ref) / max(n, n_ref) if max(n, n_ref) else 0.0
        except Exception:
            det_i[desc] = 0.0
            obs.append(f"reconciliacao sem referencia: {ref_tab}")

    # Unicidade: chaves distintas / registros com chave preenchida; vale a pior entre negocio e tecnica
    det_u = {}
    det_u[", ".join(pk) or "(sem chave)"] = (pct(r["pk_distintas"], r["pk_preenchidas"]) or 0.0) if pk_ok else 0.0
    if pk_tec:
        det_u[pk_tec] = (pct(r["pkt_distintas"], r["pkt_preenchidas"]) or 0.0) if pk_tec in colunas else 0.0

    det_v = {d: pct(r[f"v_{i}"], n) for i, (d, _) in enumerate(regras)}
    det_v.update({d: 0.0 for d in regras_quebradas})

    completude = media(det_c.values())
    integridade = media(det_i.values()) if det_i else None
    unicidade = min(det_u.values())
    if cfg["validade"]:
        validade = 0.0 if regras_quebradas else pct(r["validos"], n)
    else:
        validade = None

    faixas = dict(completude=pior_faixa(det_c.values()), integridade=pior_faixa(det_i.values()),
                  unicidade=pior_faixa(det_u.values()), validade=pior_faixa(det_v.values()))
    detalhe = {k: {kk: r3(vv) for kk, vv in v.items()}
               for k, v in dict(completude=det_c, integridade=det_i, unicidade=det_u, validade=det_v).items()}
    return dict(total=n, completude=completude, integridade=integridade, unicidade=unicidade,
                validade=validade, detalhe=detalhe, faixas=faixas), obs

# COMMAND ----------

medido_em = datetime.now(timezone.utc).replace(microsecond=0)
linhas = []
for cfg in TABELAS:
    m, obs = mede(cfg)
    dims = [m["completude"], m["integridade"], m["unicidade"]]
    iqd = media(dims)
    fx = m["faixas"]
    faixa_iqd = max((fx[d] for d in ("completude", "integridade", "unicidade") if fx[d] != "nao se aplica"),
                    key=ORDEM_FAIXA.get)
    linhas.append(Row(
        medido_em=medido_em, tabela=cfg["tabela"], grupo=cfg["grupo"], camada=cfg["tabela"].split(".")[0],
        data_steward=cfg["steward"], qtd_registros=m["total"],
        chave_negocio=", ".join(cfg["pk"]) + (f" | {cfg['pk_tecnica']}" if cfg.get("pk_tecnica") else ""),
        completude_pct=r3(m["completude"]), faixa_completude=fx["completude"],
        integridade_pct=r3(m["integridade"]), faixa_integridade=fx["integridade"],
        unicidade_pct=r3(m["unicidade"]), faixa_unicidade=fx["unicidade"],
        iqd_pct=r3(iqd), faixa_iqd=faixa_iqd,
        validade_pct=r3(m["validade"]), faixa_validade=fx["validade"],
        detalhe_json=json.dumps(m["detalhe"], ensure_ascii=False), observacoes="; ".join(obs),
        versao_regras=VERSAO_REGRAS,
    ))

resultado = spark.createDataFrame(linhas)
display(resultado.drop("detalhe_json"))

# COMMAND ----------

# Grava o historico (append). As tabelas medidas nao sao alteradas.
resultado.write.mode("append").option("mergeSchema", "true").saveAsTable(DESTINO)
spark.sql(f"ALTER TABLE {DESTINO} SET TAGS ('autor' = 'dmm')")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Painel: IQD da base, variacao e pendencias
# MAGIC IQD da base = media do IQD das tabelas da ultima medicao; a faixa da base e a da pior tabela.
# MAGIC Vira pendencia (plano de acao, secao 5 do documento): tabela fora do verde em qualquer dimensao,
# MAGIC unicidade abaixo de 100%, observacao estrutural, queda de IQD ou de validade maior que 0,01 ponto
# MAGIC ou queda de mais de 5% na quantidade de registros em relacao a medicao anterior. A comparacao e
# MAGIC feita so entre medicoes da mesma versao de regras.

# COMMAND ----------

display(spark.sql(f"""
WITH ultima AS (SELECT * FROM {DESTINO} WHERE medido_em = (SELECT max(medido_em) FROM {DESTINO}))
SELECT round(avg(iqd_pct), 2) AS iqd_base,
       CASE WHEN count_if(faixa_iqd = 'vermelho') > 0 THEN 'vermelho'
            WHEN count_if(faixa_iqd = 'amarelo') > 0 THEN 'amarelo' ELSE 'verde' END AS faixa_base,
       round(avg(validade_pct), 2) AS validade_media,
       count_if(faixa_iqd <> 'verde') AS tabelas_fora_do_verde
FROM ultima
"""))

# COMMAND ----------

display(spark.sql(f"""
WITH hist AS (
  SELECT *,
         lag(iqd_pct) OVER (PARTITION BY tabela, versao_regras ORDER BY medido_em) AS iqd_anterior,
         lag(validade_pct) OVER (PARTITION BY tabela, versao_regras ORDER BY medido_em) AS validade_anterior,
         lag(qtd_registros) OVER (PARTITION BY tabela, versao_regras ORDER BY medido_em) AS registros_anteriores
  FROM {DESTINO}
)
SELECT tabela, data_steward, faixa_iqd, faixa_completude, faixa_integridade, faixa_unicidade, faixa_validade,
       round(iqd_pct - iqd_anterior, 3) AS variacao_iqd,
       round(validade_pct - validade_anterior, 3) AS variacao_validade,
       qtd_registros - registros_anteriores AS variacao_registros,
       observacoes
FROM hist
WHERE medido_em = (SELECT max(medido_em) FROM {DESTINO})
  AND (faixa_iqd <> 'verde' OR faixa_validade IN ('amarelo', 'vermelho') OR unicidade_pct < 100
       OR coalesce(observacoes, '') <> ''
       OR iqd_pct < iqd_anterior - 0.01 OR validade_pct < validade_anterior - 0.01
       OR qtd_registros < 0.95 * registros_anteriores)
ORDER BY tabela
"""))
