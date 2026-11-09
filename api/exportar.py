"""Atualiza o snapshot versionado (api/snapshot/base.json.gz) a partir do Databricks.

Rodar depois de reprocessar os notebooks, antes do deploy:
    .venv/Scripts/python -m api.exportar
"""

import gzip
import json
from datetime import datetime, timezone

from . import config
from .dados import Repositorio


def main() -> None:
    tabelas = Repositorio()._busca_databricks()
    config.SNAPSHOT_EMBUTIDO.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(config.SNAPSHOT_EMBUTIDO, "wt", encoding="utf-8") as f:
        json.dump({"carregado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"), **tabelas},
                  f, ensure_ascii=False, separators=(",", ":"))
    kb = config.SNAPSHOT_EMBUTIDO.stat().st_size // 1024
    resumo = ", ".join(f"{nome}: {len(linhas)}" for nome, linhas in tabelas.items())
    print(f"{resumo} -> {config.SNAPSHOT_EMBUTIDO} ({kb} KB)")


if __name__ == "__main__":
    main()
