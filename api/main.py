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
from .dados import UFS, Base, Repositorio, normaliza

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

def nivel_ipne(score: float) -> str:
    if score >= 80:
        return "Alto potencial"
    if score >= 60:
        return "Bom potencial"
    if score >= 40:
        return "Dentro do esperado"
    if score >= 20:
        return "Mercado maduro"
    return "Mercado saturado"


def leitura_ipne(dif: float) -> str:
    pct = round(abs(dif) * 100)
    if pct < 5:
        return "Em linha com o esperado para o perfil socioeconômico"
    return f"{pct}% {'abaixo' if dif < 0 else 'acima'} do esperado para o perfil socioeconômico"


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


def resumo_municipio(b: Base, m: dict) -> dict:
    ano_completo = m["ano_completo"]
    serie = serie_completa(b.anual.get(m["cod_municipio_ibge"], []), ano_completo)
    ipne = None
    if m["ipne"] is not None:
        ipne = {
            "score": int(m["ipne"]),
            "nivel": nivel_ipne(m["ipne"]),
            "esperado": round(m["qtd_esperada"]),
            "diferenca_pct": m["diferenca_pct"],
            "leitura": leitura_ipne(m["diferenca_pct"]),
            "posicao": int(m["rank_ipne"]),
            "total": len(b.ranking_oportunidade),
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
        "crescimento_instalacoes_pct": crescimento(serie, ano_completo, "acumulado"),
        "crescimento_potencia_pct": crescimento(serie, ano_completo, "potencia_kw_acumulada"),
        "posicao_adocao": m["rank_adocao"],
        "ipne": ipne,
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
        "crescimento_instalacoes_pct": crescimento(serie, u["ano_completo"], "acumulado"),
        "crescimento_potencia_pct": crescimento(serie, u["ano_completo"], "potencia_kw_acumulada"),
        "ipne": None,  # o IPNE compara municipios do mesmo estado; nao existe um IPNE de UF
        "referencias": {
            "aneel": u["periodo_referencia"], "ano_completo": u["ano_completo"],
            "populacao": u["ano_populacao"], "pib": u["ano_pib"],
        },
    }


def item_ranking(m: dict, posicao: int) -> dict:
    return {
        "posicao": posicao,
        "codigo": m["cod_municipio_ibge"],
        "nome": m["nom_municipio"],
        "uf": m["sig_uf"],
        "instalacoes": m["qtd_instalacoes"],
        "potencia_kw": m["potencia_kw"],
        "populacao": m["populacao"],
        "ipne": None if m["ipne"] is None else int(m["ipne"]),
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


@app.get("/api/ufs", tags=["dados"])
def ufs(_: dict = Depends(auth.usuario_atual)):
    b = base()
    return [{"codigo": s, "nome": UFS.get(s, s)} for s in sorted(b.ufs, key=lambda s: UFS.get(s, s))]


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
    """Formula, coeficientes e R2 do modelo do IPNE, para transparencia."""
    return base().modelo


# ---------------------------------------------------------------------------
# Frontend web (as telas em app/) servido pela mesma origem
# ---------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
def raiz():
    return RedirectResponse("/splash.html")


app.mount("/", StaticFiles(directory=config.DIR_WEB, html=True), name="web")
