#!/bin/bash

echo "========================================"
echo "IntelliWheels - Starting Application"
echo "========================================"
echo ""

echo "[1/3] Checking Python..."
python3 --version || { echo "ERROR: Python 3 is not installed"; exit 1; }

echo ""
echo "[2/3] Installing dependencies..."
pip3 install -r requirements.txt

echo ""
echo "[3/3] Starting Flask server..."
echo ""
echo "Server will be available at: http://localhost:5000"
echo "Press Ctrl+C to stop the server"
echo ""

python3 app.py

