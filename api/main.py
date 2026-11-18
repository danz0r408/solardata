"""SolarData API: indicadores de geracao solar distribuida e IPNE por municipio.

Rodar (na raiz do projeto):  .venv/Scripts/python -m uvicorn api.main:app --port 8000
Documentacao interativa: http://localhost:8000/docs
"""

from __future__ import annotations

import logging
import math
import statistics
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

# Vocabulario unico do app (web e mobile usam estes textos; nao reescrever nas telas).
# Feito para um vendedor leigo: "IPNE" e "ML" ficam so nas explicacoes e na metodologia.
# - o que falta para a cidade chegar ao nivel de cidades parecidas = "clientes em potencial"
# - a referencia do modelo = "cidades parecidas" (o valor do modelo; a lista de pares e /semelhantes)
# - o nivel fala de quanto a cidade esta explorada, nunca de "saturado" ou "maduro"
# - os dois modelos: "Confirmado por 2 modelos" / "Os modelos discordam"

EM_LINHA = 0.05              # |real/referencia - 1| abaixo disso: em linha com o perfil
DENSIDADE_VERTICALIZADA = 1000  # hab/km2: so quando falta o dado de apartamentos (snapshots antigos)
APARTAMENTOS_MUITOS = 25     # % dos domicilios: acima disso, boa parte da cidade nao tem telhado proprio
ESPACO_PEQUENO = 300         # instalacoes: abaixo disso, o espaco e pequeno em termos absolutos

# "Por que vender aqui": cada argumento so aparece se passar do limiar
ARG_RENDA = 0.15             # renda das familias 15% acima da media do estado
ARG_PARES = 1.5              # cidades de perfil parecido com 1,5x mais instalacoes por domicilio
ARG_SOL = 0.03               # irradiacao 3% acima da media do estado
ARG_CRESCIMENTO = 0.25       # instalacoes acumuladas cresceram 25% no ultimo ano completo
MAX_ARGUMENTOS = 3


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


def potencia_curta(kw: float) -> str:
    """850 -> '850 kW'; 6120 -> '6,1 MW' (pt-BR)."""
    if abs(kw) >= 100_000:
        return f"{kw / 1000:,.0f} MW".replace(",", ".")
    if abs(kw) >= 1000:
        return f"{kw / 1000:.1f} MW".replace(".", ",")
    return f"{round(kw)} kW"


def nivel_ipne(score: float) -> str:
    if score >= 80:
        return "Muito pouco explorada"
    if score >= 60:
        return "Pouco explorada"
    if score >= 40:
        return "Na média"
    if score >= 20:
        return "Bem explorada"
    return "Muito bem explorada"


def manchete_ipne(espaco: float, dif: float, espaco_kw: float | None = None) -> str:
    if abs(dif) < EM_LINHA:
        return "No nível de cidades parecidas"
    if espaco > 0:
        kw = f" (~{potencia_curta(espaco_kw)})" if espaco_kw else ""
        return f"Cerca de {compacto(espaco)} clientes em potencial{kw}"
    return f"Já tem {compacto(-espaco)} instalações a mais que cidades parecidas"


def muitos_apartamentos(m: dict) -> bool:
    pct = m.get("pct_apartamento")
    if pct is not None:
        return pct >= APARTAMENTOS_MUITOS
    return (m["densidade_hab_km2"] or 0) >= DENSIDADE_VERTICALIZADA


def contexto_ipne(espaco: float, dif: float, m: dict) -> str | None:
    """Alerta que muda a leitura do numero; None quando nao ha nada a ressalvar."""
    if espaco <= 0 or abs(dif) < EM_LINHA:
        return None
    if muitos_apartamentos(m):
        pct = m.get("pct_apartamento")
        quem = (f"{round(pct)}% dos moradores vivem em prédio" if pct is not None
                else "Cidade densa, com muita gente em prédio")
        return f"{quem}. Parte desse potencial está em empresas e condomínios, não em casas."
    if espaco < ESPACO_PEQUENO:
        return "Cidade pequena: pouco explorada, mas são poucos clientes no total."
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


def concordam(b: Base, m: dict) -> bool:
    """IPNE e Machine Learning apontam espaco para crescer (fora das cidades onde o ML nao e confiavel)."""
    if m["ipne"] is None or not m.get("_espaco") or m["_espaco"] <= 0 or m["diferenca_pct"] > -EM_LINHA:
        return False
    if (m["populacao"] or 0) >= POPULACAO_LIMITE_ML:
        return False
    r = b.ml.get(m["cod_municipio_ibge"])
    return bool(r and r["potencia_esperada_ml_mw"] is not None
                and r["potencia_esperada_ml_mw"] > r["potencia_instalada_mw"])


def discordam(b: Base, m: dict) -> bool:
    """O IPNE ve clientes em potencial, mas o ML (onde e confiavel) diz que a cidade ja passou da estimativa."""
    if m["ipne"] is None or not m.get("_espaco") or m["_espaco"] <= 0 or m["diferenca_pct"] > -EM_LINHA:
        return False
    if (m["populacao"] or 0) >= POPULACAO_LIMITE_ML:
        return False
    r = b.ml.get(m["cod_municipio_ibge"])
    return bool(r and r["potencia_esperada_ml_mw"] is not None
                and r["potencia_esperada_ml_mw"] <= r["potencia_instalada_mw"])


def duvidoso(b: Base, m: dict) -> bool:
    """Cidade que o proprio app manda olhar com cautela: muitos predios ou modelos em desacordo."""
    return muitos_apartamentos(m) or discordam(b, m)


def veredito_modelos(b: Base, m: dict) -> str | None:
    """Uma frase so sobre os dois modelos, para a ficha nao mostrar dois numeros opostos sem explicacao."""
    if concordam(b, m):
        return "Confirmado por 2 modelos: os dois apontam clientes em potencial."
    if discordam(b, m):
        return "Os modelos discordam: o segundo modelo acha que a cidade já passou do potencial. Trate com cautela."
    r = b.ml.get(m["cod_municipio_ibge"])
    if r and (m["populacao"] or 0) >= POPULACAO_LIMITE_ML:
        return "O segundo modelo não é confiável para cidades acima de 1 milhão de habitantes. Vale a nota de oportunidade."
    return None


def _media_uf(u: dict, chave: str) -> float | None:
    return u[f"_{chave}_x_pop"] / u[f"_pop_{chave}"] if u.get(f"_pop_{chave}") else None


def argumentos(b: Base, m: dict, crescimento_pct: float | None, ano: int) -> list[dict]:
    """Ate 3 motivos para vender na cidade, cada um de uma regra fixa sobre os dados (sem texto gerado)."""
    u = b.ufs[m["sig_uf"]]
    # so ha motivo para vender onde ha clientes em potencial
    if (m.get("_espaco") or 0) <= 0 or m["diferenca_pct"] is None or m["diferenca_pct"] > -EM_LINHA:
        return []
    tem_espaco = True
    candidatos = []
    if concordam(b, m):
        candidatos.append(("modelos", "Confirmado por 2 modelos"))

    proprio = m.get("inst_por_mil_domicilios")
    if proprio and tem_espaco:
        pares = [b.municipios[c].get("inst_por_mil_domicilios")
                 for c, _ in semelhantes(b.perfis, m["cod_municipio_ibge"], 6)]
        pares = [p for p in pares if p is not None]
        if pares and statistics.median(pares) / proprio >= ARG_PARES:
            r = statistics.median(pares) / proprio
            vezes = "vez" if r < 2 else "vezes"
            candidatos.append(("pares", f"Cidades de perfil semelhante têm {r:.1f} {vezes} mais solar por domicílio".replace(".", ",", 1)))

    renda, renda_uf = m.get("renda_pc_media_reais"), _media_uf(u, "renda")
    if renda and renda_uf and renda / renda_uf - 1 >= ARG_RENDA:
        candidatos.append(("renda", f"Renda das famílias {round((renda / renda_uf - 1) * 100)}% acima da média do estado"))

    if crescimento_pct is not None and crescimento_pct >= ARG_CRESCIMENTO:
        candidatos.append(("crescimento", f"Instalações cresceram {round(crescimento_pct * 100)}% em {ano}"))

    irr, irr_uf = m.get("irradiacao_kwh_m2_dia"), _media_uf(u, "irr")
    if irr and irr_uf and not m.get("irradiacao_estimada") and irr / irr_uf - 1 >= ARG_SOL:
        candidatos.append(("sol", f"Sol {round((irr / irr_uf - 1) * 100)}% acima da média do estado"))

    return [{"tipo": t, "texto": txt} for t, txt in candidatos[:MAX_ARGUMENTOS]]


def distancia_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia em linha reta (Haversine) entre dois pontos."""
    f1, f2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((f2 - f1) / 2) ** 2
         + math.cos(f1) * math.cos(f2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * 6371 * math.asin(math.sqrt(a))


def resumo_municipio(b: Base, m: dict) -> dict:
    ano_completo = m["ano_completo"]
    serie = serie_completa(b.anual.get(m["cod_municipio_ibge"], []), ano_completo)
    ipne = None
    cresc = crescimento(serie, ano_completo, "acumulado")
    if m["ipne"] is not None:
        referencia = round(m["qtd_esperada"])
        espaco = referencia - m["qtd_instalacoes"]
        espaco_kw = m.get("_espaco_kw")
        ipne = {
            "score": int(m["ipne"]),
            "nivel": nivel_ipne(m["ipne"]),
            # quantas instalacoes o modelo espera pelo perfil da cidade
            "referencia": referencia,
            # positivo = espaco para crescer; negativo = ja acima do esperado pelo perfil
            "espaco": espaco,
            "espaco_kw": None if espaco_kw is None else round(espaco_kw),
            "em_linha": abs(m["diferenca_pct"]) < EM_LINHA,
            "manchete": manchete_ipne(espaco, m["diferenca_pct"], espaco_kw),
            "contexto": contexto_ipne(espaco, m["diferenca_pct"], m),
            "concordam": concordam(b, m),
            "discordam": discordam(b, m),
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
        "pct_apartamento": _arred(m.get("pct_apartamento"), 1),
        "apartamentos": muitos_apartamentos(m),
        "crescimento_instalacoes_pct": cresc,
        "crescimento_potencia_pct": crescimento(serie, ano_completo, "potencia_kw_acumulada"),
        "posicao_adocao": m["rank_adocao"],
        "ipne": ipne,
        "argumentos": argumentos(b, m, cresc, ano_completo),
        "ml": bloco_ml(b, m),
        "veredito_modelos": veredito_modelos(b, m),
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
        "argumentos": [],
        # soma do espaco positivo dos municipios (o que falta para cada cidade chegar ao esperado pelo perfil)
        "espaco": {
            "instalacoes": u["espaco"],
            "kw": round(u["espaco_kw"]),
            "municipios": u["municipios_com_espaco"],
            "por_mil_domicilios": round(u["espaco"] / u["qtd_domicilios"] * 1000, 1) if u["qtd_domicilios"] else None,
        },
        "referencias": {
            "aneel": u["periodo_referencia"], "ano_completo": u["ano_completo"],
            "populacao": u["ano_populacao"], "pib": u["ano_pib"],
        },
    }


def item_ranking(b: Base, m: dict, posicao: int, distancia: float | None = None) -> dict:
    espaco, espaco_kw = m.get("_espaco"), m.get("_espaco_kw")
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
        "manchete": None if m["ipne"] is None else manchete_ipne(espaco, m["diferenca_pct"], espaco_kw),
        "espaco": espaco,
        "espaco_kw": None if espaco_kw is None else round(espaco_kw),
        "diferenca_pct": m["diferenca_pct"],
        "concordam": concordam(b, m),
        "discordam": discordam(b, m),
        "apartamentos": muitos_apartamentos(m),
        "duvidoso": duvidoso(b, m),
        "distancia_km": None if distancia is None else round(distancia),
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
            # mesmo criterio do ranking de estados "por mil domicilios" (o mapa colore por este)
            "clientes_por_mil_domicilios": round(u["espaco"] / u["qtd_domicilios"] * 1000, 1)
            if u["qtd_domicilios"] and u["espaco"] else None,
        })
    return itens


@app.get("/api/ufs/{sigla}", tags=["dados"])
def uf(sigla: str, _: dict = Depends(auth.usuario_atual)):
    b = base()
    return resumo_uf(b, _uf(b, sigla))


@app.get("/api/ufs/{sigla}/municipios", tags=["dados"])
def municipios_da_uf(sigla: str, _: dict = Depends(auth.usuario_atual)):
    """Todos os municipios do estado com os numeros do mapa municipal e da lista do Explorar."""
    b = base()
    u = _uf(b, sigla)
    return [
        {
            "codigo": m["cod_municipio_ibge"],
            "nome": m["nom_municipio"],
            "populacao": m["populacao"],
            "instalacoes": m["qtd_instalacoes"],
            "inst_por_mil_hab": _arred(m["inst_por_mil_hab"], 1),
            "ipne": None if m["ipne"] is None else int(m["ipne"]),
        }
        for m in b.municipios.values() if m["sig_uf"] == u["sig_uf"]
    ]


@app.get("/api/ufs/{sigla}/historico", tags=["dados"])
def historico_uf(sigla: str, _: dict = Depends(auth.usuario_atual)):
    b = base()
    u = _uf(b, sigla)
    return serie_completa(b.anual_uf.get(u["sig_uf"], []), u["ano_completo"])


@app.get("/api/rankings", tags=["dados"])
def rankings(
    tipo: Literal["espaco", "oportunidade", "adocao", "populacao"] = "espaco",
    uf: str | None = Query(None, min_length=2, max_length=2),
    pop_min: int = Query(0, ge=0),
    base_mun: int | None = Query(None, alias="base", description="Codigo IBGE da cidade-base para o filtro por raio"),
    raio_km: int = Query(100, ge=10, le=1000),
    so_concordam: bool = Query(False, alias="concordam", description="So municipios onde IPNE e ML apontam espaco"),
    todas: bool = Query(False, description="Em 'espaco': nao manda para o fim as cidades com muitos predios ou modelos em desacordo"),
    limite: int = Query(5, ge=1, le=100),
    _: dict = Depends(auth.usuario_atual),
):
    """Ranking de municipios.

    - `espaco` (padrao): mais instalacoes faltando em relacao ao esperado pelo perfil
    - `oportunidade`: maior IPNE (espaco relativo ao tamanho da cidade)
    - `adocao`: mais instalacoes hoje
    - `populacao`: maiores cidades (sugestoes na escolha da cidade-base)

    Filtros: estado, porte, raio a partir de uma cidade-base e concordancia entre IPNE e Machine Learning.
    Em `espaco`, as cidades "duvidosas" (muitos predios ou modelos em desacordo) vao para o fim da lista,
    marcadas; `todas=true` devolve a ordem pura.
    """
    b = base()
    fonte = {"espaco": b.ranking_espaco, "oportunidade": b.ranking_oportunidade, "adocao": b.ranking_adocao,
             "populacao": b.ranking_populacao}[tipo]
    sigla = uf.upper() if uf else None
    centro = None
    if base_mun is not None:
        c = _municipio(b, base_mun)
        if c.get("latitude") is None:
            raise HTTPException(422, "Sem coordenadas para a cidade-base.")
        centro = (c["latitude"], c["longitude"])
    itens = []
    for m in fonte:
        if sigla and m["sig_uf"] != sigla:
            continue
        if (m["populacao"] or 0) < pop_min:
            continue
        dist = None
        if centro:
            if m.get("latitude") is None:
                continue
            dist = distancia_km(centro[0], centro[1], m["latitude"], m["longitude"])
            if dist > raio_km:
                continue
        if so_concordam and not concordam(b, m):
            continue
        itens.append((m, dist))
        if len(itens) == limite and (tipo != "espaco" or todas):
            break
    if tipo == "espaco" and not todas:
        # ordenacao estavel: dentro de cada grupo, continua do maior para o menor espaco
        itens.sort(key=lambda par: duvidoso(b, par[0]))
    return [item_ranking(b, m, pos, dist) for pos, (m, dist) in enumerate(itens[:limite], 1)]


@app.get("/api/rankings/estados", tags=["dados"])
def rankings_estados(
    ordem: Literal["absoluto", "relativo"] = "absoluto",
    limite: int = Query(5, ge=1, le=27),
    _: dict = Depends(auth.usuario_atual),
):
    """Estados pelo espaco para crescer: soma do que falta nos municipios para chegar ao esperado pelo perfil.

    `absoluto` ordena pelo total de instalacoes; `relativo`, por mil domicilios (sem favorecer os estados grandes).
    O DF fica de fora: sem IPNE, nao ha espaco estimado.
    """
    b = base()
    itens = []
    for s, u in b.ufs.items():
        if not u["espaco"]:
            continue
        itens.append({
            "codigo": s,
            "nome": UFS.get(s, s),
            "regiao": u["nom_regiao"],
            "espaco": u["espaco"],
            "espaco_kw": round(u["espaco_kw"]),
            "municipios_com_espaco": u["municipios_com_espaco"],
            "municipios": u["municipios"],
            "por_mil_domicilios": round(u["espaco"] / u["qtd_domicilios"] * 1000, 1) if u["qtd_domicilios"] else None,
            "manchete": f"Cerca de {compacto(u['espaco'])} clientes em potencial (~{potencia_curta(u['espaco_kw'])})",
        })
    if ordem == "absoluto":
        itens.sort(key=lambda i: -i["espaco"])
    else:
        itens.sort(key=lambda i: -(i["por_mil_domicilios"] or 0))
    for pos, i in enumerate(itens, 1):
        i["posicao"] = pos
    return itens[:limite]


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
