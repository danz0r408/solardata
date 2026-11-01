"""Leitura das tabelas gold `dmm_` do Databricks, com cache em memoria e snapshot local.

A API nunca le a camada silver (que tem CPF/CNPJ e nome de titular): so as tabelas
agregadas por municipio geradas pelos notebooks em `databricks/`.

Fluxo: a primeira requisicao carrega as tres tabelas do SQL Warehouse. Depois do TTL,
a proxima requisicao dispara uma recarga em segundo plano e continua respondendo com
os dados atuais. Toda carga bem-sucedida grava um snapshot em disco; se o Databricks
falhar, a API serve o snapshot e informa isso em `/api/status`.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone

from . import config

log = logging.getLogger("solardata.dados")

UFS = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia",
    "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás",
    "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais",
    "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí",
    "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte", "RS": "Rio Grande do Sul",
    "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo",
    "SE": "Sergipe", "TO": "Tocantins",
}

COLUNAS_RESUMO = [
    "cod_municipio_ibge", "nom_municipio", "sig_uf", "nom_regiao",
    "qtd_instalacoes", "potencia_kw", "qtd_uc_credito",
    "populacao", "ano_populacao", "pib_mil_reais", "ano_pib", "pib_per_capita_reais",
    "densidade_hab_km2", "inst_por_mil_hab", "kw_por_hab",
    "qtd_esperada", "diferenca_pct", "ipne", "rank_ipne", "rank_adocao",
    "ano_completo", "periodo_referencia",
]
COLUNAS_ANUAL = ["cod_municipio_ibge", "ano", "qtd_novas", "potencia_kw_nova"]
CONVERSORES = {
    "INT": int, "LONG": int, "BIGINT": int, "SHORT": int, "BYTE": int,
    "DOUBLE": float, "FLOAT": float, "DECIMAL": float,
}


def normaliza(texto: str) -> str:
    """Minusculas e sem acento, para busca."""
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower().strip()


# ---------------------------------------------------------------------------
# Acesso ao Databricks
# ---------------------------------------------------------------------------

class Databricks:
    def __init__(self) -> None:
        self._cliente = None
        self._warehouse = config.DATABRICKS_WAREHOUSE_ID

    def _conecta(self):
        if self._cliente is None:
            from databricks.sdk import WorkspaceClient  # import tardio: so quando precisa
            from databricks.sdk.config import Config

            # O perfil OAuth renova o token chamando a CLI; ela pode nao estar no PATH (winget no Windows)
            extra = {"databricks_cli_path": config.DATABRICKS_CLI} if config.DATABRICKS_CLI else {}
            self._cliente = WorkspaceClient(config=Config(profile=config.DATABRICKS_PROFILE, **extra))
            if not self._warehouse:
                self._warehouse = next(iter(self._cliente.warehouses.list())).id
        return self._cliente

    def consulta(self, sql: str, timeout_s: int = 180) -> list[dict]:
        from databricks.sdk.service.sql import Disposition, Format, StatementState

        w = self._conecta()
        resp = w.statement_execution.execute_statement(
            statement=sql, warehouse_id=self._warehouse, wait_timeout="50s",
            disposition=Disposition.INLINE, format=Format.JSON_ARRAY,
        )
        limite = time.monotonic() + timeout_s
        while resp.status.state in (StatementState.PENDING, StatementState.RUNNING):
            if time.monotonic() > limite:
                w.statement_execution.cancel_execution(resp.statement_id)
                raise TimeoutError("Databricks nao respondeu a tempo")
            time.sleep(1.5)
            resp = w.statement_execution.get_statement(resp.statement_id)
        if resp.status.state != StatementState.SUCCEEDED:
            erro = resp.status.error.message if resp.status.error else resp.status.state
            raise RuntimeError(f"Consulta falhou: {erro}")

        colunas = resp.manifest.schema.columns
        nomes = [c.name for c in colunas]
        conv = [CONVERSORES.get(str(c.type_name.value if c.type_name else ""), str) for c in colunas]

        linhas = list(resp.result.data_array or []) if resp.result else []
        proximo = resp.result.next_chunk_index if resp.result else None
        while proximo is not None:
            parte = w.statement_execution.get_statement_result_chunk_n(resp.statement_id, proximo)
            linhas.extend(parte.data_array or [])
            proximo = parte.next_chunk_index

        return [
            {n: (None if v is None else f(v)) for n, f, v in zip(nomes, conv, linha)}
            for linha in linhas
        ]


# ---------------------------------------------------------------------------
# Base em memoria
# ---------------------------------------------------------------------------

@dataclass
class Base:
    municipios: dict[int, dict]
    anual: dict[int, list[dict]]
    modelo: dict
    fonte: str  # "databricks" ou "snapshot"
    carregado_em: str
    ufs: dict[str, dict] = field(default_factory=dict)
    anual_uf: dict[str, list[dict]] = field(default_factory=dict)
    ranking_oportunidade: list[dict] = field(default_factory=list)
    ranking_adocao: list[dict] = field(default_factory=list)
    indice_busca: list[tuple[str, dict]] = field(default_factory=list)

    @classmethod
    def monta(cls, resumo: list[dict], anual: list[dict], modelo: dict, fonte: str, carregado_em: str) -> "Base":
        municipios = {m["cod_municipio_ibge"]: m for m in resumo}

        anual_mun: dict[int, list[dict]] = {}
        anual_uf_acc: dict[str, dict[int, list[float]]] = {}
        for linha in sorted(anual, key=lambda r: (r["cod_municipio_ibge"], r["ano"])):
            cod = linha["cod_municipio_ibge"]
            anual_mun.setdefault(cod, []).append(linha)
            uf = municipios[cod]["sig_uf"] if cod in municipios else None
            if uf:
                acc = anual_uf_acc.setdefault(uf, {}).setdefault(linha["ano"], [0, 0.0])
                acc[0] += linha["qtd_novas"]
                acc[1] += linha["potencia_kw_nova"]
        anual_uf = {
            uf: [{"ano": a, "qtd_novas": v[0], "potencia_kw_nova": v[1]} for a, v in sorted(anos.items())]
            for uf, anos in anual_uf_acc.items()
        }

        ufs: dict[str, dict] = {}
        for m in resumo:
            u = ufs.setdefault(m["sig_uf"], {
                "sig_uf": m["sig_uf"], "nom_regiao": m["nom_regiao"], "municipios": 0,
                "qtd_instalacoes": 0, "potencia_kw": 0.0, "qtd_uc_credito": 0, "populacao": 0, "pib_mil_reais": 0,
                "ano_populacao": m["ano_populacao"], "ano_pib": m["ano_pib"],
                "ano_completo": m["ano_completo"], "periodo_referencia": m["periodo_referencia"],
            })
            u["municipios"] += 1
            u["qtd_instalacoes"] += m["qtd_instalacoes"] or 0
            u["potencia_kw"] += m["potencia_kw"] or 0
            u["qtd_uc_credito"] += m["qtd_uc_credito"] or 0
            u["populacao"] += m["populacao"] or 0
            u["pib_mil_reais"] += m["pib_mil_reais"] or 0

        oportunidade = sorted((m for m in resumo if m["rank_ipne"] is not None), key=lambda m: m["rank_ipne"])
        adocao = sorted(resumo, key=lambda m: (-m["qtd_instalacoes"], m["nom_municipio"]))

        indice = [(normaliza(m["nom_municipio"]), m) for m in resumo]

        return cls(municipios, anual_mun, modelo, fonte, carregado_em, ufs, anual_uf, oportunidade, adocao, indice)


class Repositorio:
    """Guarda a Base atual e cuida de carga, recarga em segundo plano e snapshot."""

    def __init__(self, databricks: Databricks | None = None) -> None:
        self._db = databricks or Databricks()
        self._base: Base | None = None
        self._carregado_ts = 0.0
        self._trava = threading.Lock()
        self._pronta = threading.Event()
        self._recarregando = False
        self.ultimo_erro: str | None = None

    # -- carga --------------------------------------------------------------

    def _busca_databricks(self) -> tuple[list[dict], list[dict], dict]:
        cat = f"`{config.CATALOGO}`.gold"
        resumo = self._db.consulta(f"SELECT {', '.join(COLUNAS_RESUMO)} FROM {cat}.dmm_municipio_resumo")
        anual = self._db.consulta(f"SELECT {', '.join(COLUNAS_ANUAL)} FROM {cat}.dmm_kpi_municipio_anual")
        modelo = self._db.consulta(f"SELECT * FROM {cat}.dmm_ipne_modelo")
        return resumo, anual, (modelo[0] if modelo else {})

    def _grava_snapshot(self, resumo, anual, modelo, carregado_em) -> None:
        config.DIR_SNAPSHOT.mkdir(parents=True, exist_ok=True)
        tmp = config.DIR_SNAPSHOT / "base.json.tmp"
        tmp.write_text(json.dumps({
            "carregado_em": carregado_em, "resumo": resumo, "anual": anual, "modelo": modelo,
        }, ensure_ascii=False), encoding="utf-8")
        tmp.replace(config.DIR_SNAPSHOT / "base.json")

    def _le_snapshot(self) -> Base | None:
        arq = config.DIR_SNAPSHOT / "base.json"
        if not arq.exists():
            return None
        d = json.loads(arq.read_text(encoding="utf-8"))
        return Base.monta(d["resumo"], d["anual"], d["modelo"], "snapshot", d["carregado_em"])

    def carrega(self) -> None:
        """Carga sincrona: Databricks; se falhar e nao houver base, snapshot."""
        try:
            resumo, anual, modelo = self._busca_databricks()
            agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
            base = Base.monta(resumo, anual, modelo, "databricks", agora)
            try:
                self._grava_snapshot(resumo, anual, modelo, agora)
            except OSError:
                log.exception("Nao foi possivel gravar o snapshot")
            self.ultimo_erro = None
        except Exception as e:  # rede, auth expirada, warehouse indisponivel...
            log.warning("Falha ao carregar do Databricks: %s", e)
            self.ultimo_erro = str(e)
            if self._base is not None:
                base = self._base  # mantem o que ja temos e tenta de novo no proximo TTL
            else:
                base = self._le_snapshot()
                if base is None:
                    raise
        with self._trava:
            self._base = base
            self._carregado_ts = time.monotonic()
            self._recarregando = False
        self._pronta.set()

    def _recarrega_em_fundo(self) -> None:
        with self._trava:
            if self._recarregando:
                return
            self._recarregando = True

        def tarefa():
            try:
                self.carrega()
            except Exception:
                log.exception("Recarga falhou")
                with self._trava:
                    self._recarregando = False
                self._pronta.set()  # libera quem espera; sem base, a requisicao vira 503

        threading.Thread(target=tarefa, daemon=True).start()

    # -- acesso -------------------------------------------------------------

    def aquece(self) -> None:
        """Dispara a primeira carga sem bloquear (usado no startup e pela splash)."""
        if self._base is None and not self._recarregando:
            self._pronta.clear()
            self._recarrega_em_fundo()

    def base(self, espera_s: float = 120) -> Base:
        if self._base is None:
            self.aquece()
            if not self._pronta.wait(espera_s) or self._base is None:
                raise TimeoutError("Dados ainda carregando")
        elif time.monotonic() - self._carregado_ts > config.CACHE_TTL_S:
            self._recarrega_em_fundo()
        return self._base

    def status(self) -> dict:
        b = self._base
        return {
            "pronto": b is not None,
            "carregando": self._recarregando,
            "fonte": b.fonte if b else None,
            "carregado_em": b.carregado_em if b else None,
            # detalhe do erro fica so no log do servidor
            "databricks_ok": self.ultimo_erro is None,
        }
