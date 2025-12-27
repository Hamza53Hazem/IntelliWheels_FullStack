from flask import Blueprint, jsonify, send_from_directory, current_app
import os

bp = Blueprint('system', __name__, url_prefix='/api')

@bp.route('/health')
def health_check():
    return jsonify({'status': 'healthy', 'version': '2.0.0'})

@bp.route('/uploads/images/<path:filename>')
def serve_uploaded_image(filename):
    upload_dir = current_app.config['UPLOAD_FOLDER']
    return send_from_directory(upload_dir, filename)
