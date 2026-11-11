"""SolarData API: indicadores de geracao solar distribuida e IPNE por municipio.

Rodar (na raiz do projeto):  .venv/Scripts/python -m uvicorn api.main:app --port 8000
Documentacao interativa: http://localhost:8000/docs
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import auth, config
from .dados import UFS, Base, Repositorio, normaliza, semelhantes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

repo = Repositorio()


@asynccontextmanager
async def ciclo(_: FastAPI):
    auth.inicializa()
    repo.aquece()  # comeca a acordar o warehouse enquanto o usuario ve a splash
    yield


app = FastAPI(
    title="SolarData API",
    version="1.0.0",
    summary="Geração solar distribuída por município (ANEEL) cruzada com IBGE, e o Índice de Potencial Não Explorado (IPNE).",
    lifespan=ciclo,
)
app.add_middleware(
    CORSMiddleware, allow_origins=config.CORS_ORIGENS, allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def cabecalhos(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    if request.url.path.startswith("/api/"):
        resp.headers.setdefault("Cache-Control", "no-store")  # dados por usuario autenticado
    else:
        resp.headers.setdefault("Cache-Control", "no-cache")  # telas: revalida via ETag a cada visita
    return resp


def base() -> Base:
    try:
        return repo.base()
    except Exception:
        raise HTTPException(503, "Dados indisponíveis no momento. Tente novamente em instantes.") from None


# ---------------------------------------------------------------------------
# Regras de apresentacao compartilhadas por web e mobile
# ---------------------------------------------------------------------------

# Vocabulario unico do app (web e mobile usam estes textos; nao reescrever nas telas):
# - a referencia do IPNE e sempre "esperado pelo perfil" (o valor do modelo, nao uma lista de cidades;
#   a lista de pares e outra coisa: /municipios/{codigo}/semelhantes)
# - a diferenca e sempre em instalacoes: "espaco para cerca de X" ou "X acima do esperado pelo perfil"
# - o nivel fala de oportunidade/maturidade, nunca de "saturado"

EM_LINHA = 0.05              # |real/referencia - 1| abaixo disso: em linha com o perfil
DENSIDADE_VERTICALIZADA = 1000  # hab/km2: acima disso, muita gente mora em apartamento
ESPACO_PEQUENO = 300         # instalacoes: abaixo disso, o espaco e pequeno em termos absolutos


def compacto(n: float) -> str:
    """1342 -> '1.342'; 17234 -> '17,2 mil'; 1190000 -> '1,19 mi' (pt-BR)."""
    a = abs(n)
    if a >= 1e6:
        txt = f"{n / 1e6:.2f} mi" if a < 1e7 else f"{n / 1e6:.1f} mi"
    elif a >= 1e4:
        txt = f"{n / 1e3:.1f} mil"
    else:
        return f"{round(n):,}".replace(",", ".")
    return txt.replace(".", ",")


def nivel_ipne(score: float) -> str:
    if score >= 80:
        return "Alta oportunidade"
    if score >= 60:
        return "Boa oportunidade"
    if score >= 40:
        return "Em linha com o perfil"
    if score >= 20:
        return "Mercado maduro"
    return "Mercado muito maduro"


def manchete_ipne(espaco: float, dif: float) -> str:
    if abs(dif) < EM_LINHA:
        return "No nível esperado pelo perfil"
    if espaco > 0:
        return f"Espaço para cerca de {compacto(espaco)} instalações"
    return f"{compacto(-espaco)} instalações acima do esperado pelo perfil"


def contexto_ipne(espaco: float, dif: float, densidade: float | None) -> str | None:
    """Alerta que muda a leitura do numero; None quando nao ha nada a ressalvar."""
    if espaco <= 0 or abs(dif) < EM_LINHA:
        return None
    if densidade is not None and densidade >= DENSIDADE_VERTICALIZADA:
        return (f"Leia com cuidado: cidade densa ({compacto(densidade)} hab/km²), com muita gente em apartamento. "
                "Parte desse espaço pode estar em empresas e usinas compartilhadas, não em telhados residenciais.")
    if espaco < ESPACO_PEQUENO:
        return "Mercado pequeno: a oportunidade é alta para o perfil, mas são poucas instalações em números absolutos."
    return None


def serie_completa(linhas: list[dict], ano_completo: int) -> list[dict]:
    """Preenche anos sem registro com zero e calcula o acumulado. O ano atual vem marcado como parcial."""
    if not linhas:
        return []
    por_ano = {r["ano"]: r for r in linhas}
    serie, qtd_acc, kw_acc = [], 0, 0.0
    for ano in range(min(por_ano), max(max(por_ano), ano_completo) + 1):
        r = por_ano.get(ano, {})
        qtd, kw = r.get("qtd_novas", 0), r.get("potencia_kw_nova", 0.0)
        qtd_acc += qtd
        kw_acc += kw
        serie.append({
            "ano": ano, "novas": qtd, "potencia_kw_nova": round(kw, 2),
            "acumulado": qtd_acc, "potencia_kw_acumulada": round(kw_acc, 2),
            "parcial": ano > ano_completo,
        })
    return serie


def crescimento(serie: list[dict], ano: int, campo: str) -> float | None:
    por_ano = {r["ano"]: r[campo] for r in serie}
    atual, anterior = por_ano.get(ano), por_ano.get(ano - 1)
    if not anterior or atual is None:
        return None
    return round(atual / anterior - 1, 4)


def _arred(v, casas=2):
    return None if v is None else round(v, casas)


# Acima disso o Random Forest perde confiabilidade: arvores nao estimam alem do que viram no treino
POPULACAO_LIMITE_ML = 1_000_000


def bloco_ml(b: Base, m: dict) -> dict | None:
    r = b.ml.get(m["cod_municipio_ibge"])
    if r is None or r["potencia_esperada_ml_mw"] is None:
        return None
    instalada, estimada = r["potencia_instalada_mw"], r["potencia_esperada_ml_mw"]
    espaco = estimada - instalada
    return {
        "instalada_mw": round(instalada, 1),
        "estimada_mw": round(estimada, 1),
        # positivo = espaco para crescer segundo o modelo
        "potencial_adicional_mw": round(espaco, 1),
        # mesmo vocabulario do IPNE (a tabela de origem usa "Abaixo/Acima do esperado")
        "situacao": "Espaço para crescer" if espaco > 0 else "Já acima da estimativa",
        "algoritmo": r["algoritmo_ml"],
        "confiavel": (m["populacao"] or 0) < POPULACAO_LIMITE_ML,
    }


def resumo_municipio(b: Base, m: dict) -> dict:
    ano_completo = m["ano_completo"]
    serie = serie_completa(b.anual.get(m["cod_municipio_ibge"], []), ano_completo)
    ipne = None
    if m["ipne"] is not None:
        referencia = round(m["qtd_esperada"])
        espaco = referencia - m["qtd_instalacoes"]
        ipne = {
            "score": int(m["ipne"]),
            "nivel": nivel_ipne(m["ipne"]),
            # quantas instalacoes o modelo espera pelo perfil da cidade
            "referencia": referencia,
            # positivo = espaco para crescer; negativo = ja acima do esperado pelo perfil
            "espaco": espaco,
            "em_linha": abs(m["diferenca_pct"]) < EM_LINHA,
            "manchete": manchete_ipne(espaco, m["diferenca_pct"]),
            "contexto": contexto_ipne(espaco, m["diferenca_pct"], m["densidade_hab_km2"]),
            "posicao": int(m["rank_ipne"]),
            "total": len(b.ranking_oportunidade),
            "diferenca_pct": m["diferenca_pct"],
        }
    return {
        "tipo": "municipio",
        "codigo": m["cod_municipio_ibge"],
        "nome": m["nom_municipio"],
        "uf": m["sig_uf"],
        "regiao": m["nom_regiao"],
        "instalacoes": m["qtd_instalacoes"],
        "potencia_kw": m["potencia_kw"],
        "uc_recebem_credito": m["qtd_uc_credito"],
        "inst_por_mil_hab": _arred(m["inst_por_mil_hab"], 1),
        "kw_por_hab": _arred(m["kw_por_hab"], 3),
        "populacao": m["populacao"],
        "pib_mil_reais": m["pib_mil_reais"],
        "pib_per_capita": _arred(m["pib_per_capita_reais"], 0),
        "densidade_hab_km2": _arred(m["densidade_hab_km2"], 1),
        # .get: snapshots anteriores ao IPNE v2 nao tem estas colunas
        "renda_pc": _arred(m.get("renda_pc_media_reais"), 0),
        "domicilios": None if m.get("qtd_domicilios") is None else int(m["qtd_domicilios"]),
        "inst_por_mil_domicilios": _arred(m.get("inst_por_mil_domicilios"), 1),
        "irradiacao_kwh_m2_dia": _arred(m.get("irradiacao_kwh_m2_dia"), 2),
        "irradiacao_estimada": bool(m.get("irradiacao_estimada")),
        "crescimento_instalacoes_pct": crescimento(serie, ano_completo, "acumulado"),
        "crescimento_potencia_pct": crescimento(serie, ano_completo, "potencia_kw_acumulada"),
        "posicao_adocao": m["rank_adocao"],
        "ipne": ipne,
        "ml": bloco_ml(b, m),
        "referencias": {
            "aneel": m["periodo_referencia"], "ano_completo": ano_completo,
            "populacao": m["ano_populacao"], "pib": m["ano_pib"],
        },
    }


def resumo_uf(b: Base, u: dict) -> dict:
    serie = serie_completa(b.anual_uf.get(u["sig_uf"], []), u["ano_completo"])
    pop = u["populacao"] or None
    return {
        "tipo": "uf",
        "codigo": u["sig_uf"],
        "nome": UFS.get(u["sig_uf"], u["sig_uf"]),
        "uf": u["sig_uf"],
        "regiao": u["nom_regiao"],
        "municipios": u["municipios"],
        "instalacoes": u["qtd_instalacoes"],
        "potencia_kw": round(u["potencia_kw"], 2),
        "uc_recebem_credito": u["qtd_uc_credito"],
        "inst_por_mil_hab": round(u["qtd_instalacoes"] / pop * 1000, 1) if pop else None,
        "kw_por_hab": round(u["potencia_kw"] / pop, 3) if pop else None,
        "populacao": u["populacao"],
        "pib_mil_reais": u["pib_mil_reais"],
        "pib_per_capita": round(u["pib_mil_reais"] * 1000 / pop) if pop else None,
        "renda_pc": round(u["_renda_x_pop"] / u["_pop_renda"]) if u["_pop_renda"] else None,
        "domicilios": int(u["qtd_domicilios"]) or None,
        "inst_por_mil_domicilios": round(u["qtd_instalacoes"] / u["qtd_domicilios"] * 1000, 1) if u["qtd_domicilios"] else None,
        "irradiacao_kwh_m2_dia": round(u["_irr_x_pop"] / u["_pop_irr"], 2) if u["_pop_irr"] else None,
        "irradiacao_estimada": False,
        "crescimento_instalacoes_pct": crescimento(serie, u["ano_completo"], "acumulado"),
        "crescimento_potencia_pct": crescimento(serie, u["ano_completo"], "potencia_kw_acumulada"),
        "ipne": None,  # o IPNE compara municipios do mesmo estado; nao existe um IPNE de UF
        "ml": None,  # o modelo estima por municipio
        "referencias": {
            "aneel": u["periodo_referencia"], "ano_completo": u["ano_completo"],
            "populacao": u["ano_populacao"], "pib": u["ano_pib"],
        },
    }


def item_ranking(m: dict, posicao: int) -> dict:
    espaco = None if m["qtd_esperada"] is None else round(m["qtd_esperada"]) - m["qtd_instalacoes"]
    return {
        "posicao": posicao,
        "codigo": m["cod_municipio_ibge"],
        "nome": m["nom_municipio"],
        "uf": m["sig_uf"],
        "instalacoes": m["qtd_instalacoes"],
        "potencia_kw": m["potencia_kw"],
        "populacao": m["populacao"],
        "ipne": None if m["ipne"] is None else int(m["ipne"]),
        "nivel": None if m["ipne"] is None else nivel_ipne(m["ipne"]),
        # mesma leitura do card do municipio, em uma linha
        "manchete": None if m["ipne"] is None else manchete_ipne(espaco, m["diferenca_pct"]),
        "espaco": espaco,
        "diferenca_pct": m["diferenca_pct"],
    }


def _municipio(b: Base, codigo: int) -> dict:
    m = b.municipios.get(codigo)
    if m is None:
        raise HTTPException(404, "Município não encontrado.")
    return m


def _uf(b: Base, sigla: str) -> dict:
    u = b.ufs.get(sigla.upper())
    if u is None:
        raise HTTPException(404, "Estado não encontrado.")
    return u


# ---------------------------------------------------------------------------
# Rotas publicas
# ---------------------------------------------------------------------------

@app.get("/api/status", tags=["sistema"])
def status():
    """Se os dados ja estao prontos e de onde vieram (Databricks ao vivo ou snapshot)."""
    repo.aquece()
    return repo.status()


class Cadastro(BaseModel):
    nome: str
    email: str
    senha: str


class Login(BaseModel):
    email: str
    senha: str


class EdicaoPerfil(BaseModel):
    nome: str


@app.post("/api/auth/cadastro", status_code=201, tags=["conta"])
def cadastro(dados: Cadastro):
    usuario = auth.cadastra(dados.nome, dados.email, dados.senha)
    return {"token": auth.emite_token(usuario), "usuario": usuario}


@app.post("/api/auth/login", tags=["conta"])
def login(dados: Login):
    usuario = auth.autentica(dados.email, dados.senha)
    return {"token": auth.emite_token(usuario), "usuario": usuario}


# ---------------------------------------------------------------------------
# Rotas autenticadas
# ---------------------------------------------------------------------------

@app.get("/api/auth/me", tags=["conta"])
def eu(usuario: dict = Depends(auth.usuario_atual)):
    return usuario


@app.patch("/api/auth/me", tags=["conta"])
def edita_perfil(dados: EdicaoPerfil, usuario: dict = Depends(auth.usuario_atual)):
    return auth.atualiza_nome(usuario["id"], dados.nome)


@app.get("/api/busca", tags=["dados"])
def busca(
    q: str = Query(..., min_length=2, max_length=60),
    limite: int = Query(8, ge=1, le=30),
    _: dict = Depends(auth.usuario_atual),
):
    """Estados e municipios pelo nome (sem diferenciar acento). Municipios maiores primeiro."""
    b = base()
    termo = normaliza(q)
    ufs = [
        {"tipo": "uf", "codigo": s, "nome": n, "uf": s}
        for s, n in UFS.items() if normaliza(n).startswith(termo) or s.lower() == termo
    ]
    comeca, contem = [], []
    for nome, m in b.indice_busca:
        if nome.startswith(termo):
            comeca.append(m)
        elif termo in nome:
            contem.append(m)
    ordem = lambda m: -(m["populacao"] or 0)  # noqa: E731
    municipios = [
        {"tipo": "municipio", "codigo": m["cod_municipio_ibge"], "nome": m["nom_municipio"], "uf": m["sig_uf"]}
        for m in sorted(comeca, key=ordem) + sorted(contem, key=ordem)
    ]
    return (ufs + municipios)[:limite]


@app.get("/api/municipios/{codigo}", tags=["dados"])
def municipio(codigo: int, _: dict = Depends(auth.usuario_atual)):
    """Indicadores, IPNE e referencias de um municipio (codigo IBGE de 7 digitos)."""
    b = base()
    return resumo_municipio(b, _municipio(b, codigo))


@app.get("/api/municipios/{codigo}/historico", tags=["dados"])
def historico_municipio(codigo: int, _: dict = Depends(auth.usuario_atual)):
    """Novas instalacoes e acumulado por ano (data de atualizacao cadastral como proxy da conexao)."""
    b = base()
    m = _municipio(b, codigo)
    return serie_completa(b.anual.get(codigo, []), m["ano_completo"])


@app.get("/api/municipios/{codigo}/semelhantes", tags=["dados"])
def municipios_semelhantes(
    codigo: int,
    limite: int = Query(6, ge=1, le=20),
    _: dict = Depends(auth.usuario_atual),
):
    """Municipios do Brasil todo com perfil socioeconomico mais proximo (populacao, PIB per capita, renda,
    densidade e domicilios por habitante). Serve para comparar pares; nao e a referencia do IPNE."""
    b = base()
    _municipio(b, codigo)
    itens = []
    for cod, dist in semelhantes(b.perfis, codigo, limite):
        m = b.municipios[cod]
        itens.append({
            "codigo": cod,
            "nome": m["nom_municipio"],
            "uf": m["sig_uf"],
            "populacao": m["populacao"],
            "renda_pc": _arred(m.get("renda_pc_media_reais"), 0),
            "inst_por_mil_hab": _arred(m["inst_por_mil_hab"], 1),
            "irradiacao_kwh_m2_dia": _arred(m.get("irradiacao_kwh_m2_dia"), 2),
            "ipne": None if m["ipne"] is None else int(m["ipne"]),
            "nivel": None if m["ipne"] is None else nivel_ipne(m["ipne"]),
            "distancia": round(dist, 3),
        })
    return itens


@app.get("/api/ufs", tags=["dados"])
def ufs(_: dict = Depends(auth.usuario_atual)):
    """Estados com os dois numeros do mapa: oportunidade (IPNE medio ponderado pela populacao) e adocao."""
    b = base()
    itens = []
    for s in sorted(b.ufs, key=lambda s: UFS.get(s, s)):
        u = b.ufs[s]
        pop = u["populacao"] or None
        itens.append({
            "codigo": s,
            "nome": UFS.get(s, s),
            "regiao": u["nom_regiao"],
            # media dos municipios ponderada pela populacao: puxada pelas cidades grandes
            "ipne_ponderado": round(u["_ipne_x_pop"] / u["_pop_ipne"], 1) if u.get("_pop_ipne") else None,
            "inst_por_mil_hab": round(u["qtd_instalacoes"] / pop * 1000, 1) if pop else None,
        })
    return itens


@app.get("/api/ufs/{sigla}", tags=["dados"])
def uf(sigla: str, _: dict = Depends(auth.usuario_atual)):
    b = base()
    return resumo_uf(b, _uf(b, sigla))


@app.get("/api/ufs/{sigla}/historico", tags=["dados"])
def historico_uf(sigla: str, _: dict = Depends(auth.usuario_atual)):
    b = base()
    u = _uf(b, sigla)
    return serie_completa(b.anual_uf.get(u["sig_uf"], []), u["ano_completo"])


@app.get("/api/rankings", tags=["dados"])
def rankings(
    tipo: Literal["oportunidade", "adocao"] = "oportunidade",
    uf: str | None = Query(None, min_length=2, max_length=2),
    pop_min: int = Query(0, ge=0),
    limite: int = Query(10, ge=1, le=100),
    _: dict = Depends(auth.usuario_atual),
):
    """Ranking por oportunidade (IPNE) ou por adocao atual (instalacoes), com filtro de UF e porte."""
    b = base()
    fonte = b.ranking_oportunidade if tipo == "oportunidade" else b.ranking_adocao
    sigla = uf.upper() if uf else None
    itens = []
    for m in fonte:
        if sigla and m["sig_uf"] != sigla:
            continue
        if (m["populacao"] or 0) < pop_min:
            continue
        itens.append(item_ranking(m, len(itens) + 1))
        if len(itens) == limite:
            break
    return itens


@app.get("/api/modelo", tags=["dados"])
def modelo(_: dict = Depends(auth.usuario_atual)):
    """Formula, coeficientes e R2 do IPNE, e as metricas do modelo de Machine Learning, para transparencia."""
    b = base()
    return {**b.modelo, "ml": b.ml_metricas}


# ---------------------------------------------------------------------------
# Frontend web (as telas em app/) servido pela mesma origem
# ---------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
def raiz():
    return RedirectResponse("/splash.html")


app.mount("/", StaticFiles(directory=config.DIR_WEB, html=True), name="web")
