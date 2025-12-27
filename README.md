# IntelliWheels FullStack

This repository contains the full stack application for IntelliWheels.

## Structure

- **/**: The Next.js React application (Root).
- **backend/**: The Flask Python API.

## Deployment

### Frontend (Vercel)
- **Root Directory**: Leave empty (default)
- **Build Command**: `npm run build`
- **Install Command**: `npm install`

### Backend (Render)
- **Root Directory**: `backend`
- **Build Command**: `bash render-build.sh`
- **Start Command**: `gunicorn run:app --bind 0.0.0.0:$PORT`

## Local Development

### Frontend
```bash
npm install
npm run dev
```

### Backend
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python run.py
```
