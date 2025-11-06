"""
IntelliWheels Backend API
Modern REST API for car catalog management with AI chatbot integration
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import json
import os
from datetime import datetime
from functools import wraps

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    print("⚠️ Warning: requests not installed. Install with: pip install requests")

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend

# Database configuration
DB_PATH = 'intelliwheels.db'

# Initialize database
def init_db():
    """Initialize SQLite database with schema"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Main cars table
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
    
    # Statistics table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS statistics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            car_id INTEGER,
            stat_name TEXT,
            stat_value TEXT,
            FOREIGN KEY (car_id) REFERENCES cars(id)
        )
    ''')
    
    # Favorites table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            car_id INTEGER NOT NULL,
            user_session TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(car_id, user_session)
        )
    ''')
    
    conn.commit()
    conn.close()

# Database helper functions
def get_db():
    """Get database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def car_row_to_dict(row):
    """Convert database row to dictionary"""
    return {
        'id': row['id'],
        'make': row['make'],
        'model': row['model'],
        'year': row['year'],
        'price': row['price'],
        'currency': row['currency'],
        'image': row['image_url'],
        'imageUrls': json.loads(row['image_urls']) if row['image_urls'] else [],
        'rating': row['rating'] or 0.0,
        'reviews': row['reviews'] or 0,
        'specs': json.loads(row['specs']) if row['specs'] else {
            'bodyStyle': 'Unknown',
            'horsepower': 0,
            'engine': 'N/A',
            'fuelEconomy': 'N/A'
        },
        'engines': json.loads(row['engines']) if row['engines'] else [],
        'statistics': json.loads(row['statistics']) if row['statistics'] else {},
        'source_sheets': json.loads(row['source_sheets']) if row['source_sheets'] else []
    }

# API Routes

@app.route('/api/cars', methods=['GET'])
def get_cars():
    """Get all cars with optional filtering and sorting"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Query parameters
        make = request.args.get('make')
        search = request.args.get('search')
        sort_by = request.args.get('sort', 'default')
        limit = request.args.get('limit', type=int)
        offset = request.args.get('offset', type=int, default=0)
        
        # Build query
        query = "SELECT * FROM cars WHERE 1=1"
        params = []
        
        if make and make != 'all':
            query += " AND make = ?"
            params.append(make)
        
        if search:
            query += " AND (make LIKE ? OR model LIKE ?)"
            params.extend([f'%{search}%', f'%{search}%'])
        
        # Sorting
        if sort_by == 'price-asc':
            query += " ORDER BY price ASC"
        elif sort_by == 'price-desc':
            query += " ORDER BY price DESC"
        elif sort_by == 'rating-desc':
            query += " ORDER BY rating DESC"
        else:
            query += " ORDER BY id DESC"
        
        if limit:
            query += " LIMIT ?"
            params.append(limit)
        
        if offset:
            query += " OFFSET ?"
            params.append(offset)
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        cars = [car_row_to_dict(row) for row in rows]
        
        # Get total count
        count_query = "SELECT COUNT(*) FROM cars WHERE 1=1"
        count_params = []
        if make and make != 'all':
            count_query += " AND make = ?"
            count_params.append(make)
        if search:
            count_query += " AND (make LIKE ? OR model LIKE ?)"
            count_params.extend([f'%{search}%', f'%{search}%'])
        
        cursor.execute(count_query, count_params)
        total = cursor.fetchone()[0]
        
        conn.close()
        
        return jsonify({
            'success': True,
            'cars': cars,
            'total': total,
            'offset': offset
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cars/<int:car_id>', methods=['GET'])
def get_car(car_id):
    """Get a single car by ID"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM cars WHERE id = ?", (car_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return jsonify({'success': True, 'car': car_row_to_dict(row)})
        else:
            return jsonify({'success': False, 'error': 'Car not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cars', methods=['POST'])
def create_car():
    """Create a new car listing"""
    try:
        data = request.json
        conn = get_db()
        cursor = conn.cursor()
        
        # Validate required fields
        required_fields = ['make', 'model']
        for field in required_fields:
            if field not in data:
                return jsonify({'success': False, 'error': f'Missing required field: {field}'}), 400
        
        # Insert car
        cursor.execute('''
            INSERT INTO cars (make, model, year, price, currency, image_url, image_urls, 
                           rating, reviews, specs, engines, statistics, source_sheets)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data.get('make'),
            data.get('model'),
            data.get('year'),
            data.get('price'),
            data.get('currency', 'AED'),
            data.get('image') or data.get('image_url'),
            json.dumps(data.get('imageUrls', [])),
            data.get('rating', 0.0),
            data.get('reviews', 0),
            json.dumps(data.get('specs', {})),
            json.dumps(data.get('engines', [])),
            json.dumps(data.get('statistics', {})),
            json.dumps(['Manual Entry'])
        ))
        
        car_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'message': 'Car created successfully',
            'car_id': car_id
        }), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cars/<int:car_id>', methods=['PATCH'])
def update_car(car_id):
    """Update an existing car"""
    try:
        data = request.json
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if car exists
        cursor.execute("SELECT id FROM cars WHERE id = ?", (car_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'success': False, 'error': 'Car not found'}), 404
        
        # Build update query dynamically
        updates = []
        params = []
        
        allowed_fields = ['make', 'model', 'year', 'price', 'currency', 'image_url', 
                         'image_urls', 'rating', 'reviews', 'specs', 'engines', 'statistics']
        
        for field in allowed_fields:
            if field in data:
                if field == 'image_urls':
                    updates.append('image_urls = ?')
                    params.append(json.dumps(data[field]))
                elif field in ['specs', 'engines', 'statistics']:
                    updates.append(f'{field} = ?')
                    params.append(json.dumps(data[field]))
                else:
                    updates.append(f'{field} = ?')
                    params.append(data[field])
        
        if not updates:
            conn.close()
            return jsonify({'success': False, 'error': 'No valid fields to update'}), 400
        
        updates.append('updated_at = ?')
        params.append(datetime.now().isoformat())
        params.append(car_id)
        
        query = f"UPDATE cars SET {', '.join(updates)} WHERE id = ?"
        cursor.execute(query, params)
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Car updated successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cars/<int:car_id>', methods=['DELETE'])
def delete_car(car_id):
    """Delete a car"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if car exists
        cursor.execute("SELECT id FROM cars WHERE id = ?", (car_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'success': False, 'error': 'Car not found'}), 404
        
        # Delete related data
        cursor.execute("DELETE FROM favorites WHERE car_id = ?", (car_id,))
        cursor.execute("DELETE FROM statistics WHERE car_id = ?", (car_id,))
        
        # Delete car
        cursor.execute("DELETE FROM cars WHERE id = ?", (car_id,))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Car deleted successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/makes', methods=['GET'])
def get_makes():
    """Get all unique car makes"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT make FROM cars ORDER BY make")
        makes = [row[0] for row in cursor.fetchall()]
        conn.close()
        return jsonify({'success': True, 'makes': makes})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/favorites', methods=['GET'])
def get_favorites():
    """Get user's favorite cars"""
    try:
        user_session = request.args.get('session', 'default')
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT c.* FROM cars c
            INNER JOIN favorites f ON c.id = f.car_id
            WHERE f.user_session = ?
            ORDER BY f.created_at DESC
        ''', (user_session,))
        
        rows = cursor.fetchall()
        cars = [car_row_to_dict(row) for row in rows]
        conn.close()
        
        return jsonify({'success': True, 'cars': cars})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/favorites', methods=['POST'])
def add_favorite():
    """Add a car to favorites"""
    try:
        data = request.json
        car_id = data.get('car_id')
        user_session = data.get('session', 'default')
        
        if not car_id:
            return jsonify({'success': False, 'error': 'car_id is required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
                INSERT INTO favorites (car_id, user_session)
                VALUES (?, ?)
            ''', (car_id, user_session))
            conn.commit()
            conn.close()
            return jsonify({'success': True, 'message': 'Added to favorites'})
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'success': False, 'error': 'Already in favorites'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/favorites/<int:car_id>', methods=['DELETE'])
def remove_favorite(car_id):
    """Remove a car from favorites"""
    try:
        user_session = request.args.get('session', 'default')
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            DELETE FROM favorites
            WHERE car_id = ? AND user_session = ?
        ''', (car_id, user_session))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Removed from favorites'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/chatbot', methods=['POST'])
def chatbot():
    """AI Chatbot endpoint using Google Gemini REST API"""
    if not REQUESTS_AVAILABLE:
        return jsonify({
            'success': False,
            'error': 'Requests library not installed. Please install it with: pip install requests'
        }), 500
    
    try:
        data = request.json
        query = data.get('query', '')
        api_key = data.get('api_key') or os.getenv('GEMINI_API_KEY')
        
        if not query:
            return jsonify({'success': False, 'error': 'Query is required'}), 400
        
        if not api_key or api_key.strip() == '':
            return jsonify({
                'success': False,
                'error': 'API key is missing. Please add your Gemini API key.'
            }), 400
        
        # Get car data for context
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT make, model, year, price, currency FROM cars LIMIT 10")
        cars_sample = cursor.fetchall()
        conn.close()
        
        # Build context
        cars_context = "\n".join([
            f"- {row[0]} {row[1]} ({row[2]}): {row[3]} {row[4]}"
            for row in cars_sample
        ])
        
        # Build system prompt with car context
        if cars_sample:
            system_instruction = f"""You are an automotive expert assistant for IntelliWheels, a car catalog platform.
You can answer questions about cars, car maintenance, specifications, and help users find the right vehicle.

Available cars in our catalog (sample):
{cars_context}

Be concise, helpful, and professional. Use an encouraging and friendly tone."""
        else:
            system_instruction = """You are an automotive expert assistant for IntelliWheels, a car catalog platform.
You can answer questions about cars, car maintenance, specifications, and help users find the right vehicle.

Be concise, helpful, and professional. Use an encouraging and friendly tone."""
        
        try:
            # Use Gemini REST API directly
            api_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
            
            headers = {
                'Content-Type': 'application/json',
                'X-goog-api-key': api_key
            }
            
            payload = {
                "contents": [
                    {
                        "parts": [
                            {
                                "text": f"{system_instruction}\n\nUser Question: {query}\n\nAssistant Response:"
                            }
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.7,
                    "topP": 0.8,
                    "topK": 40,
                    "maxOutputTokens": 1024
                }
            }
            
            print(f"📝 Sending request to Gemini API for query: {query[:50]}...")
            print(f"🔑 Using API key: {api_key[:10]}...")
            
            response = requests.post(api_url, headers=headers, json=payload, timeout=30)
            
            print(f"📥 Response status: {response.status_code}")
            
            if response.status_code != 200:
                error_data = response.json() if response.text else {}
                error_msg = error_data.get('error', {}).get('message', f'HTTP {response.status_code}: {response.text}')
                print(f"❌ Gemini API Error: {error_msg}")
                
                # Provide helpful error messages
                if response.status_code == 401 or response.status_code == 403:
                    error_msg = "Invalid API key. Please check your Gemini API key."
                elif response.status_code == 429:
                    error_msg = "API quota exceeded. Please try again later."
                elif 'safety' in error_msg.lower() or 'blocked' in error_msg.lower():
                    error_msg = "The query was blocked by safety filters. Please rephrase your question."
                
                return jsonify({
                    'success': False,
                    'error': f'Chatbot Error: {error_msg}'
                }), 500
            
            response_data = response.json()
            print(f"✅ Received response from Gemini")
            
            # Extract text from response
            response_text = None
            
            if 'candidates' in response_data and len(response_data['candidates']) > 0:
                candidate = response_data['candidates'][0]
                
                # Check for finish reason
                if 'finishReason' in candidate:
                    finish_reason = candidate['finishReason']
                    if finish_reason == 'SAFETY':
                        return jsonify({
                            'success': False,
                            'error': 'Chatbot Error: Response was blocked by safety filters. Please rephrase your question.'
                        }), 500
                    elif finish_reason == 'MAX_TOKENS':
                        print("⚠️ Response hit max tokens limit")
                
                # Extract text from content.parts
                if 'content' in candidate and 'parts' in candidate['content']:
                    for part in candidate['content']['parts']:
                        if 'text' in part:
                            response_text = part['text']
                            break
            
            # Check for prompt feedback (blocked)
            if 'promptFeedback' in response_data:
                if 'blockReason' in response_data['promptFeedback']:
                    return jsonify({
                        'success': False,
                        'error': f"Chatbot Error: Query was blocked: {response_data['promptFeedback']['blockReason']}"
                    }), 500
            
            if not response_text or response_text.strip() == "":
                response_text = "I'm sorry, I received an empty response. Please try asking your question differently."
            
            print(f"📤 Returning response: {response_text[:100]}...")
            
            return jsonify({
                'success': True,
                'response': response_text
            })
            
        except requests.exceptions.Timeout:
            return jsonify({
                'success': False,
                'error': 'Chatbot Error: Request timed out. Please try again.'
            }), 500
        except requests.exceptions.RequestException as api_error:
            error_msg = str(api_error)
            print(f"❌ Request Error: {error_msg}")
            return jsonify({
                'success': False,
                'error': f'Chatbot Error: Network error - {error_msg}'
            }), 500
        except Exception as api_error:
            error_msg = str(api_error)
            print(f"❌ Gemini API Error: {error_msg}")
            print(f"Error type: {type(api_error)}")
            
            # Provide more helpful error messages
            if 'API key' in error_msg or 'authentication' in error_msg.lower():
                error_msg = "Invalid API key. Please check your Gemini API key."
            elif 'quota' in error_msg.lower() or 'limit' in error_msg.lower():
                error_msg = "API quota exceeded. Please try again later."
            elif 'safety' in error_msg.lower() or 'blocked' in error_msg.lower():
                error_msg = "The query was blocked by safety filters. Please rephrase your question."
            
            return jsonify({
                'success': False,
                'error': f'Chatbot Error: {error_msg}'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Chatbot error: {str(e)}'
        }), 500

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'success': True,
        'status': 'healthy',
        'timestamp': datetime.now().isoformat()
    })

if __name__ == '__main__':
    init_db()
    print("🚀 IntelliWheels API Server Starting...")
    print("📊 Database initialized")
    print("🌐 API available at http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)

