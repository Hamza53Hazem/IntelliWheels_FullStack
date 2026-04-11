import os
from flask import Flask
from flask_cors import CORS
from flask_swagger_ui import get_swaggerui_blueprint
from dotenv import load_dotenv
from .db import init_app as init_db
from .security import add_security_headers

# Load environment variables from .env file
load_dotenv()

def create_app(test_config=None):
    # Create and configure the app
    app = Flask(__name__, instance_relative_config=True)
    
    # Validate required environment variables
    secret_key = os.environ.get('SECRET_KEY', '')
    is_production = os.environ.get('FLASK_ENV') == 'production'
    
    # Check if secret key is valid (not empty, not 'dev', and at least 32 chars)
    is_valid_key = secret_key and secret_key != 'dev' and len(secret_key) >= 32
    
    if not is_valid_key:
        if is_production:
            raise ValueError("SECRET_KEY must be set to a secure value (32+ chars) in production!")
        print("⚠️  WARNING: Using insecure SECRET_KEY. Set a proper one for production!")
        secret_key = 'dev-only-insecure-key-for-local-testing'
    
    # Get allowed origins from environment
    frontend_origin = os.environ.get('FRONTEND_ORIGIN', 'http://localhost:3000')
    allowed_origins = [origin.strip() for origin in frontend_origin.split(',')]
    
    # Determine database path
    db_path = os.environ.get('DATABASE_PATH', os.path.join(app.root_path, '..', 'intelliwheels.db'))
    print(f"[App Init] Database path: {db_path}")
    print(f"[App Init] Database exists: {os.path.exists(db_path)}")
    
    # Configuration
    app.config.from_mapping(
        SECRET_KEY=secret_key,
        DATABASE=db_path,
        UPLOAD_FOLDER=os.path.join(app.root_path, '..', 'uploads'),
        MAX_CONTENT_LENGTH=500 * 1024 * 1024,  # 500MB max upload for 4K videos
        # Security settings
        SESSION_COOKIE_SECURE=os.environ.get('FLASK_ENV') == 'production',
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
    )

    if test_config is None:
        # load the instance config, if it exists, when not testing
        app.config.from_pyfile('config.py', silent=True)
    else:
        # load the test config if passed in
        app.config.from_mapping(test_config)

    # Ensure instance folder exists
    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass
    
    # Ensure uploads folder exists
    try:
        os.makedirs(app.config['UPLOAD_FOLDER'])
    except OSError:
        pass

    # Initialize CORS with proper origin restrictions
    CORS(app, 
         resources={r"/api/*": {
             "origins": allowed_origins if os.environ.get('FLASK_ENV') == 'production' else "*",
             "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
             "allow_headers": ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
             "supports_credentials": False
         }})
    
    # Add security headers to all responses
    app.after_request(add_security_headers)
    
    init_db(app)

    # Register Blueprints
    from .routes import cars, ai, system, auth, dealers, favorites, listings, reviews, messages
    app.register_blueprint(cars.bp)
    app.register_blueprint(ai.bp)
    app.register_blueprint(system.bp)
    app.register_blueprint(auth.bp)
    app.register_blueprint(dealers.bp)
    app.register_blueprint(favorites.bp)
    app.register_blueprint(listings.bp)
    app.register_blueprint(reviews.bp)
    app.register_blueprint(messages.bp)
    
    # Setup Swagger UI
    SWAGGER_URL = '/api/docs'
    API_URL = '/api/swagger.json'
    swaggerui_blueprint = get_swaggerui_blueprint(
        SWAGGER_URL,
        API_URL,
        config={'app_name': "IntelliWheels API"}
    )
    app.register_blueprint(swaggerui_blueprint, url_prefix=SWAGGER_URL)
    
    # Serve swagger.json from static folder
    @app.route('/api/swagger.json')
    def swagger_spec():
        return app.send_static_file('swagger.json')

    return app

# Expose app instance for 'gunicorn app:app' or 'gunicorn run:app'
def get_app():
    return create_app()

app = get_app()
