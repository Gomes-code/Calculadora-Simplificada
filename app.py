from __future__ import annotations

import os
import sqlite3
import threading
import webbrowser
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "carbono_sinapi.db"
HOST = os.getenv("TPF_CALC_HOST", "127.0.0.1")
PORT = int(os.getenv("TPF_CALC_PORT", "5000"))

MISSING_DATA_MESSAGE = "s/dados escolha outra opção e informe a equipe de sustentabilidade"

SCENARIOS = {
    "min": "emissao_composicao_min",
    "med": "emissao_composicao_med",
    "max": "emissao_composicao_max",
}

app = Flask(__name__, template_folder=str(BASE_DIR / "templates"), static_folder=str(BASE_DIR / "static"))


@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response



def get_conn() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise FileNotFoundError(
            f"Banco de dados local não encontrado em {DB_PATH}. "
            "Rode python build_database.py para recriar o banco."
        )
    # No Vercel o sistema de arquivos é read-only, devemos forçar leitura
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}


@app.get("/")
def hub():
    return render_template("hub.html")


@app.get("/residencial")
def residencial():
    return render_template(
        "index.html",
        missing_message=MISSING_DATA_MESSAGE,
        app_version="Versão 5",
    )


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "database": str(DB_PATH), "exists": DB_PATH.exists()})


@app.get("/api/categories")
def categories():
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT category_key, label, helper, display_order
            FROM categories
            ORDER BY display_order ASC
            """
        ).fetchall()
    return jsonify([row_to_dict(row) for row in rows])


@app.get("/api/items/<category_key>")
def items(category_key: str):
    show_incomplete = request.args.get("show_incomplete", "1") in {"1", "true", "True", "sim", "yes"}
    search = (request.args.get("q") or "").strip().upper()

    query = """
        SELECT
            s.codigo_composicao,
            s.unidade,
            s.descricao,
            s.emissao_composicao_min,
            s.emissao_composicao_med,
            s.emissao_composicao_max,
            s.is_complete,
            c.priority
        FROM category_items c
        JOIN sinapi_items s ON s.codigo_composicao = c.codigo_composicao
        WHERE c.category_key = ?
    """
    params: list[Any] = [category_key]

    if not show_incomplete:
        query += " AND s.is_complete = 1"

    # Filtros para remover opções irrelevantes a pedido do usuário
    if "revestimento" in category_key:
        query += " AND s.descricao_norm NOT LIKE '%JANELA%' AND s.descricao_norm NOT LIKE '%EMBOCO%' AND s.descricao_norm NOT LIKE '%CHAPISCO%' AND s.descricao_norm NOT LIKE '%MASSA UNICA%' AND s.descricao_norm NOT LIKE '%REBOCO%'"
    
    # Exclusões globais para coisas que não deveriam estar nas categorias principais de emissão (se não forem explicitamente dessa categoria)
    query += " AND s.descricao_norm NOT LIKE '%PORTA%' AND s.descricao_norm NOT LIKE '%ESQUADRIA%'"

    if search:
        query += " AND (UPPER(s.codigo_composicao) LIKE ? OR UPPER(s.descricao) LIKE ?)"
        like = f"%{search}%"
        params.extend([like, like])

    query += """
        ORDER BY
            s.is_complete DESC,
            c.priority ASC,
            s.unidade ASC,
            s.codigo_composicao ASC
    """

    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
        
        codes = [r["codigo_composicao"] for r in rows]
        costs_dict = {c: {} for c in codes}
        if codes:
            placeholders = ",".join("?" * len(codes))
            cost_query = f"SELECT codigo_composicao, estado, custo FROM sinapi_costs WHERE codigo_composicao IN ({placeholders})"
            cost_rows = conn.execute(cost_query, codes).fetchall()
            for cr in cost_rows:
                costs_dict[cr["codigo_composicao"]][cr["estado"]] = cr["custo"]

    result = []
    for r in rows:
        d = row_to_dict(r)
        d["costs"] = costs_dict.get(d["codigo_composicao"], {})
        result.append(d)

    return jsonify(result)


@app.get("/api/search")
def global_search():
    q = (request.args.get("q") or "").strip().upper()
    try:
        limit = int(request.args.get("limit", "50"))
    except ValueError:
        limit = 50
    limit = max(1, min(limit, 100))
    if not q:
        return jsonify([])

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT codigo_composicao, unidade, descricao, emissao_composicao_min,
                   emissao_composicao_med, emissao_composicao_max, is_complete
            FROM sinapi_items
            WHERE UPPER(codigo_composicao) LIKE ? OR UPPER(descricao) LIKE ?
            ORDER BY is_complete DESC, codigo_composicao ASC
            LIMIT ?
            """,
            (f"%{q}%", f"%{q}%", limit),
        ).fetchall()
    return jsonify([row_to_dict(row) for row in rows])


def open_browser_once() -> None:
    if os.getenv("AUTO_OPEN_BROWSER", "1") not in {"1", "true", "True", "sim", "yes"}:
        return

    def _open() -> None:
        webbrowser.open_new(f"http://{HOST}:{PORT}")

    threading.Timer(1.0, _open).start()


if __name__ == "__main__":
    open_browser_once()
    app.run(host=HOST, port=PORT, debug=False, use_reloader=False)
