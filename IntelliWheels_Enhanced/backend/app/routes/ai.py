from flask import Blueprint, request, jsonify
from ..services.ai_service import ai_service

bp = Blueprint('ai', __name__, url_prefix='/api')

@bp.route('/chatbot', methods=['POST'])
def chatbot():
    data = request.json
    query = data.get('query') or data.get('message')
    history = data.get('history', [])
    image_base64 = data.get('image_base64')
    
    response = ai_service.chat(query, history, image_base64)
    return jsonify({'success': True, 'response': response})

@bp.route('/price-estimate', methods=['POST'])
def price_estimate():
    data = request.json
    price = ai_service.estimate_price(
        data.get('make'),
        data.get('model'),
        data.get('year'),
        data.get('specs')
    )
    return jsonify({'success': True, 'estimate': price})

@bp.route('/semantic-search', methods=['GET'])
def semantic_search():
    query = request.args.get('q')
    limit = int(request.args.get('limit', 6))
    results = ai_service.semantic_search(query, limit)
    return jsonify({'success': True, 'results': results})

@bp.route('/vision-helper', methods=['POST'])
def vision_helper():
    data = request.json
    image_base64 = data.get('image_base64')
    attributes = ai_service.analyze_image(image_base64)
    return jsonify({'success': True, 'attributes': attributes})

@bp.route('/listing-assistant', methods=['POST'])
def listing_assistant():
    data = request.json
    query = data.get('query')
    history = data.get('history', [])
    response = ai_service.listing_assistant(query, history)
    return jsonify(response)
