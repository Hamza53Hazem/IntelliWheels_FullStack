import os, re, json
import pandas as pd
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text, bindparam, Integer

DB_URL = "postgresql+asyncpg://postgres:hamoz123@localhost:5432/intelliwheels_db"
XLSX = "/mnt/c/Users/hamze/Desktop/Capstone/IntelliWheels/IntelliWheels/cars.xlsx"  # adjust if needed


# --- helpers ---
def norm(s):
    if s is None:
        return ""
    # pandas treats pd.NA/NaN differently; normalize all empties to ""
    if isinstance(s, float) and pd.isna(s):
        return ""
    if pd.isna(s):
        return ""
    text = str(s).strip()
    if text.lower() in {"nan", "none", "null"}:
        return ""
    return text

def parse_naming(naming: str):
    """
    Try to split 'Naming' into (make, model, year).
    Heuristics:
      - last 4-digit token = year (1950..2035)
      - first token = make
      - middle = model
    """
    s = norm(naming)
    if not s:
        return ("", "", None)
    tokens = s.split()
    year = None
    if tokens and re.fullmatch(r"\d{4}", tokens[-1]):
        y = int(tokens[-1])
        if 1950 <= y <= 2035:
            year = y
            tokens = tokens[:-1]
    if not tokens:
        return ("", "", year)
    make = tokens[0]
    model = " ".join(tokens[1:]) if len(tokens) > 1 else ""
    return (make, model, year)

def clean_cols(df):
    df.columns = [c.strip() for c in df.columns]
    return df

def dict_without(keys, row_dict):
    cleaned = {}
    for k, v in row_dict.items():
        if k in keys:
            continue
        if k.lower().startswith("unnamed"):
            continue
        if pd.isna(v):
            continue
        if isinstance(v, str):
            nv = norm(v)
            if not nv:
                continue
            cleaned[k] = nv
        else:
            cleaned[k] = v
    return cleaned

async def main():
    engine = create_async_engine(DB_URL, echo=False, future=True)
    xls = pd.ExcelFile(XLSX)
    sheets = xls.sheet_names
    print("Sheets:", sheets)

    # 1) Base: Make-Model-Year
    base = pd.read_excel(xls, "Make-Model-Year", header=0)
    base = clean_cols(base)
    # normalize key fields
    for col in ["Make", "Model", "Year", "URL", "Image URL"]:
        if col not in base.columns:
            base[col] = None
    base["Make"] = base["Make"].map(norm)
    base["Model"] = base["Model"].map(norm)
    # try to coerce year
    base["Year"] = pd.to_numeric(base["Year"], errors="coerce").astype("Int64")
    base["URL"] = base["URL"].map(norm)
    base["Image URL"] = base["Image URL"].map(norm)

    # 2) Backfill from Make-Model (images/urls)
    if "Make-Model" in sheets:
        mm = pd.read_excel(xls, "Make-Model", header=0)
        mm = clean_cols(mm)
        for col in ["Make", "Model", "URL", "Image URL"]:
            if col not in mm.columns:
                mm[col] = None
        mm["Make"] = mm["Make"].map(norm)
        mm["Model"] = mm["Model"].map(norm)
        mm["URL"] = mm["URL"].map(norm)
        mm["Image URL"] = mm["Image URL"].map(norm)
        # merge
        base = base.merge(
            mm[["Make","Model","URL","Image URL"]],
            on=["Make","Model"],
            how="left",
            suffixes=("", "_mm")
        )
        # prefer year sheet values; fill gaps from mm
        base["URL"] = base["URL"].where(base["URL"]!="", base["URL_mm"])
        base["Image URL"] = base["Image URL"].where(base["Image URL"]!="", base["Image URL_mm"])
        base = base.drop(columns=[c for c in ["URL_mm","Image URL_mm"] if c in base.columns])

    # 3) Specs from Basic Specs
    specs_map = {}  # key -> dict specs
    if "Basic Specs" in sheets:
        bs = pd.read_excel(xls, "Basic Specs", header=0)
        bs = clean_cols(bs)
        # ensure 'Naming' exists
        if "Naming" in bs.columns:
            for _, r in bs.iterrows():
                naming = r.get("Naming", "")
                make, model, year = parse_naming(naming)
                if not make or not model:
                    continue
                key = (make.lower(), model.lower(), int(year) if year is not None else None)
                row_dict = dict(r)
                specs = dict_without(keys=["Naming"], row_dict=row_dict)
                # also drop any 'Unnamed: x' keys with empty values
                specs = {k: v for k, v in specs.items() if not k.startswith("Unnamed") and norm(v) != ""}
                if key not in specs_map:
                    specs_map[key] = {}
                specs_map[key].update(specs)

    # 4) Engines from Engine Specs (group many per key)
    engines_map = {}  # key -> list of engine dicts
    if "Engine Specs" in sheets:
        es = pd.read_excel(xls, "Engine Specs", header=0)
        es = clean_cols(es)
        if "Naming" in es.columns:
            for _, r in es.iterrows():
                naming = r.get("Naming", "")
                make, model, year = parse_naming(naming)
                if not make or not model:
                    continue
                key = (make.lower(), model.lower(), int(year) if year is not None else None)
                row_dict = dict(r)
                engine = dict_without(keys=["Naming"], row_dict=row_dict)
                engine = {k: v for k, v in engine.items() if not k.startswith("Unnamed") and norm(v) != ""}
                if not engine:
                    continue
                engines_map.setdefault(key, []).append(engine)

    # 5) Build output rows
    rows = []
    for _, r in base.iterrows():
        make = norm(r.get("Make"))
        model = norm(r.get("Model"))
        year = r.get("Year")
        try:
            y_int = int(year) if pd.notna(year) else None
        except Exception:
            y_int = None

        if not make or not model:
            continue
        key = (make.lower(), model.lower(), y_int)
        specs = specs_map.get(key, {})
        engines = engines_map.get(key, [])

        row = {
            "make": make,
            "model": model,
            "year": y_int,
            "url": norm(r.get("URL")),
            "image_url": norm(r.get("Image URL")),
            "specs": specs if specs else None,
            "engines": engines if engines else None,
            "source_sheets": ["Make-Model-Year"] + (["Make-Model"] if "Make-Model" in sheets else []) + (["Basic Specs"] if specs else []) + (["Engine Specs"] if engines else [])
        }
        rows.append(row)

    print(f"Prepared {len(rows)} base rows")

    # 6) Insert into Postgres
    insert_stmt = text("""
        INSERT INTO car_catalog (make, model, year, url, image_url, specs, engines, source_sheets)
        VALUES (:make, :model, :year, :url, :image_url, CAST(:specs AS jsonb), CAST(:engines AS jsonb), :sheets)
        ON CONFLICT DO NOTHING
    """).bindparams(
        bindparam("year", type_=Integer())
    )

    async with engine.begin() as conn:
        for item in rows:
            await conn.execute(
                insert_stmt,
                {
                    "make": item["make"],
                    "model": item["model"],
                    "year": item["year"],
                    "url": item["url"],
                    "image_url": item["image_url"],
                    "specs": json.dumps(item["specs"]) if item["specs"] is not None else None,
                    "engines": json.dumps(item["engines"]) if item["engines"] is not None else None,
                    "sheets": item["source_sheets"],
                }
            )

    await engine.dispose()
    print("✅ car_catalog populated.")

if __name__ == "__main__":
    asyncio.run(main())
