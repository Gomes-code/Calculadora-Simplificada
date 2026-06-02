from __future__ import annotations

from pathlib import Path
import sqlite3
import unicodedata

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
XLSX_PATH = DATA_DIR / "BD sinapi.xlsx"
DB_PATH = DATA_DIR / "carbono_sinapi.db"

REQUIRED_COLUMNS = [
    "codigo_composicao",
    "unidade",
    "descricao",
    "emissao_composicao_min",
    "emissao_composicao_med",
    "emissao_composicao_max",
    "is_complete",
]

CATEGORIES = [
    (
        "alvenaria_interna",
        "Alvenaria interna",
        "Alvenarias de vedação/embasamento. Use a área interna de parede ou a taxa de conversão quando a unidade não for m².",
    ),
    (
        "alvenaria_externa",
        "Alvenaria externa",
        "Alvenarias de vedação/embasamento. Use a área externa de parede ou a taxa de conversão quando a unidade não for m².",
    ),
    (
        "revestimento_parede_interno",
        "Revestimento interno - paredes",
        "Chapisco, emboço, massa única, pintura, textura, gesso e revestimentos internos de parede.",
    ),
    (
        "revestimento_parede_externo",
        "Revestimento externo - paredes/fachadas",
        "Itens de fachada, uso externo e revestimentos de paredes externas.",
    ),
    (
        "piso_interno",
        "Revestimento de piso interno",
        "Pisos, contrapiso, ladrilho, granilite, vinílico, laminado e lastros de piso sem indicação externa.",
    ),
    (
        "piso_externo",
        "Revestimento de piso externo",
        "Calçadas, passeios, pavimentos, intertravados, bloquetes, pavers e pisos externos.",
    ),
    (
        "infra_fundacao",
        "Infraestrutura / fundação",
        "Fundações, estacas, sapatas, radier, baldrame, tubulões, brocas e blocos de coroamento.",
    ),
    (
        "superestrutura",
        "Superestrutura - pilares, vigas e lajes",
        "Lista restrita a composições relacionadas a pilares, vigas e lajes. Escadas, cortinas, fundações, lastros e itens de piso foram removidos.",
    ),
    (
        "telhado",
        "Telhamento - tipo de telha",
        "Lista restrita a composições iniciadas por TELHAMENTO, focando no tipo de telha utilizado. Janelas, calhas, tramas, tesouras e acessórios foram removidos.",
    ),
]


def normalize_text(value: object) -> str:
    if pd.isna(value):
        return ""
    text = str(value)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    return text.upper().strip()


def clean_code(value: object) -> str:
    if pd.isna(value):
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def parse_bool(value: object) -> int:
    if pd.isna(value):
        return 0
    if isinstance(value, bool):
        return int(value)
    text = str(value).strip().lower()
    return int(text in {"true", "verdadeiro", "1", "sim", "yes", "y"})


def contains(series: pd.Series, pattern: str) -> pd.Series:
    return series.str.contains(pattern, regex=True, na=False)


def build_rules(df: pd.DataFrame) -> dict[str, pd.Series]:
    norm = df["descricao_norm"]
    unidade = df["unidade"].astype(str).str.upper().str.strip()

    common_exclude = contains(
        norm,
        r"\bTRANSPORTE\b|\bRETIRADA\b|\bRECOLOCACAO\b|\bDEMOLICAO\b|\bREMOCAO\b|"
        r"\bCARGA\b|\bDESCARGA\b|\bLOCACAO\b|\bALUGUEL\b|\bMOBILIZACAO\b|"
        r"\bDESMOBILIZACAO\b|\bLIMPEZA\b|\bMANUTENCAO\b|\bREPARO\b|\bRECOMPOSICAO\b",
    )

    alvenaria = norm.str.startswith("ALVENARIA") & unidade.isin(["M2", "M3"]) & ~common_exclude

    wall_keywords = (
        r"CHAPISCO|EMBOCO|MASSA UNICA|REBOCO|REVESTIMENTO CERAMICO.*PAREDE|"
        r"REVESTIMENTO.*PAREDE|PINTURA|TEXTURA|GESSO"
    )

    revestimento_parede_interno = (
        contains(norm, wall_keywords)
        & unidade.isin(["M2"])
        & ~contains(norm, r"FACHADA|EXTERNO|EXTERNA|PISO|CALCADA|PASSEIO|PAVIMENTO|TELHA|TELHADO")
        & ~common_exclude
    )

    revestimento_parede_externo = (
        contains(norm, wall_keywords)
        & unidade.isin(["M2"])
        & contains(norm, r"FACHADA|EXTERNO|EXTERNA")
        & ~contains(norm, r"PISO|CALCADA|PASSEIO|PAVIMENTO|TELHA|TELHADO")
        & ~common_exclude
    )

    piso_interno = (
        contains(
            norm,
            r"CONTRAPISO|PISO|REVESTIMENTO CERAMICO.*PISO|PORCELANATO|GRANILITE|"
            r"LADRILHO|CARPETE|LAMINADO|VINILICO|LASTRO",
        )
        & unidade.isin(["M2"])
        & ~contains(norm, r"CALCADA|PASSEIO|INTERTRAVADO|BLOQUETE|PAVIMENTO|PAVER|EXTERNO|EXTERNA|TELHA|TELHADO")
        & ~common_exclude
    )

    piso_externo = (
        contains(norm, r"CALCADA|PASSEIO|PAVIMENTO|INTERTRAVADO|BLOQUETE|PAVER|PISO EXTERNO|PISO DRENANTE")
        & unidade.isin(["M2", "M"])
        & ~common_exclude
    )

    infra_fundacao = (
        contains(norm, r"FUNDACAO|ESTACA|SAPATA|RADIER|BALDRAME|BLOCO DE COROAMENTO|TUBULAO|BROCA|VIGA BALDRAME")
        & ~contains(norm, r"EXCETO FUNDACAO")
        & ~common_exclude
    )

    # Superestrutura: somente itens associados diretamente a pilares, vigas e lajes.
    # Removidos falsos positivos como escadas, cortinas de contenção, paredes de concreto,
    # lastros de piso/laje sobre solo, fundações, muros e itens de cobertura.
    superestrutura = (
        contains(norm, r"\bPILAR\b|\bPILARES\b|\bVIGA\b|\bVIGAS\b|\bLAJE\b|\bLAJES\b")
        & ~contains(
            norm,
            r"ESCADA|ESCADAS|CORTINA|CONTENCAO|PAREDES DE CONCRETO|PAREDE DE CONCRETO|"
            r"LASTRO|PISO|SOBRE SOLO|BALDRAME|FUNDACAO|ESTACA|SAPATA|RADIER|"
            r"MURO|ARRIMO|ALVENARIA|VERGA|CONTRAVERGA|CINTA|CANALETA|CALHA|"
            r"TELHA|TELHADO|TELHAMENTO|COBERTURA|TESOURA|SUPORTE|PAINEL SOLAR|COLETOR|PASSANTE|ELETRODUTO|FIXADO EM LAJE|BASE DE FIXACAO|EXCETO|GUARDA-CORPO|GUARDA CORPO",
        )
        & ~common_exclude
    )

    # Telhado: somente composições de telhamento, ou seja, o serviço que materializa
    # a escolha do tipo de telha. Isso evita janelas, calhas, tramas, tesouras e acessórios.
    telhado = contains(norm, r"^TELHAMENTO\b|\bTELHAMENTO\b") & unidade.isin(["M2"]) & ~common_exclude

    return {
        "alvenaria_interna": alvenaria,
        "alvenaria_externa": alvenaria,
        "revestimento_parede_interno": revestimento_parede_interno,
        "revestimento_parede_externo": revestimento_parede_externo,
        "piso_interno": piso_interno,
        "piso_externo": piso_externo,
        "infra_fundacao": infra_fundacao,
        "superestrutura": superestrutura,
        "telhado": telhado,
    }


def unit_priority(category_key: str, unidade: str) -> int:
    unidade = str(unidade).upper().strip()
    preferred = {
        "alvenaria_interna": ["M2", "M3"],
        "alvenaria_externa": ["M2", "M3"],
        "revestimento_parede_interno": ["M2"],
        "revestimento_parede_externo": ["M2"],
        "piso_interno": ["M2"],
        "piso_externo": ["M2", "M"],
        "infra_fundacao": ["M3", "M2", "M", "KG", "UN"],
        "superestrutura": ["M3", "M2", "KG", "M", "UN"],
        "telhado": ["M2"],
    }
    order = preferred.get(category_key, [])
    return order.index(unidade) if unidade in order else 99


def create_database() -> None:
    if not XLSX_PATH.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {XLSX_PATH}")

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_excel(XLSX_PATH, sheet_name="SINAPI_SINTETICO")
    df = df.drop(columns=[col for col in df.columns if str(col).startswith("Unnamed")], errors="ignore")

    missing = [col for col in REQUIRED_COLUMNS if col not in df.columns]
    if missing:
        raise ValueError(f"Colunas obrigatórias ausentes: {missing}")

    df = df[REQUIRED_COLUMNS].copy()
    df["codigo_composicao"] = df["codigo_composicao"].apply(clean_code)
    df["unidade"] = df["unidade"].astype(str).str.upper().str.strip()
    df["descricao"] = df["descricao"].fillna("").astype(str)
    df["descricao_norm"] = df["descricao"].apply(normalize_text)
    df["is_complete"] = df["is_complete"].apply(parse_bool)

    COSTS_XLSX = DATA_DIR / "SINAPI_Referência_2026_02.xlsx"
    if COSTS_XLSX.exists():
        df_costs = pd.read_excel(COSTS_XLSX, sheet_name="CSE", header=None)
        
        state_cols = {}
        for i in range(4, len(df_costs.columns), 2):
            val = str(df_costs.iloc[8, i]).strip()
            if len(val) == 2:
                state_cols[val] = i
        
        df_costs = df_costs.iloc[10:].copy()
        df_costs[2] = df_costs[2].apply(normalize_text)
        
        desc_to_costs = {}
        for _, row in df_costs.iterrows():
            desc = row[2]
            if not desc: continue
            desc_to_costs[desc] = {st: pd.to_numeric(row[idx], errors="coerce") for st, idx in state_cols.items()}
        
        costs_records = []
        for idx, row in df.iterrows():
            code = row["codigo_composicao"]
            desc = row["descricao_norm"]
            c_dict = desc_to_costs.get(desc, {})
            for st, val in c_dict.items():
                if pd.notna(val) and val > 0:
                    costs_records.append((code, st, float(val)))
        
        df_costs_records = pd.DataFrame(costs_records, columns=["codigo_composicao", "estado", "custo"])
    else:
        df_costs_records = pd.DataFrame(columns=["codigo_composicao", "estado", "custo"])

    for col in ["emissao_composicao_min", "emissao_composicao_med", "emissao_composicao_max"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    rules = build_rules(df)

    if DB_PATH.exists():
        DB_PATH.unlink()

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute(
            """
            CREATE TABLE sinapi_items (
                codigo_composicao TEXT PRIMARY KEY,
                unidade TEXT NOT NULL,
                descricao TEXT NOT NULL,
                descricao_norm TEXT NOT NULL,
                emissao_composicao_min REAL NOT NULL,
                emissao_composicao_med REAL NOT NULL,
                emissao_composicao_max REAL NOT NULL,
                is_complete INTEGER NOT NULL CHECK (is_complete IN (0, 1))
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE categories (
                category_key TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                helper TEXT,
                display_order INTEGER NOT NULL
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE category_items (
                category_key TEXT NOT NULL,
                codigo_composicao TEXT NOT NULL,
                priority INTEGER NOT NULL,
                PRIMARY KEY (category_key, codigo_composicao),
                FOREIGN KEY (category_key) REFERENCES categories(category_key),
                FOREIGN KEY (codigo_composicao) REFERENCES sinapi_items(codigo_composicao)
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE sinapi_costs (
                codigo_composicao TEXT NOT NULL,
                estado TEXT NOT NULL,
                custo REAL NOT NULL,
                PRIMARY KEY (codigo_composicao, estado),
                FOREIGN KEY (codigo_composicao) REFERENCES sinapi_items(codigo_composicao)
            );
            """
        )

        df[
            [
                "codigo_composicao",
                "unidade",
                "descricao",
                "descricao_norm",
                "emissao_composicao_min",
                "emissao_composicao_med",
                "emissao_composicao_max",
                "is_complete",
            ]
        ].to_sql("sinapi_items", conn, if_exists="append", index=False)

        for display_order, (category_key, label, helper) in enumerate(CATEGORIES, start=1):
            conn.execute(
                "INSERT INTO categories(category_key, label, helper, display_order) VALUES (?, ?, ?, ?)",
                (category_key, label, helper, display_order),
            )

            selected = df.loc[rules[category_key]].copy()
            selected["unit_priority"] = selected["unidade"].apply(lambda u: unit_priority(category_key, u))
            selected["complete_priority"] = 1 - selected["is_complete"]
            selected = selected.sort_values(
                by=["complete_priority", "unit_priority", "emissao_composicao_med", "codigo_composicao"],
                ascending=[True, True, False, True],
            )

            for idx, row in selected.reset_index(drop=True).iterrows():
                conn.execute(
                    "INSERT OR IGNORE INTO category_items(category_key, codigo_composicao, priority) VALUES (?, ?, ?)",
                    (category_key, row["codigo_composicao"], int(idx + 1)),
                )

        conn.execute("CREATE INDEX idx_category_items_category ON category_items(category_key);")
        conn.execute("CREATE INDEX idx_sinapi_complete ON sinapi_items(is_complete);")
        
        df_costs_records.to_sql("sinapi_costs", conn, if_exists="append", index=False)
        
        conn.commit()

    print(f"Banco criado em: {DB_PATH}")
    for category_key, label, _ in CATEGORIES:
        count = int(rules[category_key].sum())
        print(f"- {label}: {count} composições")


if __name__ == "__main__":
    create_database()
