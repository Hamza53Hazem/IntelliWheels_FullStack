import { API_BASE_URL, STORAGE_KEYS } from './config';
import {
// REMOVED: import { MOCK_CARS } from './mockData' - no synthetic data fallbacks
  AnalyticsInsights,
  Car,
  CarFilters,
  DealerDetail,
  DealerSummary,
  ListingDraft,
  PriceEstimatePayload,
  PriceEstimateResponse,
  Review,
  ReviewStats,
  SemanticSearchResult,
  UserProfile,
  VisionAttributes,
} from './types';

interface RequestOptions<TResponse = any> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  token?: string | null;
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
  isFormData?: boolean;
  fallback?: () => TResponse | Promise<TResponse>;
}

async function apiRequest<T = any>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  let {
    method = 'GET',
    token,
    body,
    headers,
    signal,
    isFormData,
    fallback,
  } = options;

  // ---------------------------------------------------------
  // 🔍 DEBUG & AUTO-AUTH LOGIC
  // ---------------------------------------------------------
  
  // 1. If no token provided, hunt for it in LocalStorage
  if (!token && typeof window !== 'undefined') {
    // Try the config key first (intelliwheels-token)
    let storedToken = localStorage.getItem(STORAGE_KEYS.token);
    
    // Fallback: Try common key names if the config key failed
    if (!storedToken) storedToken = localStorage.getItem('token');
    if (!storedToken) storedToken = localStorage.getItem('authToken');
    if (!storedToken) storedToken = localStorage.getItem('intelliwheels-token');

    if (storedToken) {
      token = storedToken;
    } else {
      // Log only for protected routes to help debug
      if (path.includes('/my-listings') || path.includes('/verify') || path.includes('/favorites') || path.includes('/messages')) {
        console.warn(`[API] ⚠️ No token found for protected route: ${path}`);
        console.warn(`[API] Checked keys: ${STORAGE_KEYS.token}, token, authToken, intelliwheels-token`);
        console.warn(`[API] localStorage keys:`, Object.keys(localStorage));
      }
    }
  }

  // 2. Prepare Headers
  const finalHeaders = new Headers(headers ?? {});
  
  if (!isFormData && method !== 'GET' && body !== undefined) {
    finalHeaders.set('Content-Type', 'application/json');
  }

  // 3. Attach the Token (The most important part)
  if (token) {
    // Remove any existing header to prevent duplicates/conflicts
    if (finalHeaders.has('Authorization')) finalHeaders.delete('Authorization');
    finalHeaders.set('Authorization', `Bearer ${token}`);
  }

  // ---------------------------------------------------------
  // 🚀 EXECUTE REQUEST
  // ---------------------------------------------------------

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: finalHeaders,
      signal,
      cache: 'no-store',
      body:
        method === 'GET'
          ? undefined
          : isFormData
          ? (body as BodyInit)
          : body !== undefined
          ? JSON.stringify(body)
          : undefined,
    });
  } catch (error) {
    // Silently handle aborted requests (e.g., component unmount)
    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    if (fallback) {
      if (!isAbort) {
        console.warn(`[api] Falling back for ${path}:`, error);
      }
      return await fallback();
    }
    if (isAbort) {
      throw error; // Re-throw abort without wrapping
    }
    throw error instanceof Error ? error : new Error('Network request failed');
  }

  let data: T | null = null;
  try {
    data = (await response.json()) as T;
  } catch (error) {
    // Some endpoints may return 204 or non-JSON payloads
    data = null;
  }

  if (!response.ok) {
    // Log 401 errors for debugging
    if (response.status === 401) {
      console.error(`[API] ⛔ 401 Unauthorized for ${path}. Token sent: ${token ? 'YES (Length: ' + token.length + ')' : 'NO'}`);
    }
    const message = (data as any)?.error || response.statusText || 'Request failed';
    throw new Error(message);
  }

  return data as T;
}

export async function fetchCars(filters: CarFilters, signal?: AbortSignal, token?: string | null) {
  const params = new URLSearchParams();
  if (filters.make && filters.make !== 'all') params.append('make', filters.make);
  if (filters.search) params.append('search', filters.search);
  if (filters.sort && filters.sort !== 'default') params.append('sort', filters.sort);
  if (filters.category && filters.category !== 'all') params.append('category', filters.category);
  if (filters.condition) params.append('condition', filters.condition);
  if (filters.transmission) params.append('transmission', filters.transmission);
  if (filters.fuelType) params.append('fuelType', filters.fuelType);

  // No fallback - frontend depends on backend API for real car data only
  return apiRequest<{ success: boolean; cars: Car[] }>(`/cars${params.size ? `?${params.toString()}` : ''}`, {
    signal,
    token,
  });
}

export async function fetchCarById(carId: number, token?: string | null) {
  // No fallback - frontend depends on backend API for real car data only
  return apiRequest<{ success: boolean; car: Car }>(`/cars/${carId}`, {
    token,
  });
}

export async function fetchMakes(token?: string | null) {
  // No fallback - frontend depends on backend API for real makes data only
  return apiRequest<{ success: boolean; makes: string[] }>(`/makes`, {
    token,
  });
}

export async function fetchModels(make: string, token?: string | null) {
  // Fetch models for a specific make from backend
  return apiRequest<{ success: boolean; models: string[] }>(`/models?make=${encodeURIComponent(make)}`, {
    token,
  });
}

export async function fetchEngines(make: string, model: string, token?: string | null) {
  // Fetch engines for a specific make/model from backend
  return apiRequest<{ success: boolean; engines: string[] }>(
    `/engines?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`,
    { token }
  );
}

// REMOVED: filterLocalCars, getLocalCarById, getLocalMakes functions
// No synthetic data fallbacks - frontend relies on backend API only

export async function createListing(payload: Partial<Car>, token: string | null) {
  return apiRequest(`/cars`, {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function updateListing(carId: number, payload: Partial<Car>, token: string | null) {
  return apiRequest(`/cars/${carId}`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export async function deleteListing(carId: number, token: string | null) {
  return apiRequest(`/cars/${carId}`, {
    method: 'DELETE',
    token,
  });
}

export async function fetchFavorites(token: string | null) {
  return apiRequest<{ success: boolean; cars: Car[] }>(`/favorites`, { token });
}

export async function addFavorite(carId: number, token: string | null) {
  return apiRequest(`/favorites`, {
    method: 'POST',
    token,
    body: { car_id: carId },
  });
}

export async function removeFavorite(carId: number, token: string | null) {
  return apiRequest(`/favorites/${carId}`, {
    method: 'DELETE',
    token,
  });
}

export async function fetchMyListings(token: string | null) {
  return apiRequest<{ success: boolean; cars: Car[] }>(`/my-listings`, { token });
}

export interface MyListingsAnalytics {
  total_listings: number;
  total_value: number;
  average_price: number;
  price_range: { min: number; max: number };
  listings_by_make: Array<{ make: string; count: number }>;
  listings_by_year: Array<{ year: number | string; count: number }>;
  listings_by_body_style: Array<{ bodyStyle: string; count: number }>;
  recent_listings: Array<{ id: number; make: string; model: string; price: number; created_at: string }>;
  performance: {
    total_views: number;
    total_favorites: number;
    avg_rating: number;
  };
}

export async function fetchMyListingsAnalytics(token: string | null) {
  return apiRequest<{ success: boolean; analytics: MyListingsAnalytics }>(`/my-listings/analytics`, { token });
}

export async function signupUser(username: string, email: string, password: string) {
  return apiRequest<{ success: boolean; token: string; user: UserProfile; error?: string }>(`/auth/signup`, {
    method: 'POST',
    body: { username, email, password },
  });
}

export async function loginUser(username: string, password: string) {
  return apiRequest<{ success: boolean; token: string; user: UserProfile; error?: string }>(`/auth/login`, {
    method: 'POST',
    body: { username, password },
  });
}

export async function verifySession(token: string | null, signal?: AbortSignal) {
  if (!token) {
    return { success: false, authenticated: false };
  }
  return apiRequest<{ success: boolean; authenticated: boolean; user?: UserProfile }>(`/auth/verify`, {
    token,
    signal,
    // No fallback - verification should fail properly if the server is unreachable
  });
}

export async function logoutUser(token: string | null) {
  if (!token) return { success: true };
  return apiRequest(`/auth/logout`, {
    method: 'POST',
    token,
    body: { token },
  });
}

// Password Reset
export async function forgotPassword(email: string) {
  return apiRequest<{ success: boolean; message: string; error?: string }>(`/auth/forgot-password`, {
    method: 'POST',
    body: { email },
  });
}

export async function resetPassword(token: string, password: string) {
  return apiRequest<{ success: boolean; message: string; error?: string }>(`/auth/reset-password`, {
    method: 'POST',
    body: { token, password },
  });
}

// Google OAuth
export async function googleAuth(credential: string) {
  return apiRequest<{ success: boolean; token: string; user: UserProfile; error?: string }>(`/auth/google`, {
    method: 'POST',
    body: { credential },
  });
}

export async function getOAuthConfig() {
  return apiRequest<{ google: { enabled: boolean; client_id: string | null } }>(`/auth/oauth-config`, {
    fallback: async () => ({ google: { enabled: false, client_id: null } }),
  });
}

export async function getProfile(token: string | null) {
  return apiRequest<{ success: boolean; user: UserProfile }>(`/profile`, { token });
}

export async function updateProfile(payload: Partial<UserProfile> & { password?: string; current_password?: string }, token: string | null) {
  return apiRequest(`/auth/profile`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export async function getAnalytics(filter: 'all' | 'my' | 'favorites', token: string | null) {
  const params = new URLSearchParams();
  if (filter && filter !== 'all') params.append('filter', filter);
  return apiRequest<{ success: boolean; insights: AnalyticsInsights; filter: string; user_stats?: Record<string, unknown> }>(
    `/analytics/insights${params.size ? `?${params.toString()}` : ''}`,
    { token }
  );
}

export async function fetchDealers(token: string | null) {
  return apiRequest<{ success: boolean; dealers: DealerSummary[] }>(`/dealers`, {
    token,
  });
}

export async function fetchDealerById(dealerId: number, token: string | null) {
  return apiRequest<{ success: boolean; dealer: DealerDetail }>(`/dealers/${dealerId}`, {
    token,
  });
}

export async function getPriceEstimate(payload: PriceEstimatePayload, token: string | null) {
  return apiRequest<PriceEstimateResponse & { success: boolean }>(`/price-estimate`, {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function analyzeListingImage(payload: { image_base64: string; mime_type?: string }, token: string | null) {
  return apiRequest<{ success: boolean; attributes: VisionAttributes; raw: string }>(`/vision-helper`, {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function semanticSearch(query: string, limit = 6, token: string | null) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return apiRequest<{ success: boolean; results: SemanticSearchResult[] }>(`/semantic-search?${params.toString()}`, {
    token,
  });
}

export async function uploadListingImage(file: File, token: string | null) {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest<{ success: boolean; url: string; path?: string; filename?: string }>(`/uploads/images`, {
    method: 'POST',
    token,
    body: formData,
    isFormData: true,
  });
}

export async function uploadListingVideo(file: File, token: string | null) {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest<{ success: boolean; url: string; path?: string; filename?: string }>(`/uploads/videos`, {
    method: 'POST',
    token,
    body: formData,
    isFormData: true,
  });
}

export interface ChatbotPayload {
  query: string;
  history?: Array<{ role: 'user' | 'bot'; text: string }>;
  apiKey?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export async function handleChatbotMessage(payload: ChatbotPayload, token?: string | null, signal?: AbortSignal) {
  const finalPayload = {
    query: payload.query,
    history: payload.history ?? [],
    image_base64: payload.imageBase64,
    image_mime_type: payload.imageMimeType,
  };

  return apiRequest<{ success: boolean; response: string; message_id?: string; relevant_car_ids?: number[] }>(`/chatbot`, {
    method: 'POST',
    token,
    body: finalPayload,
    signal,
  });
}

export async function handleListingAssistantMessage(
  payload: Omit<ChatbotPayload, 'imageBase64' | 'imageMimeType'>,
  token?: string | null,
  signal?: AbortSignal
) {
  const finalPayload = {
    query: payload.query,
    history: payload.history ?? [],
  };

  return apiRequest<{ success: boolean; response: string; action_type?: string; listing_data?: ListingDraft; message_id?: string }>(
    `/listing-assistant`,
    {
      method: 'POST',
      token,
      body: finalPayload,
      signal,
    }
  );
}

export async function healthCheck() {
  return apiRequest<{ success: boolean; status: string; timestamp: string }>(`/health`);
}

// Reviews API
export async function fetchCarReviews(carId: number) {
  return apiRequest<{ success: boolean; reviews: Review[]; stats: ReviewStats }>(`/reviews/car/${carId}`);
}

export async function submitReview(carId: number, rating: number, comment: string, token: string | null) {
  return apiRequest<{ success: boolean; message: string; review_id: number; error?: string }>(`/reviews/car/${carId}`, {
    method: 'POST',
    token,
    body: { rating, comment },
  });
}

export async function deleteReview(reviewId: number, token: string | null) {
  return apiRequest<{ success: boolean; message: string }>(`/reviews/${reviewId}`, {
    method: 'DELETE',
    token,
  });
}

export async function fetchMyReviews(token: string | null) {
  return apiRequest<{ success: boolean; reviews: Array<Review & { car: { make: string; model: string; year?: number; image?: string } }> }>(`/reviews/user/me`, {
    token,
  });
}

export async function requestCallback(
  carId: number,
  payload: { name?: string; phone?: string; message?: string; preferred_time?: string },
  token?: string | null
) {
  return apiRequest<{ success: boolean; error?: string }>(`/request-callback`, {
    method: 'POST',
    token,
    body: { car_id: carId, ...payload },
  });
}

// ============ DEALER APPLICATIONS API ============
import { DealerApplication } from './types';

export async function submitDealerApplication(
  payload: { name: string; email: string; phone: string; city: string; address?: string; website?: string; description?: string }
) {
  return apiRequest<{ success: boolean; message: string; application_id?: number; error?: string }>(
    `/dealers/applications`,
    {
      method: 'POST',
      body: payload,
    }
  );
}

export async function fetchDealerApplications(token: string | null, status?: string) {
  const params = status ? `?status=${status}` : '';
  return apiRequest<{ success: boolean; applications: DealerApplication[] }>(
    `/dealers/applications${params}`,
    { token }
  );
}

export async function approveDealerApplication(id: number, notes: string, token: string | null) {
  return apiRequest<{ success: boolean; message: string; error?: string }>(
    `/dealers/applications/${id}/approve`,
    {
      method: 'PUT',
      token,
      body: { notes },
    }
  );
}

export async function rejectDealerApplication(id: number, reason: string, notes: string, token: string | null) {
  return apiRequest<{ success: boolean; message: string; error?: string }>(
    `/dealers/applications/${id}/reject`,
    {
      method: 'PUT',
      token,
      body: { reason, notes },
    }
  );
}

// ============ PLATFORM STATS API ============
export interface PlatformStats {
  active_listings: number;
  verified_dealers: number;
  registered_users: number;
  ai_interactions: number;
}

export async function fetchPlatformStats() {
  return apiRequest<{ 
    success: boolean; 
    stats: PlatformStats;
    definitions: Record<string, string>;
  }>(`/stats`);
}

// ============ MESSAGING API ============
export interface Conversation {
  id: number;
  other_user_id: number;
  other_username: string;
  listing_id: number | null;
  listing_title: string | null;
  last_message: string | null;
  unread_count: number;
  updated_at: string;
}

export interface Message {
  id: number;
  sender_id: number;
  sender_username: string;
  content: string;
  is_read: boolean;
  created_at: string;
  is_mine: boolean;
}

export async function fetchConversations(token: string | null) {
  return apiRequest<{ success: boolean; conversations: Conversation[] }>(`/messages/conversations`, { token });
}

export async function fetchMessages(conversationId: number, token: string | null) {
  return apiRequest<{ success: boolean; messages: Message[] }>(`/messages/conversations/${conversationId}`, { token });
}

export async function sendMessage(recipientId: number, content: string, listingId: number | null, token: string | null) {
  return apiRequest<{ success: boolean; conversation_id: number; message: string }>(`/messages/send`, {
    method: 'POST',
    token,
    body: { recipient_id: recipientId, content, listing_id: listingId },
  });
}

export async function fetchUnreadCount(token: string | null) {
  return apiRequest<{ success: boolean; unread_count: number }>(`/messages/unread-count`, { token });
}
