"""Contas de usuario: senha com bcrypt + token JWT (Bearer).

Armazenamento: Postgres quando DATABASE_URL existe (Neon, no deploy), senao SQLite local.

Os usuarios ficam fora do Databricks de proposito: o Lake e para analise, nao para cadastro.
O token Bearer (em vez de cookie de sessao) e o que o futuro app Expo vai usar.
"""

from __future__ import annotations

import os
import re
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import config

ALGORITMO = "HS256"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Bloqueio simples contra forca bruta: 5 erros por e-mail em 5 minutos
MAX_FALHAS = 5
JANELA_FALHAS_S = 300
_falhas: dict[str, list[float]] = {}
_trava_falhas = threading.Lock()

_bearer = HTTPBearer(auto_error=False)


def _segredo_jwt() -> str:
    """SOLARDATA_JWT_SECRET, ou um segredo aleatorio gerado uma vez e guardado fora do Git."""
    if s := os.getenv("SOLARDATA_JWT_SECRET"):
        return s
    if config.SERVERLESS:
        # cada instancia teria um segredo diferente e os tokens parariam de valer entre elas
        raise RuntimeError("Defina SOLARDATA_JWT_SECRET no ambiente de deploy")
    arq = config.DIR_DADOS / ".jwt_secret"
    if not arq.exists():
        config.DIR_DADOS.mkdir(parents=True, exist_ok=True)
        arq.write_text(secrets.token_urlsafe(48), encoding="utf-8")
    return arq.read_text(encoding="utf-8").strip()


SEGREDO = _segredo_jwt()
_HASH_FALSO = bcrypt.hashpw(secrets.token_bytes(16), bcrypt.gensalt())
CAMINHO_DB = config.DIR_DADOS / "usuarios.db"
POSTGRES = bool(config.DATABASE_URL)

if POSTGRES:
    import psycopg
    from psycopg.rows import dict_row

    EmailDuplicado = psycopg.errors.UniqueViolation
else:
    EmailDuplicado = sqlite3.IntegrityError


def _sql(comando: str, params: tuple = (), *, todos: bool = False):
    """Executa um comando e devolve uma linha (ou todas). Placeholders escritos como `?`."""
    if POSTGRES:
        # conexao por chamada: no serverless nao ha processo longo para manter um pool
        with psycopg.connect(config.DATABASE_URL, row_factory=dict_row, connect_timeout=10) as con:
            cur = con.execute(comando.replace("?", "%s"), params)
            return (cur.fetchall() if todos else cur.fetchone()) if cur.description else None
    with sqlite3.connect(CAMINHO_DB) as con:
        con.row_factory = sqlite3.Row
        cur = con.execute(comando, params)
        return (cur.fetchall() if todos else cur.fetchone()) if cur.description else None


def inicializa() -> None:
    chave = "id SERIAL PRIMARY KEY" if POSTGRES else "id INTEGER PRIMARY KEY AUTOINCREMENT"
    if not POSTGRES:
        config.DIR_DADOS.mkdir(parents=True, exist_ok=True)
    _sql(f"""
        CREATE TABLE IF NOT EXISTS usuarios (
            {chave},
            nome TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            senha_hash TEXT NOT NULL,
            criado_em TEXT NOT NULL
        )
    """)


def _publico(row) -> dict:
    return {"id": row["id"], "nome": row["nome"], "email": row["email"]}


def _erro(codigo: int, msg: str) -> HTTPException:
    return HTTPException(status_code=codigo, detail=msg)


def valida_nome(nome: str) -> str:
    nome = " ".join(nome.split())
    if not 2 <= len(nome) <= 80:
        raise _erro(422, "Informe um nome entre 2 e 80 caracteres.")
    return nome


def cadastra(nome: str, email: str, senha: str) -> dict:
    nome = valida_nome(nome)
    email = email.strip().lower()
    if not EMAIL_RE.match(email) or len(email) > 254:
        raise _erro(422, "E-mail inválido.")
    if len(senha) < 8:
        raise _erro(422, "A senha precisa ter pelo menos 8 caracteres.")
    if len(senha.encode()) > 72:  # limite do bcrypt
        raise _erro(422, "A senha pode ter no máximo 72 caracteres.")

    senha_hash = bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()
    try:
        row = _sql(
            "INSERT INTO usuarios (nome, email, senha_hash, criado_em) VALUES (?, ?, ?, ?) RETURNING id, nome, email",
            (nome, email, senha_hash, datetime.now(timezone.utc).isoformat()),
        )
    except EmailDuplicado:
        raise _erro(409, "Já existe uma conta com este e-mail.") from None
    return _publico(row)


def autentica(email: str, senha: str) -> dict:
    email = email.strip().lower()
    agora = time.time()
    with _trava_falhas:
        recentes = [t for t in _falhas.get(email, []) if agora - t < JANELA_FALHAS_S]
        _falhas[email] = recentes
        if len(recentes) >= MAX_FALHAS:
            raise _erro(429, "Muitas tentativas. Aguarde alguns minutos e tente de novo.")

    row = _sql("SELECT * FROM usuarios WHERE email = ?", (email,))
    # Compara com um hash falso quando o e-mail nao existe, para o tempo de resposta nao revelar contas
    hash_ = row["senha_hash"].encode() if row else _HASH_FALSO
    ok = bcrypt.checkpw(senha.encode()[:72], hash_) and row is not None
    if not ok:
        with _trava_falhas:
            _falhas.setdefault(email, []).append(agora)
        raise _erro(401, "E-mail ou senha incorretos.")
    with _trava_falhas:
        _falhas.pop(email, None)
    return _publico(row)


def atualiza_nome(usuario_id: int, nome: str) -> dict:
    nome = valida_nome(nome)
    row = _sql("UPDATE usuarios SET nome = ? WHERE id = ? RETURNING id, nome, email", (nome, usuario_id))
    return _publico(row)


def emite_token(usuario: dict) -> str:
    agora = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(usuario["id"]), "iat": agora, "exp": agora + timedelta(days=config.JWT_EXPIRA_DIAS)},
        SEGREDO, algorithm=ALGORITMO,
    )


def usuario_atual(cred: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    """Dependencia FastAPI: exige `Authorization: Bearer <token>` valido."""
    nao_autorizado = HTTPException(
        status.HTTP_401_UNAUTHORIZED, "Sessão expirada. Entre novamente.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if cred is None:
        raise nao_autorizado
    try:
        dados = jwt.decode(cred.credentials, SEGREDO, algorithms=[ALGORITMO])
        usuario_id = int(dados["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise nao_autorizado from None
    row = _sql("SELECT id, nome, email FROM usuarios WHERE id = ?", (usuario_id,))
    if row is None:
        raise nao_autorizado
    return _publico(row)
