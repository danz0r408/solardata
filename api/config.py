"""Configuracao da API via variaveis de ambiente (nenhum segredo fica no codigo)."""

import os
import shutil
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DIR_DADOS = Path(__file__).resolve().parent / "data"
DIR_SNAPSHOT = DIR_DADOS / "snapshot"
DIR_WEB = RAIZ / "app"

# Perfil OAuth criado com `databricks auth login --profile solardata`
DATABRICKS_PROFILE = os.getenv("DATABRICKS_PROFILE", "solardata")
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
