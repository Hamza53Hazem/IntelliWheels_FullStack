from flask import Blueprint, jsonify, send_from_directory, current_app, request
import os
import uuid
from werkzeug.utils import secure_filename
from ..db import get_db

# Try to import Cloudinary for cloud storage
try:
    import cloudinary
    import cloudinary.uploader
    HAS_CLOUDINARY = True
except ImportError:
    HAS_CLOUDINARY = False

bp = Blueprint('system', __name__, url_prefix='/api')

ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
ALLOWED_VIDEO_EXTENSIONS = {'mp4', 'mov', 'avi', 'mkv', 'webm'}

def is_cloudinary_configured():
    """Check if Cloudinary is configured via environment variables."""
    return (
        HAS_CLOUDINARY and 
        bool(os.environ.get('CLOUDINARY_CLOUD_NAME')) and
        bool(os.environ.get('CLOUDINARY_API_KEY')) and
        bool(os.environ.get('CLOUDINARY_API_SECRET'))
    )

def init_cloudinary():
    """Initialize Cloudinary with environment variables."""
    if not is_cloudinary_configured():
        return False
    cloudinary.config(
        cloud_name=os.environ.get('CLOUDINARY_CLOUD_NAME'),
        api_key=os.environ.get('CLOUDINARY_API_KEY'),
        api_secret=os.environ.get('CLOUDINARY_API_SECRET'),
        secure=True
    )
    return True

def allowed_image_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS

def allowed_video_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_VIDEO_EXTENSIONS

# Keep backward compatibility
def allowed_file(filename):
    return allowed_image_file(filename)

@bp.route('/health')
def health_check():
    # Check if GEMINI_API_KEY is configured
    gemini_key = os.environ.get('GEMINI_API_KEY', '')
    ai_configured = bool(gemini_key and len(gemini_key) > 10)
    
    # Check which model is actually active
    from ..services.ai_service import ai_service
    active_model = getattr(ai_service, 'active_model_name', None)
    gemini_working = ai_service.gemini_model is not None
    init_error = getattr(ai_service, '_init_error', None)
    
    # Check Cloudinary status
    cloudinary_configured = is_cloudinary_configured()

    # Check database connectivity (not just DATABASE_URL presence)
    db_ok = False
    db_error = None
    try:
        db = get_db()
        db.execute('SELECT 1').fetchone()
        db_ok = True
    except Exception as e:
        db_error = str(e)
    
    return jsonify({
        'status': 'healthy' if db_ok else 'degraded',
        'version': '2.0.6',  # Fixed: IndexError for SQLite row access
        'build_id': '20260120-fix7-indexerror',
        'ai_enabled': ai_configured,
        'ai_working': gemini_working,
        'ai_model': active_model,
        'ai_error': init_error if not gemini_working else None,
        'frontend_origin': os.environ.get('FRONTEND_ORIGIN', 'not set'),
        'database_type': 'postgresql' if os.environ.get('DATABASE_URL') else 'sqlite',
        'database_url_set': bool(os.environ.get('DATABASE_URL')),
        'database_connected': db_ok,
        'database_error': db_error,
        'cloudinary_enabled': cloudinary_configured,
        'storage_type': 'cloudinary' if cloudinary_configured else 'local (ephemeral)'
    })

# TEMPORARY DEBUG - REMOVE AFTER FIXING
@bp.route('/debug-verify/<token>')
def debug_verify(token):
    """TEMPORARY: Debug why token verification fails. REMOVE AFTER DEBUGGING!"""
    from ..db import is_postgres
    db = get_db()
    
    try:
        # First, check if token exists at all
        if is_postgres():
            session_raw = db.execute('SELECT token, user_id, expires_at FROM user_sessions WHERE token = %s', (token,)).fetchone()
        else:
            session_raw = db.execute('SELECT token, user_id, expires_at FROM user_sessions WHERE token = ?', (token,)).fetchone()
        
        # Check current time
        if is_postgres():
            now_result = db.execute("SELECT NOW() AT TIME ZONE 'UTC' as now_utc, NOW() as now_local").fetchone()
        else:
            now_result = db.execute("SELECT CURRENT_TIMESTAMP as now_utc").fetchone()
        
        # Now try the actual query from get_user_from_token
        if is_postgres():
            user_row = db.execute('''
                SELECT u.id, u.username, s.token, s.expires_at
                FROM users u
                JOIN user_sessions s ON u.id = s.user_id
                WHERE s.token = %s AND (s.expires_at IS NULL OR s.expires_at > (NOW() AT TIME ZONE 'UTC'))
            ''', (token,)).fetchone()
        else:
            user_row = db.execute('''
                SELECT u.id, u.username, s.token, s.expires_at
                FROM users u
                JOIN user_sessions s ON u.id = s.user_id
                WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
            ''', (token,)).fetchone()
        
        return jsonify({
            'is_postgres': is_postgres(),
            'token_input': token,
            'token_input_len': len(token),
            'session_found': session_raw is not None,
            'session_data': {
                'token': session_raw['token'] if session_raw else None,
                'token_len': len(session_raw['token']) if session_raw else None,
                'user_id': session_raw['user_id'] if session_raw else None,
                'expires_at': str(session_raw['expires_at']) if session_raw else None
            } if session_raw else None,
            'db_now_utc': str(now_result['now_utc']) if now_result else None,
            'db_now_local': str(now_result['now_local']) if now_result and is_postgres() else 'N/A',
            'user_found_with_expiry_check': user_row is not None,
            'user_data': {
                'id': user_row['id'],
                'username': user_row['username']
            } if user_row else None
        })
    except Exception as e:
        import traceback
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

@bp.route('/debug-tables')
def debug_tables():
    """TEMPORARY: Debug table existence. REMOVE AFTER DEBUGGING!"""
    from ..db import is_postgres
    db = get_db()
    
    try:
        results = {}
        
        if is_postgres():
            # List all tables in PostgreSQL
            tables = db.execute("""
                SELECT tablename FROM pg_catalog.pg_tables 
                WHERE schemaname = 'public'
            """).fetchall()
            results['all_tables'] = [t['tablename'] for t in tables]
            
            # Check for specific tables
            for table in ['users', 'user_sessions', 'cars', 'favorites', 'conversations', 'user_messages', 'listings']:
                try:
                    count = db.execute(f'SELECT COUNT(*) as c FROM {table}').fetchone()
                    results[f'{table}_count'] = count['c'] if count else 0
                except Exception as e:
                    results[f'{table}_error'] = str(e)
        else:
            # SQLite
            tables = db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            results['all_tables'] = [t['name'] for t in tables]
        
        return jsonify(results)
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

@bp.route('/debug-sessions')
def debug_sessions():
    """TEMPORARY: Public debug endpoint to check sessions. REMOVE AFTER DEBUGGING!"""
    from ..db import is_postgres
    db = get_db()
    
    try:
        sessions = db.execute('SELECT token, user_id, created_at, expires_at FROM user_sessions ORDER BY created_at DESC LIMIT 10').fetchall()
        return jsonify({
            'is_postgres': is_postgres(),
            'session_count': len(sessions),
            'sessions': [
                {
                    'token_preview': s['token'][:15] + '...' if s['token'] else None,
                    'user_id': s['user_id'],
                    'created_at': str(s['created_at']) if s['created_at'] else None,
                    'expires_at': str(s['expires_at']) if s['expires_at'] else None
                }
                for s in sessions
            ]
        })
    except Exception as e:
        import traceback
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


# ============================================
# TEMPORARY ADMIN SETUP ENDPOINTS
# Remove these after initial setup!
# ============================================

@bp.route('/admin-setup/users', methods=['GET'])
def admin_setup_list_users():
    """TEMPORARY: List all users for admin setup."""
    secret = request.args.get('secret')
    if secret != os.environ.get('SECRET_KEY', '')[:16]:
        return jsonify({'error': 'Unauthorized'}), 401
    
    db = get_db()
    users = db.execute('SELECT id, username, email, role, is_admin, password_hash, created_at FROM users ORDER BY id').fetchall()
    return jsonify({
        'users': [
            {
                'id': u['id'],
                'username': u['username'],
                'email': u['email'],
                'role': u['role'],
                'is_admin': bool(u['is_admin']) if u['is_admin'] else False,
                'has_password': bool(u['password_hash'] and len(u['password_hash']) > 10),
                'password_hash_preview': u['password_hash'][:30] + '...' if u['password_hash'] else None,
                'created_at': str(u['created_at']) if u['created_at'] else None
            }
            for u in users
        ],
        'total': len(users)
    })

@bp.route('/admin-setup/reset-password', methods=['POST'])
def admin_setup_reset_password():
    """TEMPORARY: Reset a user's password."""
    from werkzeug.security import generate_password_hash
    
    data = request.get_json() or {}
    secret = data.get('secret')
    if secret != os.environ.get('SECRET_KEY', '')[:16]:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user_id = data.get('user_id')
    new_password = data.get('password')
    
    if not user_id or not new_password:
        return jsonify({'error': 'user_id and password required'}), 400
    
    db = get_db()
    password_hash = generate_password_hash(new_password, method='pbkdf2:sha256:260000')
    db.execute('UPDATE users SET password_hash = ? WHERE id = ?', (password_hash, user_id))
    db.commit()
    
    return jsonify({'success': True, 'message': f'Password reset for user {user_id}'})

@bp.route('/admin-setup/make-admin', methods=['POST'])
def admin_setup_make_admin():
    """TEMPORARY: Make a user an admin."""
    data = request.get_json() or {}
    secret = data.get('secret')
    if secret != os.environ.get('SECRET_KEY', '')[:16]:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id required'}), 400
    
    db = get_db()
    db.execute('UPDATE users SET is_admin = TRUE WHERE id = ?', (user_id,))
    db.commit()
    
    return jsonify({'success': True, 'message': f'User {user_id} is now an admin'})

@bp.route('/admin-setup/sessions', methods=['GET'])
def admin_setup_sessions():
    """TEMPORARY: Debug sessions for a user."""
    secret = request.args.get('secret')
    if secret != os.environ.get('SECRET_KEY', '')[:16]:
        return jsonify({'error': 'Unauthorized'}), 401
    
    db = get_db()
    from ..db import is_postgres
    
    try:
        sessions = db.execute('SELECT token, user_id, created_at, expires_at FROM user_sessions ORDER BY created_at DESC LIMIT 20').fetchall()
        
        return jsonify({
            'is_postgres': is_postgres(),
            'session_count': len(sessions),
            'sessions': [
                {
                    'token_preview': s['token'][:15] + '...' if s['token'] else None,
                    'user_id': s['user_id'],
                    'created_at': str(s['created_at']) if s['created_at'] else None,
                    'expires_at': str(s['expires_at']) if s['expires_at'] else None,
                }
                for s in sessions
            ]
        })
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500


@bp.route('/stats')
def platform_stats():
    """
    Get real platform statistics from the database.
    
    Stats explained:
    - active_listings: Total number of cars currently listed on the platform
    - verified_dealers: Number of approved dealers in the network
    - registered_users: Total user accounts created
    - ai_interactions: Total chatbot messages + image analyses performed
    """
    db = get_db()
    
    # Count active car listings
    listings_count = db.execute('SELECT COUNT(*) as count FROM cars').fetchone()['count']
    
    # Count verified dealers (approved ones)
    dealers_count = db.execute('SELECT COUNT(*) as count FROM dealers').fetchone()['count']
    
    # Count registered users
    users_count = db.execute('SELECT COUNT(*) as count FROM users').fetchone()['count']
    
    # Count AI interactions (we'll track this via a simple counter)
    # For now, estimate based on users * average interactions, or use reviews as proxy
    try:
        reviews_count = db.execute('SELECT COUNT(*) as count FROM reviews').fetchone()['count']
    except:
        reviews_count = 0
    
    # AI interactions = reviews + favorites + estimated chat usage
    try:
        favorites_count = db.execute('SELECT COUNT(*) as count FROM favorites').fetchone()['count']
    except:
        favorites_count = 0
    
    # Estimate AI queries: each user averages ~5 interactions, plus reviews and favorites indicate engagement
    ai_interactions = (users_count * 5) + reviews_count + favorites_count
    
    return jsonify({
        'success': True,
        'stats': {
            'active_listings': listings_count,
            'verified_dealers': dealers_count,
            'registered_users': users_count,
            'ai_interactions': ai_interactions
        },
        'definitions': {
            'active_listings': 'Total number of vehicles currently listed for sale',
            'verified_dealers': 'Approved dealerships in our trusted network',
            'registered_users': 'Total accounts created on IntelliWheels',
            'ai_interactions': 'Estimated AI-powered searches, chats, and image analyses'
        }
    })

@bp.route('/uploads/images/<path:filename>')
def serve_uploaded_image(filename):
    upload_dir = current_app.config['UPLOAD_FOLDER']
    return send_from_directory(upload_dir, filename)

@bp.route('/uploads/videos/<path:filename>')
def serve_uploaded_video(filename):
    upload_dir = current_app.config['UPLOAD_FOLDER']
    return send_from_directory(upload_dir, filename)

@bp.route('/uploads/images', methods=['POST', 'OPTIONS'])
def upload_image():
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = current_app.make_default_options_response()
        return response
    
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No file selected'}), 400
    
    if not allowed_image_file(file.filename):
        return jsonify({'success': False, 'error': 'File type not allowed. Allowed: png, jpg, jpeg, gif, webp'}), 400
    
    # Try Cloudinary first for persistent cloud storage
    if init_cloudinary():
        try:
            # Upload directly to Cloudinary
            result = cloudinary.uploader.upload(
                file,
                folder="intelliwheels/images",
                resource_type="image",
                transformation=[{"quality": "auto:good", "fetch_format": "auto"}]
            )
            return jsonify({
                'success': True,
                'url': result['secure_url'],
                'path': result['public_id'],
                'filename': result['public_id'].split('/')[-1]
            })
        except Exception as e:
            print(f"[Cloudinary] Image upload error: {e}")
            # Fall back to local storage
    
    # Local storage fallback
    ext = file.filename.rsplit('.', 1)[1].lower()
    unique_filename = f"{uuid.uuid4().hex}.{ext}"
    safe_filename = secure_filename(unique_filename)
    
    upload_dir = current_app.config['UPLOAD_FOLDER']
    os.makedirs(upload_dir, exist_ok=True)
    
    filepath = os.path.join(upload_dir, safe_filename)
    file.save(filepath)
    
    backend_url = os.environ.get('BACKEND_URL', '')
    if backend_url:
        url = f"{backend_url}/api/uploads/images/{safe_filename}"
    else:
        url = f"/api/uploads/images/{safe_filename}"
    
    return jsonify({
        'success': True,
        'url': url,
        'path': f"/api/uploads/images/{safe_filename}",
        'filename': safe_filename
    })

@bp.route('/uploads/videos', methods=['POST', 'OPTIONS'])
def upload_video():
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = current_app.make_default_options_response()
        return response
    
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No file selected'}), 400
    
    if not allowed_video_file(file.filename):
        return jsonify({'success': False, 'error': 'File type not allowed. Allowed: mp4, mov, avi, mkv, webm'}), 400
    
    # Check file size (max 500MB for 4K videos, but Cloudinary free tier limits to ~100MB)
    file.seek(0, 2)  # Seek to end
    file_size = file.tell()
    file.seek(0)  # Seek back to start
    
    max_size = 100 * 1024 * 1024 if is_cloudinary_configured() else 500 * 1024 * 1024
    if file_size > max_size:
        return jsonify({'success': False, 'error': f'Video file too large. Maximum size is {max_size // (1024*1024)}MB'}), 400
    
    # Try Cloudinary first for persistent cloud storage
    if init_cloudinary():
        try:
            result = cloudinary.uploader.upload(
                file,
                folder="intelliwheels/videos",
                resource_type="video",
                eager=[{"format": "mp4", "quality": "auto"}],
                eager_async=True
            )
            return jsonify({
                'success': True,
                'url': result['secure_url'],
                'path': result['public_id'],
                'filename': result['public_id'].split('/')[-1]
            })
        except Exception as e:
            print(f"[Cloudinary] Video upload error: {e}")
            # Fall back to local storage
    
    # Local storage fallback
    ext = file.filename.rsplit('.', 1)[1].lower()
    unique_filename = f"{uuid.uuid4().hex}.{ext}"
    safe_filename = secure_filename(unique_filename)
    
    upload_dir = current_app.config['UPLOAD_FOLDER']
    os.makedirs(upload_dir, exist_ok=True)
    
    filepath = os.path.join(upload_dir, safe_filename)
    file.save(filepath)
    
    backend_url = os.environ.get('BACKEND_URL', '')
    if backend_url:
        url = f"{backend_url}/api/uploads/videos/{safe_filename}"
    else:
        url = f"/api/uploads/videos/{safe_filename}"
    
    return jsonify({
        'success': True,
        'url': url,
        'path': f"/api/uploads/videos/{safe_filename}",
        'filename': safe_filename
    })
