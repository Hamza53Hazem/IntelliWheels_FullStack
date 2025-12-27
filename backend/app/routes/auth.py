from flask import Blueprint, request, jsonify, g
from werkzeug.security import generate_password_hash, check_password_hash
from ..db import get_db
import secrets
import sqlite3
from datetime import datetime, timedelta

bp = Blueprint('auth', __name__, url_prefix='/api/auth')

def generate_token():
    return secrets.token_urlsafe(32)

def get_user_from_token(token):
    if not token:
        return None
    
    db = get_db()
    # Check for valid session
    row = db.execute('''
        SELECT u.id, u.username, u.email, u.role, u.created_at
        FROM users u
        JOIN user_sessions s ON u.id = s.user_id
        WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
    ''', (token,)).fetchone()
    
    if row:
        return {
            'id': row['id'],
            'username': row['username'],
            'email': row['email'],
            'role': row['role'],
            'created_at': row['created_at']
        }
    return None

@bp.route('/signup', methods=['POST'])
def signup():
    data = request.json
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    if not username or not email or not password:
        return jsonify({'success': False, 'error': 'Missing required fields'}), 400

    db = get_db()
    try:
        password_hash = generate_password_hash(password)
        cursor = db.execute(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            (username, email, password_hash)
        )
        user_id = cursor.lastrowid
        
        # Create session
        token = generate_token()
        expires_at = datetime.utcnow() + timedelta(days=7)
        db.execute(
            'INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
            (token, user_id, expires_at)
        )
        db.commit()

        return jsonify({
            'success': True,
            'token': token,
            'user': {
                'id': user_id,
                'username': username,
                'email': email,
                'role': 'user'
            }
        }), 201

    except sqlite3.IntegrityError:
        return jsonify({'success': False, 'error': 'Username or email already exists'}), 409
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@bp.route('/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    db = get_db()
    user = db.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()

    if user and check_password_hash(user['password_hash'], password):
        token = generate_token()
        expires_at = datetime.utcnow() + timedelta(days=7)
        
        db.execute(
            'INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
            (token, user['id'], expires_at)
        )
        db.commit()

        return jsonify({
            'success': True,
            'token': token,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'email': user['email'],
                'role': user['role']
            }
        })
    
    return jsonify({'success': False, 'error': 'Invalid credentials'}), 401

@bp.route('/logout', methods=['POST'])
def logout():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if token:
        db = get_db()
        db.execute('DELETE FROM user_sessions WHERE token = ?', (token,))
        db.commit()
    return jsonify({'success': True})

@bp.route('/verify', methods=['GET'])
def verify_session():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    user = get_user_from_token(token)
    
    if user:
        return jsonify({'success': True, 'user': user})
    return jsonify({'success': False, 'error': 'Invalid or expired token'}), 401
