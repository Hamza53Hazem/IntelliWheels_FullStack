# IntelliWheels Enhanced

This is a refactored version of the IntelliWheels project, featuring a modular architecture for better scalability and maintainability.

## Architecture Changes

### Backend (`/backend`)
- **Modular Structure**: The monolithic `app.py` has been split into Blueprints (`routes/cars.py`, `routes/ai.py`).
- **Service Layer**: Business logic (like AI model loading) is now in `services/`.
- **Application Factory**: Uses the `create_app()` pattern in `app/__init__.py` for better testing and configuration.

### Frontend (`/frontend`)
- **Next.js App Router**: Uses the modern `src/app` directory structure instead of a single `AppView` component.
- **Component Decomposition**: UI is broken down into smaller components (e.g., `Sidebar`).
- **Server Components**: Pages are set up to leverage Next.js server capabilities (though currently using `use client` for rapid migration).

## How to Run

### 1. Backend
Navigate to the `backend` folder:
```bash
cd backend
pip install -r requirements.txt
python run.py
```
The API will start on `http://localhost:5000`.

### 2. Frontend
Navigate to the `frontend` folder:
```bash
cd frontend
npm install
npm run dev
```
The app will start on `http://localhost:3000`.

## Database
The project uses the existing `intelliwheels.db` (copied from the original project). To re-ingest data, run:
```bash
python ingest_excel_to_db.py
```
