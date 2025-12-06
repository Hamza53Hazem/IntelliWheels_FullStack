# IntelliWheels - Professional Car Catalog Platform

A modern, professional car catalog application with AI chatbot integration, built with Flask backend and modern JavaScript frontend.

## Features

- 🚗 **Complete Car Catalog** - View, search, filter, and manage car listings
- 🤖 **AI Chatbot** - Integrated Google Gemini AI for car-related questions
- 💰 **AI Price Advisor** - Trainable regression model for instant fair-price estimates
- 📷 **Vision Helper** - Gemini-powered photo analysis to auto-fill listing details
- 🔍 **Semantic Search** - Vector-based discovery that understands natural language intents
- ⭐ **Favorites System** - Save and manage favorite cars
- 📊 **SQL Data Integration** - Imports the DriveArabia Engine Specs dump directly from SQL
- 🎨 **Modern UI** - Professional, responsive design with smooth animations
- 🔄 **Full CRUD Operations** - Create, Read, Update, Delete car listings via REST API
- 💾 **SQLite Database** - Free, lightweight database solution

## Tech Stack

### Backend
- Flask (Python web framework)
- SQLite (Database)
- Pandas (Excel processing)
- Google Generative AI (Gemini)

### Frontend
- Vanilla JavaScript (ES6 Modules)
- Tailwind CSS
- Modern CSS with animations

## Setup Instructions

### 1. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 2. Ingest the DriveArabia SQL dump

Make sure the bundled dataset (`data/Middle-East-GCC-Car-Database-by-Teoalida-SAMPLE.sql`) is present, then run:

```bash
python ingest_excel_to_db.py
```

The script parses the `middle_east_gcc_car_database_sample` table from the SQL file, consolidates rows by make/model/year, and seeds `intelliwheels.db` with structured specs, engines, and metadata.

### 3. Train the AI Helpers

Run the training utilities whenever you refresh the catalog to keep the ML models in sync with the database:

```bash
# Train the fair-price regression pipeline and export models/fair_price_model.joblib
python models/train_price_model.py

# Build sentence-transformer embeddings for semantic search
python models/build_embeddings.py
```

Both commands read from `intelliwheels.db` and write artifacts under `models/`. The Flask API automatically loads these files on startup.

### 4. Configure Gemini API Key

Edit `js/main.js` and replace `YOUR_GEMINI_API_KEY_HERE` with your actual Gemini API key:

```javascript
const GEMINI_API_KEY = "your-actual-api-key-here";
```

Alternatively, you can set it as an environment variable:

```bash
export GEMINI_API_KEY="your-actual-api-key-here"
```

### 5. Start the Backend Server

```bash
python app.py
```

The server will start on `http://localhost:5000`

### 6. Open the Frontend

Simply open `index.html` in your web browser, or use a local server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve

# Using PHP
php -S localhost:8000
```

Then navigate to `http://localhost:8000` (or your chosen port)

## API Endpoints

### Cars
- `GET /api/cars` - Get all cars (supports query params: make, search, sort, limit, offset)
- `GET /api/cars/<id>` - Get a single car
- `POST /api/cars` - Create a new car
- `PATCH /api/cars/<id>` - Update a car
- `DELETE /api/cars/<id>` - Delete a car

### Makes
- `GET /api/makes` - Get all unique car makes

### Favorites
- `GET /api/favorites` - Get user's favorite cars
- `POST /api/favorites` - Add a car to favorites
- `DELETE /api/favorites/<car_id>` - Remove a car from favorites

### Chatbot
- `POST /api/chatbot` - Send a message to the AI chatbot
- `POST /api/listing-assistant` - Guided listing creation and editing via Gemini

### AI Utilities
- `POST /api/price-estimate` - Returns a fair-price prediction based on make/model/year/specs
- `POST /api/vision-helper` - Upload a photo and get structured listing suggestions
- `GET /api/semantic-search` - Natural-language search powered by vector embeddings

### Health
- `GET /api/health` - Health check endpoint

## Project Structure

```
IntelliWheels/
├── app.py                 # Flask backend server
├── ingest_excel_to_db.py  # SQL data ingestion script
├── requirements.txt       # Python dependencies
├── intelliwheels.db       # SQLite database (created after ingestion)
├── data/
│   └── Middle-East-GCC-Car-Database-by-Teoalida-SAMPLE.sql  # Engine Specs dump
├── index.html             # Main HTML file
├── css/
│   └── style.css          # Enhanced modern styling
├── models/
│   ├── train_price_model.py   # Trains the fair-price regression pipeline
│   ├── build_embeddings.py    # Generates semantic vectors for catalog search
│   ├── fair_price_model.joblib
│   └── car_embeddings.json
└── js/
    ├── main.js            # Main application logic
    ├── api.js             # API client
    └── ui.js              # UI rendering functions
```

## Features in Detail

### Car Management
- Browse all cars with beautiful card layouts
- Search by make or model
- Filter by make
- Sort by price (low to high, high to low) or rating
- View detailed car information in modal
- Add new car listings
- Edit existing listings (via API)
- Delete car listings

### AI Chatbot
- Ask questions about cars, maintenance, specifications
- Get recommendations and comparisons
- Powered by Google Gemini AI

### AI Price Advisor
- Trained Gradient Boosting model with automatic feature engineering
- Single endpoint (`/api/price-estimate`) used by the Add Listing form
- Metrics stored in `models/fair_price_model_metrics.json`

### Vision Helper
- Upload any car photo and receive structured suggestions (make/model/year/etc.)
- Gemini 1.5 Flash converts the picture into JSON the UI can auto-fill

### Semantic Search
- SentenceTransformer embeddings let users search with natural language prompts
- `/api/semantic-search` returns similarity scores plus ready-to-render cars

### Favorites
- Save cars to favorites
- Persistent storage (database + localStorage)
- View all favorites in dedicated page

### Data Management
- Automatic ingestion from Excel
- Support for multiple data sources
- Statistics tracking
- Engine specifications
- Comprehensive car specifications

## Development

### Adding New Features

1. **Backend**: Add new routes in `app.py`
2. **Frontend**: Add API calls in `js/api.js`
3. **UI**: Add rendering logic in `js/ui.js`
4. **Styling**: Add styles in `css/style.css`

### Database Schema

The main `cars` table includes:
- Basic info (make, model, year, price, currency)
- Images (image_url, image_urls)
- Ratings (rating, reviews)
- Specifications (specs as JSON)
- Engines (engines as JSON)
- Statistics (statistics as JSON)
- Source tracking (source_sheets)

## Deployment

- Always bind the server to the platform-provided `PORT` environment variable. The bundled `app.py` now reads `PORT` automatically, so hosting providers such as Render can probe the correct port.
- Use a production-grade WSGI server. Example start command: `gunicorn app:app --bind 0.0.0.0:$PORT`. Avoid running `python app.py` directly in production logs.
- Sample Render snippet:
    ```yaml
    services:
        - type: web
            name: intelliwheels-backend
            rootDir: backend
            runtime: python
            pythonVersion: 3.11.9
            buildCommand: ./render-build.sh  # install deps + train models + ingest data
            startCommand: gunicorn app:app --bind 0.0.0.0:$PORT
    ```
- Expose the frontend URL through `FRONTEND_ORIGIN` so `/` links users to the deployed Next.js app.
- Remember to set secrets such as `GEMINI_API_KEY` and any database paths as Render environment variables.

## Troubleshooting

### Backend not starting
- Make sure port 5000 is not in use
- Check that all dependencies are installed
- Verify Python version (3.7+)

### Database errors
- Run `ingest_excel_to_db.py` to initialize database
- Ensure the SQL dump exists under `backend/data/`

### Chatbot not working
- Verify Gemini API key is set correctly
- Check browser console for API errors
- Ensure backend server is running

### CORS errors
- Make sure Flask-CORS is installed
- Check that backend is running on correct port
- Verify API base URL in `js/api.js`

## License

This project is open source and available for use.

## Contributing

Feel free to submit issues and enhancement requests!

---

Built with ❤️ for car enthusiasts

