"""
Ingest Excel data from all 5 sheets into SQLite database
"""
import pandas as pd
import sqlite3
import json
import re
import os

DB_PATH = 'intelliwheels.db'
XLSX_PATH = 'cars.xlsx'

def norm(s):
    """Normalize string values"""
    if s is None:
        return ""
    if isinstance(s, float) and pd.isna(s):
        return ""
    if pd.isna(s):
        return ""
    text = str(s).strip()
    if text.lower() in {"nan", "none", "null"}:
        return ""
    return text

def parse_naming(naming: str):
    """Parse naming string into make, model, year"""
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
    """Clean column names"""
    df.columns = [c.strip() for c in df.columns]
    return df

def dict_without(keys, row_dict):
    """Remove specified keys and clean values"""
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

def init_db():
    """Initialize database"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cars (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            make TEXT NOT NULL,
            model TEXT NOT NULL,
            year INTEGER,
            price REAL,
            currency TEXT DEFAULT 'AED',
            image_url TEXT,
            image_urls TEXT,
            rating REAL DEFAULT 0.0,
            reviews INTEGER DEFAULT 0,
            specs TEXT,
            engines TEXT,
            statistics TEXT,
            source_sheets TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS statistics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            car_id INTEGER,
            stat_name TEXT,
            stat_value TEXT,
            FOREIGN KEY (car_id) REFERENCES cars(id)
        )
    ''')
    
    conn.commit()
    conn.close()

def main():
    """Main ingestion function"""
    print("📊 Starting Excel data ingestion...")
    
    if not os.path.exists(XLSX_PATH):
        print(f"❌ Error: {XLSX_PATH} not found!")
        return
    
    init_db()
    
    xls = pd.ExcelFile(XLSX_PATH)
    sheets = xls.sheet_names
    print(f"📑 Found {len(sheets)} sheets: {', '.join(sheets)}")
    
    # 1) Base: Make-Model-Year
    print("\n📖 Reading Make-Model-Year sheet...")
    base = pd.read_excel(xls, "Make-Model-Year", header=0)
    base = clean_cols(base)
    
    for col in ["Make", "Model", "Year", "URL", "Image URL"]:
        if col not in base.columns:
            base[col] = None
    
    base["Make"] = base["Make"].map(norm)
    base["Model"] = base["Model"].map(norm)
    base["Year"] = pd.to_numeric(base["Year"], errors="coerce").astype("Int64")
    base["URL"] = base["URL"].map(norm)
    base["Image URL"] = base["Image URL"].map(norm)
    
    # 2) Backfill from Make-Model
    if "Make-Model" in sheets:
        print("📖 Reading Make-Model sheet...")
        mm = pd.read_excel(xls, "Make-Model", header=0)
        mm = clean_cols(mm)
        
        for col in ["Make", "Model", "URL", "Image URL"]:
            if col not in mm.columns:
                mm[col] = None
        
        mm["Make"] = mm["Make"].map(norm)
        mm["Model"] = mm["Model"].map(norm)
        mm["URL"] = mm["URL"].map(norm)
        mm["Image URL"] = mm["Image URL"].map(norm)
        
        base = base.merge(
            mm[["Make", "Model", "URL", "Image URL"]],
            on=["Make", "Model"],
            how="left",
            suffixes=("", "_mm")
        )
        
        base["URL"] = base["URL"].where(base["URL"] != "", base["URL_mm"])
        base["Image URL"] = base["Image URL"].where(
            base["Image URL"] != "", base["Image URL_mm"]
        )
        base = base.drop(columns=[c for c in ["URL_mm", "Image URL_mm"] if c in base.columns])
    
    # 3) Specs from Basic Specs
    specs_map = {}
    if "Basic Specs" in sheets:
        print("📖 Reading Basic Specs sheet...")
        bs = pd.read_excel(xls, "Basic Specs", header=0)
        bs = clean_cols(bs)
        
        if "Naming" in bs.columns:
            for _, r in bs.iterrows():
                naming = r.get("Naming", "")
                make, model, year = parse_naming(naming)
                if not make or not model:
                    continue
                key = (make.lower(), model.lower(), int(year) if year is not None else None)
                row_dict = dict(r)
                specs = dict_without(keys=["Naming"], row_dict=row_dict)
                specs = {k: v for k, v in specs.items() 
                        if not k.startswith("Unnamed") and norm(v) != ""}
                if key not in specs_map:
                    specs_map[key] = {}
                specs_map[key].update(specs)
    
    # 4) Engines from Engine Specs
    engines_map = {}
    if "Engine Specs" in sheets:
        print("📖 Reading Engine Specs sheet...")
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
                engine = {k: v for k, v in engine.items() 
                         if not k.startswith("Unnamed") and norm(v) != ""}
                if not engine:
                    continue
                engines_map.setdefault(key, []).append(engine)
    
    # 5) Statistics from Statistics sheet
    statistics_map = {}
    if "Statistics" in sheets:
        print("📖 Reading Statistics sheet...")
        stats = pd.read_excel(xls, "Statistics", header=0)
        stats = clean_cols(stats)
        
        if "Naming" in stats.columns:
            for _, r in stats.iterrows():
                naming = r.get("Naming", "")
                make, model, year = parse_naming(naming)
                if not make or not model:
                    continue
                key = (make.lower(), model.lower(), int(year) if year is not None else None)
                row_dict = dict(r)
                stat_data = dict_without(keys=["Naming"], row_dict=row_dict)
                stat_data = {k: v for k, v in stat_data.items() 
                            if not k.startswith("Unnamed") and norm(v) != ""}
                if key not in statistics_map:
                    statistics_map[key] = {}
                statistics_map[key].update(stat_data)
    
    # 6) Build and insert rows
    print("\n💾 Inserting data into database...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    inserted = 0
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
        statistics = statistics_map.get(key, {})
        
        source_sheets = ["Make-Model-Year"]
        if "Make-Model" in sheets:
            source_sheets.append("Make-Model")
        if specs:
            source_sheets.append("Basic Specs")
        if engines:
            source_sheets.append("Engine Specs")
        if statistics:
            source_sheets.append("Statistics")
        
        # Default values for missing fields
        # Try to get price from various sources
        price = 0.0
        if "Price" in r:
            try:
                price = float(r["Price"])
            except:
                pass
        if price == 0.0 and "price" in r:
            try:
                price = float(r["price"])
            except:
                pass
        
        # Check specs for price
        if price == 0.0 and "Price" in specs:
            try:
                price = float(specs["Price"])
            except:
                pass
        
        # Check statistics for price
        if price == 0.0 and "Price" in statistics:
            try:
                price = float(statistics["Price"])
            except:
                pass
        
        # Generate realistic price based on make/model/year if still 0
        if price == 0.0:
            # Base prices for common makes (in AED)
            base_prices = {
                "BMW": 200000, "Mercedes-Benz": 220000, "Audi": 200000,
                "Toyota": 120000, "Honda": 100000, "Nissan": 110000,
                "Ford": 130000, "Chevrolet": 120000, "Porsche": 400000,
                "Lexus": 250000, "Hyundai": 90000, "Kia": 85000,
                "Mazda": 95000, "Volkswagen": 140000, "Volvo": 180000
            }
            
            base_price = base_prices.get(make, 100000)  # Default 100k AED
            
            # Adjust for year (newer = more expensive)
            if y_int:
                year_factor = 1.0 + (2024 - y_int) * 0.05  # 5% depreciation per year
                year_factor = max(0.3, min(1.2, year_factor))  # Clamp between 30% and 120%
                price = base_price * year_factor
            else:
                price = base_price
        
        currency = norm(r.get("Currency")) or "AED"
        image_url = norm(r.get("Image URL"))
        
        # Try to extract rating and reviews from specs or statistics
        rating = 0.0
        reviews = 0
        
        if "Rating" in specs:
            try:
                rating = float(specs["Rating"])
            except:
                pass
        
        if "Reviews" in specs:
            try:
                reviews = int(specs["Reviews"])
            except:
                pass
        
        # Generate default rating if missing
        if rating == 0.0:
            rating = round(4.0 + (hash(f"{make}{model}") % 100) / 100, 1)  # 4.0-5.0
        
        if reviews == 0:
            reviews = (hash(f"{make}{model}") % 500) + 50  # 50-550 reviews
        
        # Insert into database
        try:
            # Check if car already exists
            cursor.execute('SELECT id FROM cars WHERE make = ? AND model = ? AND year = ?', 
                         (make, model, y_int))
            existing = cursor.fetchone()
            
            if existing:
                # Update existing record
                cursor.execute('''
                    UPDATE cars SET
                        price = ?, currency = ?, image_url = ?, image_urls = ?,
                        rating = ?, reviews = ?, specs = ?, engines = ?, 
                        statistics = ?, source_sheets = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (
                    price, currency, image_url, json.dumps([image_url] if image_url else []),
                    rating, reviews,
                    json.dumps(specs) if specs else None,
                    json.dumps(engines) if engines else None,
                    json.dumps(statistics) if statistics else None,
                    json.dumps(source_sheets),
                    existing[0]
                ))
            else:
                # Insert new record
                cursor.execute('''
                    INSERT INTO cars 
                    (make, model, year, price, currency, image_url, image_urls, 
                     rating, reviews, specs, engines, statistics, source_sheets)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    make,
                    model,
                    y_int,
                    price,
                    currency,
                    image_url,
                    json.dumps([image_url] if image_url else []),
                    rating,
                    reviews,
                    json.dumps(specs) if specs else None,
                    json.dumps(engines) if engines else None,
                    json.dumps(statistics) if statistics else None,
                    json.dumps(source_sheets)
                ))
            inserted += 1
        except Exception as e:
            print(f"⚠️  Error inserting {make} {model} {year}: {e}")
            import traceback
            traceback.print_exc()
            continue
    
    conn.commit()
    conn.close()
    
    print(f"\n✅ Successfully inserted {inserted} cars into database!")
    print(f"📊 Database ready at: {DB_PATH}")

if __name__ == "__main__":
    main()

