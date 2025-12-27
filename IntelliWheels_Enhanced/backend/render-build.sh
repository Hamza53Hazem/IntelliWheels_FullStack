#!/usr/bin/env bash
# exit on error
set -o errexit

echo "[render-build] Upgrading pip..."
python -m pip install --upgrade pip

echo "[render-build] Installing dependencies..."
# Removed --no-cache-dir to enable caching
pip install -r requirements.txt

echo "[render-build] Setup complete."
