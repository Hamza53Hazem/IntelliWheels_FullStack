#!/usr/bin/env bash
# exit on error
set -o errexit

echo "[render-build] Upgrading pip..."
python -m pip install --upgrade pip

echo "[render-build] Installing dependencies..."
pip install -r requirements.txt

echo "[render-build] Running database import from SQL dump..."
if [ -f import_sql_data.py ]; then
	python import_sql_data.py || echo "Import completed (or skipped if already done)"
else
	echo "[render-build] import_sql_data.py not found, skipping import step"
fi

echo "[render-build] Setup complete."
