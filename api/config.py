"""Configuracao da API via variaveis de ambiente (nenhum segredo fica no codigo)."""

import os
import shutil
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
# Banco de usuarios, segredo JWT e snapshot. Em servidor, aponte para um volume persistente.
DIR_DADOS = Path(os.getenv("SOLARDATA_DATA_DIR", Path(__file__).resolve().parent / "data"))
DIR_SNAPSHOT = DIR_DADOS / "snapshot"
# Snapshot que vai junto com o codigo no deploy: usado se o volume ainda nao tiver um
SNAPSHOT_EMBUTIDO = Path(__file__).resolve().parent / "data" / "snapshot" / "base.json"
DIR_WEB = RAIZ / "app"

# Local: perfil OAuth criado com `databricks auth login --profile solardata`.
# Servidor: defina DATABRICKS_HOST + DATABRICKS_TOKEN (ou DATABRICKS_CLIENT_ID/SECRET de service principal)
# e o perfil e ignorado.
DATABRICKS_PROFILE = "" if os.getenv("DATABRICKS_HOST") else os.getenv("DATABRICKS_PROFILE", "solardata")
# Se vazio, usa o primeiro SQL Warehouse do workspace
DATABRICKS_WAREHOUSE_ID = os.getenv("DATABRICKS_WAREHOUSE_ID", "")
CATALOGO = os.getenv("SOLARDATA_CATALOGO", "pi-6")


def _acha_cli() -> str:
    if caminho := os.getenv("DATABRICKS_CLI_PATH") or shutil.which("databricks"):
        return caminho
    winget = Path(os.getenv("LOCALAPPDATA", "")) / "Microsoft/WinGet/Packages"
    achados = sorted(winget.glob("Databricks.DatabricksCLI_*/databricks.exe")) if winget.exists() else []
    return str(achados[0]) if achados else ""


DATABRICKS_CLI = _acha_cli()

# Por quanto tempo os dados em memoria valem antes de buscar de novo no Databricks
CACHE_TTL_S = int(os.getenv("SOLARDATA_CACHE_TTL_S", "600"))

JWT_EXPIRA_DIAS = int(os.getenv("SOLARDATA_JWT_EXPIRA_DIAS", "7"))

CORS_ORIGENS = [o for o in os.getenv("SOLARDATA_CORS", "*").split(",") if o]
