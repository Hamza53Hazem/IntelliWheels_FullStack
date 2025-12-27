"""Ingest the DriveArabia SQL dump (Engine Specs table) into SQLite."""
from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "intelliwheels.db"
SQL_DUMP_PATH = BASE_DIR / "data" / "Middle-East-GCC-Car-Database-by-Teoalida-SAMPLE.sql"

STAR_PATTERN = re.compile(r"star(\d+(?:\.\d+)?)", re.IGNORECASE)
CURRENCY_RATES = {
    "AED": 1.0,
    "SAR": 0.98,  # approx AED value for Saudi Riyal
}

@dataclass
class EngineRow:
    payload: Dict[str, str]

@dataclass
class CarGroup:
    make: str
    model: str
    year: int
    rows: List[EngineRow] = field(default_factory=list)
    images: List[str] = field(default_factory=list)
    metadata: Dict[str, str] = field(default_factory=dict)


def norm(value) -> str:
    """Normalize raw strings from the dump."""
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        return str(value).strip()
    text = str(value).strip()
    lowered = text.lower()
    if lowered in {"null", "none", "nan"}:
        return ""
    return text


def parse_year(value) -> Optional[int]:
    text = norm(value)
    if not text:
        return None
    try:
        year = int(text)
    except ValueError:
        return None
    if 1950 <= year <= 2035:
        return year
    return None


def parse_float(value) -> Optional[float]:
    text = norm(value)
    if not text:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def parse_int(value) -> Optional[int]:
    result = parse_float(value)
    return int(result) if result is not None else None


def parse_price_block(value: str, currency_hint: str = "AED") -> Optional[float]:
    text = norm(value)
    if not text:
        return None
    numbers = [int(chunk.replace(",", "")) for chunk in re.findall(r"(\d[\d,]*)", text) if chunk]
    if not numbers:
        return None
    avg = sum(numbers) / len(numbers)
    multiplier = CURRENCY_RATES.get(currency_hint.upper(), 1.0)
    return avg * multiplier


def extract_star_rating(value: str) -> Optional[float]:
    text = norm(value)
    if not text:
        return None
    match = STAR_PATTERN.search(text)
    if not match:
        return None
    try:
        rating = float(match.group(1))
        return min(max(rating, 0.0), 5.0)
    except ValueError:
        return None


def init_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS cars (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            make TEXT NOT NULL,
            model TEXT NOT NULL,
            year INTEGER,
            price REAL,
            currency TEXT DEFAULT 'AED',
            image_url TEXT,
            image_urls TEXT,
            gallery_images TEXT,
            media_gallery TEXT,
            video_url TEXT,
            rating REAL DEFAULT 0.0,
            reviews INTEGER DEFAULT 0,
            specs TEXT,
            engines TEXT,
            statistics TEXT,
            source_sheets TEXT,
            latitude REAL,
            longitude REAL,
            user_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS statistics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            car_id INTEGER,
            stat_name TEXT,
            stat_value TEXT,
            FOREIGN KEY (car_id) REFERENCES cars(id)
        )
        """
    )
    cursor.execute("PRAGMA table_info(cars)")
    columns = {column[1] for column in cursor.fetchall()}
    def ensure_column(name: str, definition: str) -> None:
        if name not in columns:
            cursor.execute(f"ALTER TABLE cars ADD COLUMN {definition}")
            columns.add(name)

    ensure_column('user_id', 'INTEGER')
    ensure_column('gallery_images', 'TEXT')
    ensure_column('media_gallery', 'TEXT')
    ensure_column('video_url', 'TEXT')

    conn.commit()
    conn.close()


def load_sql_dump(path: Path) -> List[Dict[str, str]]:
    """Load the MySQL dump by replaying it inside an in-memory SQLite DB."""
    if not path.exists():
        raise FileNotFoundError(f"SQL dump not found at {path}")

    raw_sql = path.read_text(encoding="utf-8")

    sanitized_lines: List[str] = []
    skip_comment = False
    for line in raw_sql.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("--"):
            continue
        if stripped.startswith("/*"):
            skip_comment = True
            if "*/" in stripped:
                skip_comment = False
            continue
        if skip_comment:
            if "*/" in stripped:
                skip_comment = False
            continue
        upper = stripped.upper()
        if upper.startswith(("SET ", "START TRANSACTION", "COMMIT", "UNLOCK TABLES", "LOCK TABLES")):
            continue
        if stripped.startswith("/*!") and stripped.endswith("*/;"):
            continue
        sanitized_lines.append(line)

    sanitized_sql = "\n".join(sanitized_lines)
    sanitized_sql = re.sub(r"/\*!.*?\*/;", "", sanitized_sql, flags=re.DOTALL)
    sanitized_sql = re.sub(r"\)\s*ENGINE=.*?;", ");", sanitized_sql, flags=re.IGNORECASE)
    sanitized_sql = sanitized_sql.replace("\\'", "''")

    conn = sqlite3.connect(":memory:")
    try:
        conn.executescript(sanitized_sql)
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(middle_east_gcc_car_database_sample)")
        columns = [column[1] for column in cursor.fetchall()]
        if not columns:
            raise RuntimeError("Failed to read table columns from SQL dump")
        cursor.execute("SELECT * FROM middle_east_gcc_car_database_sample")
        rows = cursor.fetchall()
        return [dict(zip(columns, row)) for row in rows]
    finally:
        conn.close()


def build_groups(records: Iterable[Dict[str, str]]) -> Dict[Tuple[str, str, int], CarGroup]:
    groups: Dict[Tuple[str, str, int], CarGroup] = {}
    for record in records:
        make = norm(record.get("Make"))
        model = norm(record.get("Model"))
        year = parse_year(record.get("Year"))
        if not (make and model and year):
            continue
        key = (make, model, year)
        group = groups.setdefault(key, CarGroup(make=make, model=model, year=year))
        group.rows.append(EngineRow(record))

        for img_field in ("Image 1", "Image 2"):
            url = norm(record.get(img_field))
            if url and url not in group.images:
                group.images.append(url)

        for meta_key, target in (
            ("Body Styles", "bodyStyle"),
            ("Class", "class"),
            ("Country of Origin", "country"),
            ("Weight", "weight"),
            ("Overview", "overview"),
            ("Good", "pros"),
            ("Bad", "cons"),
            ("Reliability", "reliability"),
            ("Resale Value", "resale"),
            ("Known Problems", "knownProblems"),
            ("NHTSA Driver Frontal Rating", "nhtsa"),
            ("EuroNCAP Overall Adult Rating", "euroNcap"),
        ):
            if target not in group.metadata or not group.metadata[target]:
                value = norm(record.get(meta_key))
                if value:
                    group.metadata[target] = value
    return groups


def derive_price(rows: Sequence[EngineRow]) -> Tuple[Optional[float], str]:
    prices: List[float] = []
    for row in rows:
        price_aed = parse_price_block(row.payload.get("Price UAE", ""), "AED")
        if price_aed:
            prices.append(price_aed)
            continue
        price_sar = parse_price_block(row.payload.get("Price KSA", ""), "SAR")
        if price_sar:
            prices.append(price_sar)
    if not prices:
        return None, "AED"
    return sum(prices) / len(prices), "AED"


def derive_rating(group: CarGroup) -> float:
    star_values = [
        extract_star_rating(group.metadata.get("reliability", "")),
        extract_star_rating(group.metadata.get("resale", "")),
    ]
    star_values = [value for value in star_values if value is not None]
    if star_values:
        return round(sum(star_values) / len(star_values), 1)
    seed = hash(f"{group.make}{group.model}{group.year}") % 15
    return round(4.0 + seed / 20.0, 1)


def serialize_engine(row: EngineRow) -> Dict[str, Optional[str]]:
    payload = row.payload
    return {
        "priceUAE": norm(payload.get("Price UAE")) or None,
        "priceKSA": norm(payload.get("Price KSA")) or None,
        "engine": norm(payload.get("Engine")) or None,
        "gearbox": norm(payload.get("Gearbox")) or None,
        "powerHp": parse_int(payload.get("Power (hp)")),
        "torqueNm": parse_int(payload.get("Torque (Nm)")),
        "fuelEconomyLPer100km": parse_float(payload.get("Fuel Econ (L/100km)")),
        "fuelEconomyKmPerL": parse_float(payload.get("Fuel Econ (km/L)")),
        "zeroToHundred": parse_float(payload.get("0-100 kph (sec)")),
        "topSpeedKph": parse_float(payload.get("Top speed (kph)")),
        "sourceUrl": norm(payload.get("URL")) or None,
    }


def prepare_specs(group: CarGroup) -> Dict[str, str]:
    specs = {
        "bodyStyle": group.metadata.get("bodyStyle"),
        "class": group.metadata.get("class"),
        "countryOfOrigin": group.metadata.get("country"),
        "weight": group.metadata.get("weight"),
        "overview": group.metadata.get("overview"),
        "pros": group.metadata.get("pros"),
        "cons": group.metadata.get("cons"),
    }
    return {k: v for k, v in specs.items() if v}


def prepare_statistics(group: CarGroup) -> Dict[str, str]:
    stats = {
        "reliability": group.metadata.get("reliability"),
        "resaleValue": group.metadata.get("resale"),
        "knownProblems": group.metadata.get("knownProblems"),
        "nhtsaRating": group.metadata.get("nhtsa"),
        "euroNcapRating": group.metadata.get("euroNcap"),
    }
    return {k: v for k, v in stats.items() if v}


def purge_seed_data(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM cars WHERE user_id IS NULL")
    rows = cursor.fetchall()
    if not rows:
        return
    ids = [row[0] for row in rows]
    placeholders = ",".join("?" for _ in ids)
    cursor.execute(f"DELETE FROM statistics WHERE car_id IN ({placeholders})", ids)
    cursor.execute(f"DELETE FROM cars WHERE id IN ({placeholders})", ids)
    conn.commit()


def insert_groups(groups: Dict[Tuple[str, str, int], CarGroup]) -> int:
    conn = sqlite3.connect(DB_PATH)
    purge_seed_data(conn)
    cursor = conn.cursor()
    inserted = 0
    for group in groups.values():
        price_value, currency = derive_price(group.rows)
        specs = prepare_specs(group)
        statistics_block = prepare_statistics(group)
        engines_payload = [serialize_engine(row) for row in group.rows]
        rating = derive_rating(group)
        reviews = (hash(f"reviews-{group.make}-{group.model}-{group.year}") % 400) + 80
        image_url = group.images[0] if group.images else None
        image_urls = json.dumps(group.images) if group.images else None
        gallery_images = json.dumps(group.images) if group.images else None
        media_gallery_payload = [
            {
                "type": "image",
                "url": url,
                "label": f"{group.make} {group.model} {group.year}",
                "source": "engine-specs-sql",
            }
            for url in group.images
        ]
        media_gallery = json.dumps(media_gallery_payload) if media_gallery_payload else None
        video_url = group.metadata.get("videoUrl") or group.metadata.get("Video")

        cursor.execute(
            """
            INSERT INTO cars (
                make, model, year, price, currency,
                image_url, image_urls, gallery_images, media_gallery, video_url,
                rating, reviews, specs, engines, statistics, source_sheets
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                group.make,
                group.model,
                group.year,
                price_value,
                currency,
                image_url,
                image_urls,
                gallery_images,
                media_gallery,
                video_url,
                rating,
                reviews,
                json.dumps(specs) if specs else None,
                json.dumps(engines_payload) if engines_payload else None,
                json.dumps(statistics_block) if statistics_block else None,
                json.dumps(["Engine Specs SQL"]),
            ),
        )
        inserted += 1

    conn.commit()
    conn.close()
    return inserted


def main() -> None:
    print("🚗 IntelliWheels SQL ingestion")
    print(f"📂 Reading dump: {SQL_DUMP_PATH}")
    records = load_sql_dump(SQL_DUMP_PATH)
    print(f"📥 Parsed {len(records)} raw engine rows")

    groups = build_groups(records)
    print(f"🧩 Consolidated into {len(groups)} make/model/year groups")

    init_db()
    inserted = insert_groups(groups)
    print(f"✅ Inserted {inserted} catalog entries into {DB_PATH}")


if __name__ == "__main__":
    main()

