"""Generate semantic embeddings for the IntelliWheels catalog."""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import List

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB = BASE_DIR.parent / "intelliwheels.db"
OUTPUT_PATH = BASE_DIR / "car_embeddings.json"
DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def load_cars(db_path: Path) -> pd.DataFrame:
    if not db_path.exists():
        raise FileNotFoundError(f"Database not found at {db_path}")

    with sqlite3.connect(db_path) as conn:
        query = "SELECT id, make, model, year, specs, price, currency, rating FROM cars"
        df = pd.read_sql_query(query, conn)
    return df


def build_document(row: pd.Series) -> str:
    parts: List[str] = []
    parts.append(f"{row['make']} {row['model']}")
    if row.get("year"):
        parts.append(str(row["year"]))
    try:
        specs = json.loads(row["specs"]) if isinstance(row["specs"], str) else (row["specs"] or {})
    except json.JSONDecodeError:
        specs = {}

    for key in ("bodyStyle", "engine", "fuelEconomy"):
        value = specs.get(key)
        if value:
            parts.append(f"{key}: {value}")
    if row.get("rating"):
        parts.append(f"rating {row['rating']}")
    if row.get("price"):
        parts.append(f"price {row['price']} {row.get('currency', 'AED')}")
    return " | ".join(parts)


def main(db_path: Path, model_name: str) -> None:
    print(f"📥 Loading cars from {db_path}")
    df = load_cars(db_path)
    if df.empty:
        raise RuntimeError("No cars found to embed.")

    print(f"🧠 Loading embedding model: {model_name}")
    model = SentenceTransformer(model_name)

    docs = [build_document(row) for _, row in df.iterrows()]
    print(f"⚙️ Encoding {len(docs)} documents")
    embeddings = model.encode(docs, normalize_embeddings=True)

    payload = [
        {
            "car_id": int(row["id"]),
            "text": docs[idx],
            "embedding": embeddings[idx].tolist(),
        }
        for idx, (_, row) in enumerate(df.iterrows())
    ]

    OUTPUT_PATH.write_text(json.dumps(payload))
    print(f"✅ Saved embeddings to {OUTPUT_PATH}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build semantic embeddings for IntelliWheels cars")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL)
    args = parser.parse_args()
    main(args.db, args.model)
