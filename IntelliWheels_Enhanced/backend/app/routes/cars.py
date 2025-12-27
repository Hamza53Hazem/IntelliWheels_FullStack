from flask import Blueprint, request, jsonify, current_app
from ..db import get_db
import json
import sqlite3

bp = Blueprint('cars', __name__, url_prefix='/api/cars')

def car_row_to_dict(row):
    """Helper to convert DB row to dictionary with parsed JSON fields."""
    d = dict(row)
    for field in ['specs', 'engines', 'statistics', 'gallery_images', 'media_gallery']:
        if d.get(field):
            try:
                d[field] = json.loads(d[field])
            except:
                d[field] = None
    return d

@bp.route('', methods=['GET'])
def get_cars():
    db = get_db()
    args = request.args
    
    query = "SELECT * FROM cars WHERE 1=1"
    params = []

    if args.get('make') and args.get('make') != 'all':
        query += " AND make = ?"
        params.append(args.get('make'))
    
    if args.get('search'):
        search = f"%{args.get('search')}%"
        query += " AND (make LIKE ? OR model LIKE ?)"
        params.extend([search, search])

    # Pagination
    limit = int(args.get('limit', 20))
    offset = int(args.get('offset', 0))
    
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor = db.execute(query, params)
    cars = [car_row_to_dict(row) for row in cursor.fetchall()]
    
    return jsonify({'success': True, 'cars': cars})

@bp.route('/<int:id>', methods=['GET'])
def get_car(id):
    db = get_db()
    row = db.execute("SELECT * FROM cars WHERE id = ?", (id,)).fetchone()
    if row:
        return jsonify({'success': True, 'car': car_row_to_dict(row)})
    return jsonify({'success': False, 'error': 'Car not found'}), 404

@bp.route('', methods=['POST'])
def create_car():
    data = request.json
    db = get_db()
    
    # Basic validation could go here (or use Pydantic in a service layer)
    
    try:
        cursor = db.execute(
            '''INSERT INTO cars (make, model, year, price, currency, description, specs)
               VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (
                data.get('make'),
                data.get('model'),
                data.get('year'),
                data.get('price'),
                data.get('currency', 'AED'),
                data.get('description'),
                json.dumps(data.get('specs', {}))
            )
        )
        db.commit()
        return jsonify({'success': True, 'id': cursor.lastrowid}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
