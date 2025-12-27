"""Utility script for training the IntelliWheels fair-price prediction model.

The script loads the latest listings from ``intelliwheels.db``, performs light feature
engineering, trains a regression pipeline, and stores the artifact/metrics under
``models/`` so the Flask app can serve real-time estimates.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
OHE_KWARGS = {"handle_unknown": "ignore"}
if "sparse_output" in OneHotEncoder.__init__.__code__.co_varnames:
    OHE_KWARGS["sparse_output"] = False
else:
    OHE_KWARGS["sparse"] = False


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB = BASE_DIR.parent / "intelliwheels.db"
MODEL_PATH = BASE_DIR / "fair_price_model.joblib"
METRICS_PATH = BASE_DIR / "fair_price_model_metrics.json"


def load_data(db_path: Path) -> pd.DataFrame:
    """Load the cars table and expand the JSON "specs" column."""
    if not db_path.exists():
        raise FileNotFoundError(f"Database not found at {db_path}")

    query = (
        "SELECT make, model, year, price, rating, reviews, specs, engines "
        "FROM cars WHERE price IS NOT NULL AND price > 0"
    )
    with sqlite3.connect(db_path) as conn:
        df = pd.read_sql_query(query, conn)

    def parse_specs(raw: Any) -> Dict[str, Any]:
        if raw in (None, "", "null"):
            return {}
        if isinstance(raw, dict):
            return raw
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}

    def parse_engines(raw: Any) -> Any:
        if raw in (None, "", "null"):
            return []
        if isinstance(raw, list):
            return raw
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return []
        return data if isinstance(data, list) else []

    def extract_horsepower(rows: Any) -> Any:
        if not rows:
            return None
        values = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            hp = row.get("powerHp") or row.get("horsepower") or row.get("power")
            if hp is None:
                continue
            try:
                values.append(float(hp))
            except (TypeError, ValueError):
                continue
        if not values:
            return None
        return sum(values) / len(values)

    specs_df = df["specs"].apply(parse_specs).apply(pd.Series)
    horsepower_from_engines = None
    if "engines" in df.columns:
        horsepower_from_engines = (
            df["engines"].apply(parse_engines).apply(extract_horsepower)
        )
        df.drop(columns=["engines"], inplace=True)
    df = pd.concat([df.drop(columns=["specs"]), specs_df], axis=1)

    df.rename(
        columns={
            "bodyStyle": "body_style",
            "horsepower": "horsepower",
            "engine": "engine",
            "fuelEconomy": "fuel_economy",
        },
        inplace=True,
    )

    # Basic cleanup
    df["body_style"].fillna("Unknown", inplace=True)
    if "horsepower" in df.columns:
        df["horsepower"] = pd.to_numeric(df["horsepower"], errors="coerce")
    else:
        df["horsepower"] = np.nan
    if horsepower_from_engines is not None:
        engine_hp_series = pd.to_numeric(horsepower_from_engines, errors="coerce")
        df["horsepower"] = df["horsepower"].combine_first(engine_hp_series)
    df["horsepower"] = pd.to_numeric(df["horsepower"], errors="coerce")
    df["horsepower"].fillna(df["horsepower"].median(), inplace=True)
    df["rating"].fillna(df["rating"].median(), inplace=True)
    df["reviews"].fillna(0, inplace=True)
    df.dropna(subset=["make", "model", "year", "price"], inplace=True)

    # Ensure numeric types
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    df.dropna(subset=["year"], inplace=True)
    return df


def build_pipeline() -> Pipeline:
    """Create the preprocessing + regression pipeline."""
    numeric_features = ["year", "rating", "reviews", "horsepower"]
    categorical_features = ["make", "model", "body_style"]

    preprocessing = ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), numeric_features),
            (
                "cat",
                OneHotEncoder(**OHE_KWARGS),
                categorical_features,
            ),
        ]
    )

    regressor = GradientBoostingRegressor(random_state=42)

    pipeline = Pipeline(
        steps=[
            ("preprocess", preprocessing),
            ("regressor", regressor),
        ]
    )
    return pipeline


@dataclass
class TrainingResult:
    pipeline: Pipeline
    metrics: Dict[str, float]
    train_rows: int


def train_model(df: pd.DataFrame) -> TrainingResult:
    """Train the pipeline and compute metrics."""
    target = df["price"].values
    features = df.drop(columns=["price"])

    X_train, X_val, y_train, y_val = train_test_split(
        features, target, test_size=0.2, random_state=42
    )

    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)

    predictions = pipeline.predict(X_val)
    metrics = {
        "mae": float(mean_absolute_error(y_val, predictions)),
        "rmse": float(np.sqrt(mean_squared_error(y_val, predictions))),
        "r2": float(r2_score(y_val, predictions)),
    }

    return TrainingResult(pipeline=pipeline, metrics=metrics, train_rows=len(df))


def persist_artifacts(result: TrainingResult) -> None:
    """Persist the trained pipeline and metrics to disk."""
    metadata = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "metrics": result.metrics,
        "train_rows": result.train_rows,
    }

    joblib.dump({"pipeline": result.pipeline, "metadata": metadata}, MODEL_PATH)
    METRICS_PATH.write_text(json.dumps(metadata, indent=2))
    print(f"✅ Saved model to {MODEL_PATH}")
    print(f"📊 Metrics: {json.dumps(result.metrics, indent=2)}")


def main(db_path: Path) -> None:
    print(f"📥 Loading data from {db_path}")
    df = load_data(db_path)
    if df.empty:
        raise RuntimeError("No training data available. Populate the cars table first.")

    print(f"📈 Training on {len(df)} rows")
    result = train_model(df)
    persist_artifacts(result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train the IntelliWheels price model")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="Path to intelliwheels.db")
    args = parser.parse_args()

    main(args.db)
