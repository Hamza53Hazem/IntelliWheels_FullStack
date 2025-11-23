/**
 * API Client for IntelliWheels
 * Handles all API communication with the backend
 */

const API_BASE_URL = 'http://localhost:5000/api';
const USER_SESSION = localStorage.getItem('userSession') || `session-${Date.now()}`;

// Initialize user session
if (!localStorage.getItem('userSession')) {
    localStorage.setItem('userSession', USER_SESSION);
}

/**
 * Generic API request handler
 */
async function apiRequest(endpoint, options = {}) {
    try {
        const url = `${API_BASE_URL}${endpoint}`;
        console.log('API Request:', url, options.method || 'GET');
        
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { error: errorText || `HTTP error! status: ${response.status}` };
            }
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('API Error:', error);
        // Return error response instead of throwing
        return {
            success: false,
            error: error.message || 'Network error occurred'
        };
    }
}

/**
 * Get all cars with optional filters
 */
export async function getCars(filters = {}) {
    const params = new URLSearchParams();
    
    if (filters.make) params.append('make', filters.make);
    if (filters.search) params.append('search', filters.search);
    if (filters.sort) params.append('sort', filters.sort);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);
    
    const queryString = params.toString();
    const endpoint = `/cars${queryString ? `?${queryString}` : ''}`;
    
    return await apiRequest(endpoint);
}

/**
 * Get a single car by ID
 */
export async function getCar(carId) {
    return await apiRequest(`/cars/${carId}`);
}

/**
 * Create a new car listing
 */
export async function createCar(carData) {
    return await apiRequest('/cars', {
        method: 'POST',
        body: JSON.stringify(carData)
    });
}

/**
 * Update an existing car
 */
export async function updateCar(carId, updates) {
    return await apiRequest(`/cars/${carId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
    });
}

/**
 * Delete a car
 */
export async function deleteCar(carId) {
    return await apiRequest(`/cars/${carId}`, {
        method: 'DELETE'
    });
}

/**
 * Get all unique makes
 */
export async function getMakes() {
    return await apiRequest('/makes');
}

/**
 * Get user's favorite cars
 */
export async function getFavorites() {
    return await apiRequest(`/favorites?session=${USER_SESSION}`);
}

/**
 * Add a car to favorites
 */
export async function addFavorite(carId) {
    return await apiRequest('/favorites', {
        method: 'POST',
        body: JSON.stringify({
            car_id: carId,
            session: USER_SESSION
        })
    });
}

/**
 * Remove a car from favorites
 */
export async function removeFavorite(carId) {
    return await apiRequest(`/favorites/${carId}?session=${USER_SESSION}`, {
        method: 'DELETE'
    });
}

/**
 * Send a message to the AI chatbot
 * @param {string} query - The user's message
 * @param {string} apiKey - The Gemini API key
 * @param {Array} history - Conversation history array with {role: 'user'|'bot', text: string}
 */
export async function handleChatbotQuery(query, apiKey, history = [], options = {}) {
    if (!apiKey || apiKey.trim() === '' || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
        return "Error: API key is missing. Please add your Gemini API key to enable the chatbot.";
    }

    try {
        console.log('Sending chatbot query:', query);
        console.log('Conversation history length:', history.length);
        const payload = {
            query: query,
            api_key: apiKey,
            history: history, // Send conversation history
            session: USER_SESSION // User session
        };

        if (options.imageBase64 && options.imageMimeType) {
            payload.image_base64 = options.imageBase64;
            payload.image_mime_type = options.imageMimeType;
        }

        const response = await apiRequest('/chatbot', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        console.log('Chatbot response:', response);

        if (response.success) {
            return response.response || "I'm sorry, I couldn't generate a response.";
        } else {
            // Return the error message from the backend
            return `Error: ${response.error || "I couldn't generate a response. Please try again."}`;
        }
    } catch (error) {
        console.error('Chatbot error:', error);
        return `Error: An error occurred while processing your request. ${error.message || 'Please try again later.'}`;
    }
}

/**
 * Health check
 */
export async function healthCheck() {
    try {
        return await apiRequest('/health');
    } catch (error) {
        return { success: false, error: 'Backend not available' };
    }
}

/**
 * User signup
 */
export async function signup(username, email, password) {
    return await apiRequest('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
            username,
            email,
            password
        })
    });
}

/**
 * User login
 */
export async function login(username, password) {
    return await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
            username,
            password
        })
    });
}

/**
 * User logout
 */
export async function logout() {
    const token = getAuthToken();
    if (token) {
        await apiRequest('/auth/logout', {
            method: 'POST',
            body: JSON.stringify({ token })
        });
    }
    setAuthToken(null);
    setUserData(null);
}

/**
 * Verify authentication session
 */
export async function verifyAuth() {
    return await apiRequest('/auth/verify');
}

/**
 * Get user's own listings
 */
export async function getMyListings() {
    return await apiRequest('/my-listings');
}

/**
 * Send a message to the AI Listing Assistant
 * @param {string} query - The user's message
 * @param {string} apiKey - The Gemini API key
 * @param {Array} history - Conversation history array with {role: 'user'|'bot', text: string}
 * @returns {Promise<Object>} Response object with {success, response, action_type, listing_data, error}
 */
export async function handleListingAssistantQuery(query, apiKey, history = []) {
    if (!apiKey || apiKey.trim() === '' || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
        return {
            success: false,
            response: "Error: API key is missing. Please add your Gemini API key to enable the listing assistant.",
            error: "API key missing"
        };
    }

    try {
        console.log('Sending listing assistant query:', query);
        const response = await apiRequest('/listing-assistant', {
            method: 'POST',
            body: JSON.stringify({
                query: query,
                api_key: apiKey,
                history: history,
                session: USER_SESSION
            })
        });

        console.log('Listing assistant response:', response);

        if (response.success) {
            return {
                success: true,
                response: response.response || "I'm sorry, I couldn't generate a response.",
                action_type: response.action_type || null,
                listing_data: response.listing_data || null,
                message_id: response.message_id || null
            };
        } else {
            return {
                success: false,
                response: `Error: ${response.error || "I couldn't generate a response. Please try again."}`,
                error: response.error
            };
        }
    } catch (error) {
        console.error('Listing assistant error:', error);
        return {
            success: false,
            response: `Error: An error occurred while processing your request. ${error.message || 'Please try again later.'}`,
            error: error.message
        };
    }
}

export async function getPriceEstimate(payload) {
    return await apiRequest('/price-estimate', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function analyzeListingImage(payload) {
    return await apiRequest('/vision-helper', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function semanticSearchCars(query, limit = 5) {
    const params = new URLSearchParams({ q: query, limit });
    return await apiRequest(`/semantic-search?${params.toString()}`);
}

/**
 * Upload a listing image and receive a hosted URL
 * @param {File} file - Image file selected by the user
 * @returns {Promise<Object>} Response with {success, url, path, filename}
 */
export async function uploadListingImage(file) {
    const formData = new FormData();
    formData.append('file', file);

    const headers = {};
    const token = getAuthToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/uploads/images`, {
            method: 'POST',
            headers,
            body: formData
        });

        const data = await response.json().catch(() => ({ success: false, error: 'Upload failed' }));

        if (response.status === 401) {
            setAuthToken(null);
            setUserData(null);
        }

        if (!response.ok || !data.success) {
            throw new Error(data.error || `Upload failed with status ${response.status}`);
        }
        return data;
    } catch (error) {
        console.error('Image upload error:', error);
        throw new Error(error.message || 'Image upload failed');
    }
}
