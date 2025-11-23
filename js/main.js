/**
 * IntelliWheels Main Application
 * Modern, professional car catalog application
 */

import { 
    DOM, 
    showPage, 
    renderCarList, 
    populateFilters, 
    showCarInfoModal, 
    appendMessage, 
    resetChatbotChat,
    createParticles, 
    showTypingIndicator, 
    hideTypingIndicator,
    showLoadingState,
    hideLoadingState,
    showError,
    showSuccess,
    refreshDOM,
    setPriceFormatter
} from './ui.js';
import { 
    getCars, 
    createCar, 
    updateCar, 
    deleteCar, 
    getMakes, 
    getFavorites, 
    addFavorite, 
    removeFavorite, 
    handleChatbotQuery,
    handleListingAssistantQuery,
    getPriceEstimate,
    analyzeListingImage,
    semanticSearchCars,
    healthCheck,
    signup,
    login,
    logout,
    verifyAuth,
    getAuthToken,
    setAuthToken,
    getUserData,
    setUserData,
    uploadListingImage
} from './api.js';

// --- STATE MANAGEMENT ---
const GEMINI_API_KEY = "AIzaSyB5Wyhxs0j5Nh_StgxjSOVAn_ITVZsbFX0"; // Replace with your API key
let allCars = [];
let favorites = [];
let currentFilters = {
    make: 'all',
    search: '',
    sort: 'default'
};
let isLoading = false;
let conversationHistory = []; // Store conversation history for assistant
let isAuthenticated = false; // Authentication state
let currentUser = null; // Current logged-in user
let abortController = null; // For canceling API requests
let lastVisionSuggestion = null; // Cache last vision helper output
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const CHATBOT_ATTACHMENT_HINT_DEFAULT = 'Drop or paste an image to include it with your next message.';
let listingImageUploadState = {
    url: '',
    uploading: false,
    objectUrl: null,
    fileName: ''
};
let chatbotImageAttachment = null;

const DEFAULT_THEME = 'light';
const THEME_STORAGE_KEY = 'intelliwheels-theme';
const CURRENCY_STORAGE_KEY = 'intelliwheels-currency';
const ASSISTANT_TIPS_STORAGE_KEY = 'intelliwheels-assistant-tips-hidden';
const SUPPORTED_THEMES = ['light', 'dark'];
const CURRENCY_TABLE = {
    AED: { rate: 1, locale: 'en-AE' },
    USD: { rate: 3.6725, locale: 'en-US' },
    EUR: { rate: 3.97, locale: 'en-IE' },
    GBP: { rate: 4.64, locale: 'en-GB' },
    SAR: { rate: 0.98, locale: 'ar-SA' },
    QAR: { rate: 1.01, locale: 'ar-QA' },
    BHD: { rate: 9.74, locale: 'ar-BH' },
    KWD: { rate: 11.99, locale: 'ar-KW' },
    OMR: { rate: 9.55, locale: 'ar-OM' },
    EGP: { rate: 0.12, locale: 'ar-EG' },
    MAD: { rate: 0.38, locale: 'fr-MA' },
    JOD: { rate: 5.17, locale: 'ar-JO' }
};

let currentTheme = getStoredPreference(THEME_STORAGE_KEY, DEFAULT_THEME);
if (!SUPPORTED_THEMES.includes(currentTheme)) {
    currentTheme = DEFAULT_THEME;
}

let preferredCurrency = getStoredPreference(CURRENCY_STORAGE_KEY, 'AED');
if (!CURRENCY_TABLE[preferredCurrency]) {
    preferredCurrency = 'AED';
}

// Chat session management
let chatbotSessions = []; // Array of {id, title, history, createdAt, updatedAt}
let currentChatbotSessionId = null;
let lastAssistantMode = 'general';
let lastAssistantActionType = null;
const MAX_HISTORY_LENGTH = 40;

// --- LOCALSTORAGE FUNCTIONS ---
const Storage = {
    getFavorites: () => JSON.parse(localStorage.getItem('carFavorites')) || [],
    saveFavorites: (favs) => localStorage.setItem('carFavorites', JSON.stringify(favs)),
    getChatbotSessions: () => {
        try {
            const stored = localStorage.getItem('assistantSessions') || localStorage.getItem('chatbotSessions');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.warn('Failed to parse assistant sessions from storage:', error);
            return [];
        }
    },
    saveChatbotSessions: (sessions) => {
        const payload = JSON.stringify(sessions);
        localStorage.setItem('assistantSessions', payload);
        localStorage.setItem('chatbotSessions', payload);
    },
};

function getStoredPreference(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value || fallback;
    } catch (error) {
        console.warn(`Failed to load preference for ${key}:`, error);
        return fallback;
    }
}

function persistPreference(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (error) {
        console.warn(`Failed to persist preference for ${key}:`, error);
    }
}

function normalizeHistory(history = []) {
    return history.map(msg => ({
        ...msg,
        role: msg.role === 'user' ? 'user' : 'bot',
        mode: msg.mode === 'listing' ? 'listing' : 'general'
    }));
}

function trimConversationHistory() {
    if (conversationHistory.length > MAX_HISTORY_LENGTH) {
        conversationHistory = conversationHistory.slice(-MAX_HISTORY_LENGTH);
    }
}

function normalizeMode(mode) {
    return mode === 'listing' ? 'listing' : 'general';
}

function getHistoryForMode(mode = 'general') {
    const targetMode = normalizeMode(mode);
    return conversationHistory
        .filter(msg => normalizeMode(msg.mode) === targetMode)
        .map(({ role, text }) => ({ role, text }));
}

// --- CHAT SESSION MANAGEMENT ---
function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createNewChatbotSession() {
    const sessionId = generateSessionId();
    const session = {
        id: sessionId,
        title: 'New Chat',
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    chatbotSessions.unshift(session);
    Storage.saveChatbotSessions(chatbotSessions);
    currentChatbotSessionId = sessionId;
    conversationHistory = [];
    lastAssistantMode = 'general';
    lastAssistantActionType = null;
    resetChatbotChat();
    renderChatbotChatList();
    return sessionId;
}

function switchChatbotSession(sessionId) {
    const session = chatbotSessions.find(s => s.id === sessionId);
    if (!session) return;
    
    currentChatbotSessionId = sessionId;
    conversationHistory = normalizeHistory(session.history || []);
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    lastAssistantMode = lastMessage?.mode || 'general';
    lastAssistantActionType = null;
    
    // Render the conversation
    if (DOM.chatbotLog) {
        DOM.chatbotLog.innerHTML = '';
        conversationHistory.forEach(msg => {
            appendMessage(
                msg.text,
                msg.role === 'user' ? 'user' : 'bot',
                msg.metadata?.relevantCarIds || [],
                msg.metadata?.messageId || null,
                msg.metadata?.listingData || null,
                msg.metadata?.actionType || null,
                msg.attachment || null
            );
        });
        if (conversationHistory.length === 0) {
            resetChatbotChat();
        }
    }
    
    renderChatbotChatList();
}

function deleteChatbotSession(sessionId) {
    chatbotSessions = chatbotSessions.filter(s => s.id !== sessionId);
    Storage.saveChatbotSessions(chatbotSessions);
    if (currentChatbotSessionId === sessionId) {
        if (chatbotSessions.length > 0) {
            switchChatbotSession(chatbotSessions[0].id);
        } else {
            createNewChatbotSession();
        }
    }
    renderChatbotChatList();
}

function updateChatbotSessionTitle(sessionId, title) {
    const session = chatbotSessions.find(s => s.id === sessionId);
    if (session) {
        session.title = title;
        session.updatedAt = new Date().toISOString();
        Storage.saveChatbotSessions(chatbotSessions);
        renderChatbotChatList();
    }
}

function saveChatbotSession() {
    if (!currentChatbotSessionId) return;
    const session = chatbotSessions.find(s => s.id === currentChatbotSessionId);
    if (session) {
        trimConversationHistory();
        session.history = conversationHistory;
        session.updatedAt = new Date().toISOString();
        // Update title from first user message if title is still "New Chat"
        if (session.title === 'New Chat' && conversationHistory.length > 0) {
            const firstUserMsg = conversationHistory.find(m => m.role === 'user');
            if (firstUserMsg) {
                session.title = firstUserMsg.text.substring(0, 50) + (firstUserMsg.text.length > 50 ? '...' : '');
            }
        }
        Storage.saveChatbotSessions(chatbotSessions);
        renderChatbotChatList();
    }
}

function renderChatbotChatList() {
    if (!DOM.chatbotChatList) return;
    
    if (chatbotSessions.length === 0) {
        DOM.chatbotChatList.innerHTML = '<p class="text-gray-400 text-sm text-center p-4">No chats yet. Start a new chat!</p>';
        return;
    }
    
    DOM.chatbotChatList.innerHTML = chatbotSessions.map(session => {
        const isActive = session.id === currentChatbotSessionId;
        const preview = session.history.length > 0 
            ? (session.history[session.history.length - 1].text || '').substring(0, 40) + '...'
            : 'No messages yet';
        const date = new Date(session.updatedAt).toLocaleDateString();
        
        return `
            <div class="chat-item ${isActive ? 'active' : ''}" data-session-id="${session.id}">
                <div class="chat-item-title">${session.title}</div>
                <div class="chat-item-preview">${preview}</div>
                <div class="chat-item-date">${date}</div>
                <button class="chat-item-delete" data-session-id="${session.id}" title="Delete chat">×</button>
            </div>
        `;
    }).join('');
    
    // Add click handlers
    DOM.chatbotChatList.querySelectorAll('.chat-item').forEach(item => {
        const sessionId = item.dataset.sessionId;
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('chat-item-delete')) {
                switchChatbotSession(sessionId);
            }
        });
    });
    
    // Add delete handlers
    DOM.chatbotChatList.querySelectorAll('.chat-item-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Are you sure you want to delete this chat?')) {
                deleteChatbotSession(btn.dataset.sessionId);
            }
        });
    });
}

// --- API DATA FETCHING ---
async function fetchCarData() {
    try {
        showLoadingState(DOM.listingsContainer);
        const response = await getCars(currentFilters);
        
        if (response.success) {
            allCars = response.cars || [];
            return allCars;
        } else {
            throw new Error(response.error || 'Failed to fetch cars');
        }
    } catch (error) {
        console.error("Could not fetch car data:", error);
        showError(DOM.listingsContainer, "Could not load car listings. Please check if the backend server is running.");
        return [];
    } finally {
        hideLoadingState();
    }
}

async function fetchFavorites() {
    try {
        const response = await getFavorites();
        if (response.success) {
            favorites = response.cars.map(car => car.id);
            Storage.saveFavorites(favorites);
            return favorites;
        }
    } catch (error) {
        console.error("Could not fetch favorites:", error);
        // Fallback to localStorage
        favorites = Storage.getFavorites();
    }
    return favorites;
}

async function loadMakes() {
    try {
        const response = await getMakes();
        if (response.success) {
            populateFilters(response.makes || []);
        }
    } catch (error) {
        console.error("Could not fetch makes:", error);
    }
}

// --- FILTERING AND RENDERING ---
async function applyFiltersAndRender() {
    if (isLoading) return;
    isLoading = true;
    
    try {
        if (DOM.listingsContainer) {
            showLoadingState(DOM.listingsContainer);
        }
        
        // Update filters
        const searchTerm = DOM.searchInput?.value?.trim() || '';
        const selectedMake = DOM.makeFilter?.value || 'all';
        const sortBy = DOM.sortFilter?.value || 'default';
        
        currentFilters = {
            make: selectedMake,
            search: searchTerm,
            sort: sortBy
        };
        
        const response = await getCars(currentFilters);
        
        if (response.success) {
            allCars = response.cars || [];
            console.log(`Rendering ${allCars.length} cars`);
            if (DOM.listingsContainer) {
                renderCarList(allCars, DOM.listingsContainer, favorites);
            }
        } else {
            console.error("Filter error:", response.error);
            // Use local data if available
            if (allCars.length > 0) {
                let filtered = [...allCars];
                
                if (searchTerm) {
                    filtered = filtered.filter(car => 
                        car.make?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        car.model?.toLowerCase().includes(searchTerm.toLowerCase())
                    );
                }
                
                if (selectedMake !== 'all') {
                    filtered = filtered.filter(car => car.make === selectedMake);
                }
                
                if (sortBy === 'price-asc') {
                    filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
                } else if (sortBy === 'price-desc') {
                    filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
                } else if (sortBy === 'rating-desc') {
                    filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
                }
                
                if (DOM.listingsContainer) {
                    renderCarList(filtered, DOM.listingsContainer, favorites);
                }
            } else {
                showError(DOM.listingsContainer, response.error || "Could not filter cars. Please try again.");
            }
        }
    } catch (error) {
        console.error("Filter error:", error);
        showError(DOM.listingsContainer, "Could not filter cars. Please try again.");
    } finally {
        hideLoadingState();
        isLoading = false;
    }
}

// --- FAVORITES MANAGEMENT ---
async function toggleFavorite(carId) {
    try {
        const carCardIcon = document.querySelector(`.favorite-btn[data-car-id="${carId}"]`);
        const isFavorited = favorites.includes(carId);
        
        if (isFavorited) {
            await removeFavorite(carId);
            favorites = favorites.filter(id => id !== carId);
            carCardIcon?.classList.remove('favorited');
            showSuccess('Removed from favorites');
        } else {
            await addFavorite(carId);
            favorites.push(carId);
            carCardIcon?.classList.add('favorited');
            showSuccess('Added to favorites');
        }
        
        Storage.saveFavorites(favorites);
        
        if (!DOM.pages.favorites.classList.contains('hidden')) {
            renderFavoritesPage();
        }
    } catch (error) {
        console.error("Favorite toggle error:", error);
        showError(null, "Could not update favorites. Please try again.");
    }
}

async function renderFavoritesPage() {
    try {
        showLoadingState(DOM.favoritesContainer);
        const response = await getFavorites();
        
        if (response.success) {
            const favoriteCars = response.cars || [];
            renderCarList(favoriteCars, DOM.favoritesContainer, favorites);
        } else {
            // Fallback: filter from allCars
            const favoriteCars = allCars.filter(car => favorites.includes(car.id));
            renderCarList(favoriteCars, DOM.favoritesContainer, favorites);
        }
    } catch (error) {
        console.error("Could not fetch favorites:", error);
        const favoriteCars = allCars.filter(car => favorites.includes(car.id));
        renderCarList(favoriteCars, DOM.favoritesContainer, favorites);
    } finally {
        hideLoadingState();
    }
}

function buildListingFormPayload() {
    if (!DOM.addListingForm) return null;
    const formData = new FormData(DOM.addListingForm);
    const imageUrl = (formData.get('image') || '').trim();
    return {
        make: (formData.get('make') || '').trim(),
        model: (formData.get('model') || '').trim(),
        year: formData.get('year') ? parseInt(formData.get('year'), 10) : null,
        price: formData.get('price') ? parseFloat(formData.get('price')) : null,
        currency: (formData.get('currency') || 'AED').trim(),
        image: imageUrl,
        imageUrls: imageUrl ? [imageUrl] : [],
        rating: formData.get('rating') ? parseFloat(formData.get('rating')) : 0,
        reviews: 0,
        specs: {
            bodyStyle: (formData.get('bodyStyle') || 'Unknown').trim(),
            horsepower: formData.get('horsepower') ? parseInt(formData.get('horsepower'), 10) : 0,
            engine: (formData.get('engine') || 'N/A').trim(),
            fuelEconomy: (formData.get('fuelEconomy') || 'N/A').trim()
        }
    };
}

function setListingImageStatus(message = '', variant = 'muted') {
    if (!DOM.listingImageStatus) return;
    DOM.listingImageStatus.textContent = message;
    const palette = {
        muted: '#9ca3af',
        info: '#93c5fd',
        success: '#6ee7b7',
        error: '#f87171'
    };
    DOM.listingImageStatus.style.color = palette[variant] || palette.muted;
}

function clearListingImagePreview() {
    listingImageUploadState.url = '';
    listingImageUploadState.fileName = '';
    if (listingImageUploadState.objectUrl) {
        URL.revokeObjectURL(listingImageUploadState.objectUrl);
        listingImageUploadState.objectUrl = null;
    }
    if (DOM.listingImagePreview) {
        DOM.listingImagePreview.classList.add('hidden');
    }
    if (DOM.listingImagePreviewImg) {
        DOM.listingImagePreviewImg.src = '';
    }
    if (DOM.listingImagePreviewName) {
        DOM.listingImagePreviewName.textContent = '';
    }
    if (DOM.listingImageUrlInput) {
        DOM.listingImageUrlInput.value = '';
    }
}

function validateImageFile(file) {
    if (!file) {
        throw new Error('No image detected.');
    }
    if (!file.type || !file.type.startsWith('image/')) {
        throw new Error('Only image files are supported.');
    }
    if (file.size > MAX_IMAGE_BYTES) {
        throw new Error('Image exceeds the 10MB limit.');
    }
}

async function handleListingImageFile(file, source = 'upload') {
    if (!file) return;
    try {
        validateImageFile(file);
    } catch (error) {
        setListingImageStatus(error.message, 'error');
        return;
    }

    if (!requireAuth()) {
        setListingImageStatus('Sign in to upload images from your device.', 'error');
        return;
    }
    if (listingImageUploadState.uploading) {
        setListingImageStatus('Please wait for the current upload to finish...', 'info');
        return;
    }

    listingImageUploadState.uploading = true;
    setListingImageStatus(source === 'paste' ? 'Pasted image detected. Uploading...' : 'Uploading image...', 'info');
    try {
        const response = await uploadListingImage(file);
        const previewUrl = URL.createObjectURL(file);
        if (listingImageUploadState.objectUrl) {
            URL.revokeObjectURL(listingImageUploadState.objectUrl);
        }
        listingImageUploadState = {
            url: response.url,
            uploading: false,
            objectUrl: previewUrl,
            fileName: file.name || 'uploaded-image'
        };
        if (DOM.listingImageUrlInput) {
            DOM.listingImageUrlInput.value = response.url;
        }
        if (DOM.listingImagePreview) {
            DOM.listingImagePreview.classList.remove('hidden');
        }
        if (DOM.listingImagePreviewImg) {
            DOM.listingImagePreviewImg.src = previewUrl;
        }
        if (DOM.listingImagePreviewName) {
            DOM.listingImagePreviewName.textContent = listingImageUploadState.fileName;
        }
        setListingImageStatus('Photo uploaded and linked to your listing.', 'success');
    } catch (error) {
        console.error('Listing image upload failed:', error);
        setListingImageStatus(error.message || 'Upload failed. Try again.', 'error');
    } finally {
        listingImageUploadState.uploading = false;
        if (DOM.listingImageFileInput) {
            DOM.listingImageFileInput.value = '';
        }
    }
}

function setupListingImageInteractions() {
    if (!DOM.listingImageDropzone) return;
    const dropzone = DOM.listingImageDropzone;

    const highlight = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
        }
        dropzone.classList.add('dragover');
    };
    const unhighlight = (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropzone.classList.remove('dragover');
    };

    ['dragenter', 'dragover'].forEach(evt => dropzone.addEventListener(evt, highlight));
    ['dragleave', 'drop'].forEach(evt => dropzone.addEventListener(evt, unhighlight));

    dropzone.addEventListener('drop', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const file = event.dataTransfer?.files?.[0];
        if (file) {
            handleListingImageFile(file, 'drop');
        }
    });

    dropzone.addEventListener('paste', (event) => {
        const file = getImageFromClipboard(event);
        if (file) {
            event.preventDefault();
            handleListingImageFile(file, 'paste');
        }
    });

    dropzone.addEventListener('click', () => {
        DOM.listingImageFileInput?.click();
    });

    dropzone.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            DOM.listingImageFileInput?.click();
        }
    });

    if (DOM.listingImageFileInput) {
        DOM.listingImageFileInput.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (file) {
                handleListingImageFile(file, 'upload');
            }
        });
    }

    if (DOM.listingImageRemoveBtn) {
        DOM.listingImageRemoveBtn.addEventListener('click', () => {
            clearListingImagePreview();
            setListingImageStatus('Photo removed. Add another to keep your listing trusted.', 'info');
        });
    }
}

function getImageFromClipboard(event) {
    const items = event.clipboardData?.items;
    if (!items) return null;
    for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
            return item.getAsFile();
        }
    }
    return null;
}

async function attachChatbotImage(file, source = 'upload') {
    if (!file) return;
    try {
        validateImageFile(file);
        const dataUrl = await fileToDataUrl(file);
        chatbotImageAttachment = {
            base64: dataUrl,
            mime: file.type || 'image/png',
            name: file.name || `${source}-image.png`
        };
        if (DOM.chatbotAttachmentPreview) {
            DOM.chatbotAttachmentPreview.classList.remove('hidden');
        }
        if (DOM.chatbotAttachmentPreviewImg) {
            DOM.chatbotAttachmentPreviewImg.src = dataUrl;
        }
        if (DOM.chatbotAttachmentName) {
            DOM.chatbotAttachmentName.textContent = chatbotImageAttachment.name;
        }
        if (DOM.chatbotAttachmentHint) {
            DOM.chatbotAttachmentHint.classList.remove('hidden');
            DOM.chatbotAttachmentHint.textContent = 'Image attached. It will be analyzed with your next message.';
        }
    } catch (error) {
        showError(null, error.message || 'Unable to attach image.');
    } finally {
        if (DOM.chatbotAttachmentInput) {
            DOM.chatbotAttachmentInput.value = '';
        }
    }
}

function clearChatbotAttachment(updateHint = true) {
    chatbotImageAttachment = null;
    if (DOM.chatbotAttachmentPreview) {
        DOM.chatbotAttachmentPreview.classList.add('hidden');
    }
    if (DOM.chatbotAttachmentPreviewImg) {
        DOM.chatbotAttachmentPreviewImg.src = '';
    }
    if (DOM.chatbotAttachmentName) {
        DOM.chatbotAttachmentName.textContent = '';
    }
    if (updateHint && DOM.chatbotAttachmentHint) {
        DOM.chatbotAttachmentHint.classList.remove('hidden');
        DOM.chatbotAttachmentHint.textContent = CHATBOT_ATTACHMENT_HINT_DEFAULT;
    }
}

function setupChatbotAttachmentHandlers() {
    if (DOM.chatbotAttachBtn && DOM.chatbotAttachmentInput) {
        DOM.chatbotAttachBtn.addEventListener('click', () => {
            DOM.chatbotAttachmentInput?.click();
        });
        DOM.chatbotAttachmentInput.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (file) {
                attachChatbotImage(file, 'upload');
            }
        });
    }

    if (DOM.chatbotAttachmentRemoveBtn) {
        DOM.chatbotAttachmentRemoveBtn.addEventListener('click', () => {
            clearChatbotAttachment();
        });
    }

    if (!DOM.chatbotInputArea) return;
    const dropTarget = DOM.chatbotInputArea;

    const highlight = (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropTarget.classList.add('dragover');
    };
    const unhighlight = (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropTarget.classList.remove('dragover');
    };

    ['dragenter', 'dragover'].forEach(evt => dropTarget.addEventListener(evt, highlight));
    ['dragleave', 'drop'].forEach(evt => dropTarget.addEventListener(evt, unhighlight));

    dropTarget.addEventListener('drop', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const file = event.dataTransfer?.files?.[0];
        if (file) {
            attachChatbotImage(file, 'drop');
        }
    });

    dropTarget.addEventListener('paste', (event) => {
        const file = getImageFromClipboard(event);
        if (file) {
            event.preventDefault();
            attachChatbotImage(file, 'paste');
        }
    });
}

let fileDropGuardsInitialized = false;
function setupGlobalFileDropGuards() {
    if (fileDropGuardsInitialized) return;
    fileDropGuardsInitialized = true;

    const ALLOWED_SELECTORS = ['#listing-image-dropzone', '#chatbot-input-area'];
    const SENSITIVE_TYPES = new Set(['Files', 'application/x-moz-file', 'text/uri-list']);

    const isFileTransfer = (event) => {
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) return false;
        if (dataTransfer.files && dataTransfer.files.length > 0) {
            return true;
        }
        const types = dataTransfer.types;
        if (!types) return false;
        return Array.from(types).some(type => SENSITIVE_TYPES.has(type));
    };

    const isAllowedTarget = (target) => {
        if (!target || typeof target.closest !== 'function') return false;
        return ALLOWED_SELECTORS.some(selector => target.closest(selector));
    };

    const guard = (event) => {
        if (!event || !isFileTransfer(event)) {
            return;
        }
        if (isAllowedTarget(event.target)) {
            return; // Let dedicated handlers manage allowed zones
        }
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'none';
        }
    };

    const guardTargets = [window, document, document.documentElement, document.body];
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        guardTargets.forEach(target => {
            if (target && target.addEventListener) {
                target.addEventListener(evt, guard, true);
            }
        });
    });
}

// --- CAR LISTING MANAGEMENT ---
async function handleAddListing(event) {
    event.preventDefault();
    
    if (isLoading) return;
    isLoading = true;
    
    try {
        const newCar = buildListingFormPayload();
        if (!newCar) {
            throw new Error('Unable to read form values. Please refresh the page.');
        }
        if (!newCar.price) {
            throw new Error('Price is required before creating a listing.');
        }
        if (!newCar.year) {
            throw new Error('Year is required before creating a listing.');
        }

        const response = await createCar(newCar);
        
        if (response.success) {
            showSuccess('Car listing added successfully!');
            DOM.addListingForm.reset();
            clearListingImagePreview();
            setListingImageStatus('Listing created! Add another photo for your next car.', 'success');
            
            // Refresh car list
            await fetchCarData();
            await loadMakes();
            applyFiltersAndRender();
            showPage('listings');
        } else {
            throw new Error(response.error || 'Failed to add car');
        }
    } catch (error) {
        console.error("Add listing error:", error);
        showError(null, `Could not add car listing: ${error.message}`);
    } finally {
        isLoading = false;
    }
}

async function handleEditCar(carId, updates) {
    try {
        const response = await updateCar(carId, updates);
        if (response.success) {
            showSuccess('Car updated successfully!');
            await fetchCarData();
            applyFiltersAndRender();
            return true;
        } else {
            throw new Error(response.error || 'Failed to update car');
        }
    } catch (error) {
        console.error("Update error:", error);
        showError(null, `Could not update car: ${error.message}`);
        return false;
    }
}

async function handleDeleteCar(carId) {
    if (!confirm('Are you sure you want to delete this car listing?')) {
        return;
    }
    
    try {
        const response = await deleteCar(carId);
        if (response.success) {
            showSuccess('Car deleted successfully!');
            await fetchCarData();
            applyFiltersAndRender();
        } else {
            throw new Error(response.error || 'Failed to delete car');
        }
    } catch (error) {
        console.error("Delete error:", error);
        showError(null, `Could not delete car: ${error.message}`);
    }
}

async function handlePriceEstimateClick() {
    if (!requireAuth()) return;
    if (!DOM.priceEstimateBtn || !DOM.priceEstimateResult) return;

    const payload = buildListingFormPayload();
    if (!payload) return;
    if (!payload.make || !payload.model || !payload.year) {
        DOM.priceEstimateResult.classList.remove('hidden');
        DOM.priceEstimateResult.innerHTML = '<p class="text-red-400 text-sm">Add make, model, and year first.</p>';
        return;
    }

    DOM.priceEstimateBtn.disabled = true;
    DOM.priceEstimateBtn.textContent = 'Analyzing...';
    DOM.priceEstimateResult.classList.remove('hidden');
    DOM.priceEstimateResult.innerHTML = '<p class="text-gray-400 text-sm">Analyzing similar listings...</p>';
    try {
        const response = await getPriceEstimate({
            make: payload.make,
            model: payload.model,
            year: payload.year,
            rating: payload.rating,
            reviews: payload.reviews,
            bodyStyle: payload.specs.bodyStyle,
            horsepower: payload.specs.horsepower,
            currency: payload.currency
        });
        if (response.success) {
            const estimate = Math.round(response.estimate);
            const range = response.range || {};
            DOM.priceEstimateResult.innerHTML = `
                <div class="text-lg font-semibold text-blue-300">${formatCurrency(estimate, response.currency)}</div>
                <p class="text-xs text-gray-400">Suggested range: ${formatCurrency(range.low, response.currency)} - ${formatCurrency(range.high, response.currency)}</p>
            `;
            const priceInput = DOM.addListingForm?.querySelector('input[name="price"]');
            if (priceInput && !priceInput.value) {
                priceInput.value = estimate;
            }
        } else {
            DOM.priceEstimateResult.innerHTML = `<p class="text-red-400 text-sm">${response.error || 'Unable to generate estimate.'}</p>`;
        }
    } catch (error) {
        DOM.priceEstimateResult.innerHTML = `<p class="text-red-400 text-sm">${error.message}</p>`;
    } finally {
        DOM.priceEstimateBtn.disabled = false;
        DOM.priceEstimateBtn.textContent = 'AI Price Assist';
    }
}

async function handleVisionAnalysis() {
    if (!requireAuth()) return;
    if (!DOM.visionImageInput || !DOM.visionImageInput.files.length) {
        showError(null, 'Select an image before running the vision helper.');
        return;
    }

    const file = DOM.visionImageInput.files[0];
    DOM.visionHelperOutput?.classList.remove('hidden');
    DOM.visionHelperOutput.innerHTML = '<p class="text-sm text-gray-400">Analyzing photo...</p>';
    DOM.visionAnalyzeBtn.disabled = true;
    DOM.visionApplyBtn.disabled = true;

    try {
        const imageBase64 = await fileToDataUrl(file);
        const response = await analyzeListingImage({
            image_base64: imageBase64,
            mime_type: file.type
        });
        if (response.success) {
            lastVisionSuggestion = response.attributes || {};
            renderVisionSuggestion(lastVisionSuggestion, response.raw);
            if (DOM.visionApplyBtn) {
                DOM.visionApplyBtn.disabled = false;
            }
        } else {
            DOM.visionHelperOutput.innerHTML = `<p class="text-red-400 text-sm">${response.error || 'Vision helper failed. Try another photo.'}</p>`;
        }
    } catch (error) {
        DOM.visionHelperOutput.innerHTML = `<p class="text-red-400 text-sm">${error.message}</p>`;
    } finally {
        DOM.visionAnalyzeBtn.disabled = false;
    }
}

function renderVisionSuggestion(attributes = {}, rawText = '') {
    if (!DOM.visionHelperOutput) return;
    if (!attributes || Object.keys(attributes).length === 0) {
        DOM.visionHelperOutput.innerHTML = `<p class="text-gray-400 text-sm">No structured data returned. Raw response: ${rawText || 'N/A'}</p>`;
        return;
    }

    const estimatedPrice = attributes.estimatedPrice ? Number(attributes.estimatedPrice) : null;
    const highlights = (attributes.highlights || []).map((item) => `<li>• ${item}</li>`).join('');
    DOM.visionHelperOutput.innerHTML = `
        <div class="text-sm space-y-1">
            <p><span class="text-gray-400">Make:</span> ${attributes.make || 'Unknown'}</p>
            <p><span class="text-gray-400">Model:</span> ${attributes.model || 'Unknown'}</p>
            <p><span class="text-gray-400">Year:</span> ${attributes.year || 'Unknown'}</p>
            <p><span class="text-gray-400">Body Style:</span> ${attributes.bodyStyle || 'Unknown'}</p>
            <p><span class="text-gray-400">Color:</span> ${attributes.color || 'Unknown'}</p>
            <p><span class="text-gray-400">Condition:</span> ${attributes.conditionDescription || 'Unknown'}</p>
            <p><span class="text-gray-400">Confidence:</span> ${(attributes.confidence || 0).toFixed(2)}</p>
            ${estimatedPrice ? `<p><span class="text-gray-400">Estimated Price:</span> ${formatCurrency(estimatedPrice, 'AED')}</p>` : ''}
            ${highlights ? `<ul class="text-gray-300 mt-2 space-y-1">${highlights}</ul>` : ''}
        </div>
    `;
}

function applyVisionSuggestion() {
    if (!lastVisionSuggestion || !DOM.addListingForm) {
        showError(null, 'Run the vision helper first.');
        return;
    }
    const suggestedPrice = lastVisionSuggestion.estimatedPrice ? Number(lastVisionSuggestion.estimatedPrice) : null;
    const mapping = [
        { selector: 'input[name="make"]', value: lastVisionSuggestion.make },
        { selector: 'input[name="model"]', value: lastVisionSuggestion.model },
        { selector: 'input[name="year"]', value: lastVisionSuggestion.year },
        { selector: 'input[name="bodyStyle"]', value: lastVisionSuggestion.bodyStyle },
        { selector: 'input[name="price"]', value: suggestedPrice },
    ];
    mapping.forEach(({ selector, value }) => {
        if (!value && value !== 0) return;
        const input = DOM.addListingForm.querySelector(selector);
        if (input) {
            input.value = value;
        }
    });
    showSuccess('Applied vision insights to the form.');
}

async function handleSemanticSearch(event) {
    if (event) {
        event.preventDefault();
    }
    if (!requireAuth()) return;
    if (!DOM.semanticSearchInput || !DOM.semanticSearchResults) return;

    const query = DOM.semanticSearchInput.value.trim();
    if (!query) {
        DOM.semanticSearchResults.classList.remove('hidden');
        DOM.semanticSearchResults.innerHTML = '<p class="text-red-400 text-sm">Describe what you are looking for first.</p>';
        return;
    }

    DOM.semanticSearchResults.classList.remove('hidden');
    DOM.semanticSearchResults.innerHTML = '<p class="text-gray-400 text-sm">Searching similar listings...</p>';
    try {
        const response = await semanticSearchCars(query, 6);
        if (response.success) {
            renderSemanticSearchResults(response.results || []);
        } else {
            DOM.semanticSearchResults.innerHTML = `<p class="text-red-400 text-sm">${response.error || 'Semantic search failed.'}</p>`;
        }
    } catch (error) {
        DOM.semanticSearchResults.innerHTML = `<p class="text-red-400 text-sm">${error.message}</p>`;
    }
}

function renderSemanticSearchResults(results = []) {
    if (!DOM.semanticSearchResults) return;
    if (!results.length) {
        DOM.semanticSearchResults.innerHTML = '<p class="text-gray-400 text-sm">No close matches found. Try a different description.</p>';
        return;
    }
    DOM.semanticSearchResults.innerHTML = results.map(result => {
        const car = result.car || {};
        const priceLabel = typeof car.price === 'number' ? formatCurrency(car.price, car.currency || 'AED') : 'Price TBD';
        return `
            <div class="semantic-result-card">
                <div>
                    <p class="font-semibold">${car.make || ''} ${car.model || ''} ${car.year ? `(${car.year})` : ''}</p>
                    <p class="text-xs text-gray-400">Similarity: ${(result.score || 0).toFixed(3)}</p>
                    <p class="text-blue-300 font-medium">${priceLabel}</p>
                </div>
                <button class="details-button bg-blue-600 text-white px-3 py-2 rounded-lg" data-car-id="${car.id}">View</button>
            </div>
        `;
    }).join('');
}

// --- AUTHENTICATION MANAGEMENT ---
async function checkAuthentication() {
    const token = getAuthToken();
    if (!token) {
        return false;
    }
    
    try {
        const response = await verifyAuth();
        if (response.success && response.authenticated) {
            isAuthenticated = true;
            currentUser = response.user;
            setUserData(response.user);
            updateAuthUI();
            return true;
        } else {
            setAuthToken(null);
            setUserData(null);
            isAuthenticated = false;
            currentUser = null;
            updateAuthUI();
            return false;
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        setAuthToken(null);
        setUserData(null);
        isAuthenticated = false;
        currentUser = null;
        updateAuthUI();
        return false;
    }
}

function updateAuthUI() {
    if (isAuthenticated && currentUser) {
        // Show main navigation, hide auth section
        if (DOM.navMainSection) DOM.navMainSection.classList.remove('hidden');
        if (DOM.mobileMenuToggle) DOM.mobileMenuToggle.classList.remove('hidden');
        if (DOM.navAuthSection) {
            DOM.navAuthSection.classList.remove('hidden');
            if (DOM.userNameDisplay) {
                DOM.userNameDisplay.textContent = `Welcome, ${currentUser.username}`;
                DOM.userNameDisplay.classList.remove('hidden');
            }
            if (DOM.navButtons.profile) DOM.navButtons.profile.classList.remove('hidden');
            if (DOM.navLogout) DOM.navLogout.classList.remove('hidden');
        }
    } else {
        // Hide main navigation, show auth section
        if (DOM.navMainSection) DOM.navMainSection.classList.add('hidden');
        if (DOM.mobileMenuToggle) DOM.mobileMenuToggle.classList.add('hidden');
        if (DOM.mobileMenu) DOM.mobileMenu.classList.add('hidden');
        if (DOM.navAuthSection) {
            if (DOM.userNameDisplay) DOM.userNameDisplay.classList.add('hidden');
            if (DOM.navButtons.profile) DOM.navButtons.profile.classList.add('hidden');
            if (DOM.navLogout) DOM.navLogout.classList.add('hidden');
        }
    }
}

async function handleLogin(event) {
    console.log('handleLogin called!', event);
    event.preventDefault();
    event.stopPropagation();
    
    if (isLoading) {
        console.log('Already loading, ignoring...');
        return;
    }
    
    const username = DOM.loginForm.querySelector('#login-username').value.trim();
    const password = DOM.loginForm.querySelector('#login-password').value;
    
    console.log('Login attempt:', { username, passwordLength: password.length });
    
    if (!username || !password) {
        console.log('Validation failed: missing fields');
        showAuthError('login-error', 'Please fill in all fields');
        return;
    }
    
    isLoading = true;
    hideAuthError('login-error');
    
    // Show loading state
    const submitBtn = DOM.loginForm.querySelector('button[type="submit"]');
    const originalText = submitBtn?.textContent;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in...';
    }
    
    try {
        console.log('Attempting login for:', username);
        const response = await login(username, password);
        console.log('Login response:', response);
        
        if (response.success) {
            setAuthToken(response.token);
            setUserData(response.user);
            isAuthenticated = true;
            currentUser = response.user;
            
            // Clear old localStorage favorites (they might be from a different user)
            localStorage.removeItem('carFavorites');
            favorites = [];
            
            updateAuthUI();
            showSuccess('Login successful!');
            showPage('listings');
            
            // Initialize app and load favorites from server
            await initApp();
        } else {
            const errorMsg = response.error || 'Login failed';
            console.error('Login failed:', errorMsg);
            showAuthError('login-error', errorMsg);
        }
    } catch (error) {
        console.error('Login error:', error);
        const errorMsg = error.message || 'Login failed. Please check if the backend server is running.';
        showAuthError('login-error', errorMsg);
        
        // Check if it's a network error
        if (error.message && error.message.includes('fetch')) {
            showAuthError('login-error', 'Cannot connect to server. Make sure Flask backend is running (python app.py)');
        }
    } finally {
        isLoading = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText || 'Login';
        }
    }
}

async function handleSignup(event) {
    event.preventDefault();
    if (isLoading) return;
    
    const username = DOM.signupForm.querySelector('#signup-username').value.trim();
    const email = DOM.signupForm.querySelector('#signup-email').value.trim();
    const password = DOM.signupForm.querySelector('#signup-password').value;
    const passwordConfirm = DOM.signupForm.querySelector('#signup-password-confirm').value;
    
    if (!username || !email || !password || !passwordConfirm) {
        showAuthError('signup-error', 'Please fill in all fields');
        return;
    }
    
    if (password !== passwordConfirm) {
        showAuthError('signup-error', 'Passwords do not match');
        return;
    }
    
    if (password.length < 6) {
        showAuthError('signup-error', 'Password must be at least 6 characters');
        return;
    }
    
    isLoading = true;
    hideAuthError('signup-error');
    
    // Show loading state
    const submitBtn = DOM.signupForm.querySelector('button[type="submit"]');
    const originalText = submitBtn?.textContent;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account...';
    }
    
    try {
        console.log('Attempting signup for:', username, email);
        const response = await signup(username, email, password);
        console.log('Signup response:', response);
        
        if (response.success) {
            setAuthToken(response.token);
            setUserData(response.user);
            isAuthenticated = true;
            currentUser = response.user;
            
            // Clear old localStorage favorites (they might be from a different user)
            localStorage.removeItem('carFavorites');
            favorites = [];
            
            updateAuthUI();
            showSuccess('Account created successfully!');
            showPage('listings');
            
            // Initialize app and load favorites from server
            await initApp();
        } else {
            const errorMsg = response.error || 'Signup failed';
            console.error('Signup failed:', errorMsg);
            showAuthError('signup-error', errorMsg);
        }
    } catch (error) {
        console.error('Signup error:', error);
        const errorMsg = error.message || 'Signup failed. Please check if the backend server is running.';
        showAuthError('signup-error', errorMsg);
        
        // Check if it's a network error
        if (error.message && error.message.includes('fetch')) {
            showAuthError('signup-error', 'Cannot connect to server. Make sure Flask backend is running (python app.py)');
        }
    } finally {
        isLoading = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText || 'Sign Up';
        }
    }
}

async function handleLogout() {
    try {
        await logout();
        isAuthenticated = false;
        currentUser = null;
        
        // Clear favorites from localStorage and memory
        localStorage.removeItem('carFavorites');
        favorites = [];
        conversationHistory = [];
        lastAssistantMode = 'general';
        lastAssistantActionType = null;
        
        updateAuthUI();
        showPage('login');
        showSuccess('Logged out successfully');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

function showAuthError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
        errorEl.classList.add('show');
    }
}

function hideAuthError(elementId) {
    const errorEl = document.getElementById(elementId);
    if (errorEl) {
        errorEl.classList.add('hidden');
        errorEl.classList.remove('show');
    }
}

function requireAuth() {
    if (!isAuthenticated) {
        showPage('login');
        return false;
    }
    return true;
}

// Handle creating listing from assistant
window.handleCreateListingFromAssistant = async function(listingData) {
    if (isLoading) return;
    if (!requireAuth()) return;
    if (!currentChatbotSessionId) {
        createNewChatbotSession();
    }
    if (!listingData) {
        showError(null, 'No listing details were provided. Please ask the assistant to generate the listing again.');
        return;
    }
    isLoading = true;
    
    try {
        // Normalize the data structure
        const carData = {
            make: listingData.make,
            model: listingData.model,
            year: listingData.year ? parseInt(listingData.year) : null,
            price: listingData.price ? parseFloat(listingData.price) : null,
            currency: listingData.currency || 'AED',
            image: listingData.image || listingData.image_url || '',
            imageUrls: listingData.imageUrls || (listingData.image ? [listingData.image] : []),
            rating: listingData.rating ? parseFloat(listingData.rating) : 0.0,
            reviews: 0,
            specs: {
                bodyStyle: listingData.bodyStyle || listingData.specs?.bodyStyle || 'Unknown',
                horsepower: listingData.horsepower || listingData.specs?.horsepower || 0,
                engine: listingData.engine || listingData.specs?.engine || 'N/A',
                fuelEconomy: listingData.fuelEconomy || listingData.specs?.fuelEconomy || 'N/A'
            }
        };

        const response = await createCar(carData);
        
        if (response.success) {
            showSuccess('Car listing created successfully!');
            const successMessage = `✅ Great! I've successfully created your listing for ${carData.make} ${carData.model}. You can view it in the Listings page.`;
            await appendMessage(successMessage, 'bot');
            conversationHistory.push({ role: 'bot', text: successMessage, mode: 'listing' });
            trimConversationHistory();
            saveChatbotSession();
            lastAssistantMode = 'listing';
            lastAssistantActionType = null;
            
            await fetchCarData();
            await loadMakes();
            applyFiltersAndRender();
            
            if (DOM.myListingsContainer) {
                await renderMyListingsPage();
            }
        } else {
            throw new Error(response.error || 'Failed to create listing');
        }
    } catch (error) {
        console.error("Create listing from assistant error:", error);
        const failureMessage = `❌ Sorry, I couldn't create the listing: ${error.message}. Please try again or use the manual form.`;
        await appendMessage(failureMessage, 'bot');
        conversationHistory.push({ role: 'bot', text: failureMessage, mode: 'listing' });
        trimConversationHistory();
        saveChatbotSession();
        lastAssistantMode = 'listing';
        lastAssistantActionType = null;
        showError(null, `Could not create listing: ${error.message}`);
    } finally {
        isLoading = false;
    }
};

const LISTING_INTENT_KEYWORDS = [
    'listing', 'listings', 'post a car', 'publish', 'sell', 'selling', 'sale listing',
    'price', 'pricing', 'valuation', 'market value', 'description', 'specs', 'specifications',
    'mileage', 'odometer', 'photos', 'images', 'create listing', 'new listing', 'ad', 'advertisement',
    'classified', 'seller', 'buyer', 'inventory', 'vehicle listing', 'car listing', 'upload', 'details form'
];
const LISTING_FOLLOWUP_KEYWORDS = [
    'change', 'update', 'adjust', 'modify', 'set', 'increase', 'decrease', 'lower', 'raise',
    'color', 'colorway', 'paint', 'trim', 'price point', 'mileage', 'photos', 'image', 'title', 'year'
];
const LISTING_FOLLOWUP_PATTERN = /^(yes|yep|sure|do it|go ahead|looks good|sounds good|confirm|please|ok|okay|y|continue|proceed|perfect|great)/i;

function prepareAssistantMessage(rawMessage) {
    const trimmed = rawMessage.trim();
    const normalized = trimmed.toLowerCase();
    if (!trimmed) {
        return { mode: 'general', content: '' };
    }

    const listingCommand = /^\/listing\s*/i;
    const generalCommand = /^\/(general|chat)\s*/i;

    if (listingCommand.test(trimmed)) {
        const content = trimmed.replace(listingCommand, '').trim() || 'Help me create a new car listing.';
        return { mode: 'listing', content };
    }

    if (generalCommand.test(trimmed)) {
        const content = trimmed.replace(generalCommand, '').trim() || trimmed;
        return { mode: 'general', content };
    }

    const explicitListingIntent = LISTING_INTENT_KEYWORDS.some(keyword => normalized.includes(keyword));
    if (explicitListingIntent) {
        return { mode: 'listing', content: trimmed };
    }

    const isShortFollowUp = trimmed.length <= 80 && (LISTING_FOLLOWUP_PATTERN.test(trimmed) || LISTING_FOLLOWUP_KEYWORDS.some(keyword => normalized.includes(keyword)));
    if ((lastAssistantMode === 'listing' || lastAssistantActionType) && isShortFollowUp) {
        return { mode: 'listing', content: trimmed };
    }

    return { mode: 'general', content: trimmed };
}

// --- CHATBOT HANDLING ---
async function handleChatSubmit(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (!requireAuth()) return;
    if (isLoading || !DOM.chatbotInput) return;

    const rawMessage = DOM.chatbotInput.value;
    const hasAttachment = Boolean(chatbotImageAttachment);
    const prepared = prepareAssistantMessage(rawMessage || '');
    let mode = prepared.mode;
    let content = prepared.content;

    if (hasAttachment && mode === 'listing') {
        mode = 'general';
    }

    if (!content && hasAttachment) {
        content = 'Please analyze the attached image.';
    }

    if (!content) return;

    if (DOM.pages.chatbot.classList.contains('hidden')) {
        showPage('chatbot');
    }

    const userAttachment = hasAttachment && chatbotImageAttachment ? {
        type: 'image',
        src: chatbotImageAttachment.base64,
        alt: chatbotImageAttachment.name || 'Attached image'
    } : null;

    await appendMessage(content, 'user', [], null, null, null, userAttachment);
    conversationHistory.push({ role: 'user', text: content, mode });
    trimConversationHistory();
    lastAssistantMode = mode;

    if (!currentChatbotSessionId) {
        createNewChatbotSession();
    }

    const historyPayload = getHistoryForMode(mode);
    const attachmentPayload = hasAttachment && chatbotImageAttachment ? {
        imageBase64: chatbotImageAttachment.base64,
        imageMimeType: chatbotImageAttachment.mime
    } : null;

    DOM.chatbotInput.value = '';
    showTypingIndicator();
    isLoading = true;

    try {
        console.log(`Submitting ${mode} message with API key:`, GEMINI_API_KEY ? 'Present' : 'Missing');
        if (hasAttachment) {
            clearChatbotAttachment();
        }

        const response = mode === 'listing'
            ? await handleListingAssistantQuery(content, GEMINI_API_KEY, historyPayload)
            : await handleChatbotQuery(content, GEMINI_API_KEY, historyPayload, attachmentPayload || undefined);

        hideTypingIndicator();

        if (!response.success) {
            let errorMessage = response.error || response.response || "I'm sorry, I couldn't generate a response.";
            if (errorMessage.includes('quota')) {
                errorMessage = "⚠️ API Quota Exceeded\n\nThe Gemini API quota has been exceeded. Please:\n\n• Wait a few minutes and try again\n• Check your API key usage limits\n• Consider upgrading your API plan if needed\n\nYou can still browse the car listings and use other features.";
            } else if (errorMessage.includes('API key') || errorMessage.includes('authentication')) {
                errorMessage = "⚠️ API Key Error\n\nThere's an issue with the API key. Please check your Gemini API key configuration.";
            } else if (errorMessage.includes('safety') || errorMessage.includes('blocked')) {
                errorMessage = "⚠️ Content Blocked\n\nYour query was blocked by safety filters. Please try rephrasing your question.";
            }
            await appendMessage(errorMessage, 'bot');
            showError(null, errorMessage);
            if (mode === 'listing') {
                lastAssistantMode = 'listing';
            } else {
                lastAssistantMode = 'general';
                lastAssistantActionType = null;
            }
            return;
        }

        if (response.response && response.response.startsWith('Error:')) {
            await appendMessage(response.response, 'bot');
            showError(null, response.response);
            if (mode === 'listing') {
                lastAssistantMode = 'listing';
            } else {
                lastAssistantMode = 'general';
                lastAssistantActionType = null;
            }
            return;
        }

        const messageId = response.message_id || null;
        const relevantCarIds = mode === 'listing' ? [] : (response.relevant_car_ids || []);
        const listingData = mode === 'listing' ? (response.listing_data || null) : null;
        const actionType = mode === 'listing' ? (response.action_type || null) : null;

        await appendMessage(response.response, 'bot', relevantCarIds, messageId, listingData, actionType);

        conversationHistory.push({
            role: 'bot',
            text: response.response,
            mode,
            metadata: {
                relevantCarIds,
                messageId,
                listingData,
                actionType
            }
        });
        trimConversationHistory();

        saveChatbotSession();

        if (mode === 'listing') {
            lastAssistantMode = 'listing';
            lastAssistantActionType = actionType;
        } else {
            lastAssistantMode = 'general';
            lastAssistantActionType = null;
            if (response.intent) {
                console.log('Detected intent:', response.intent);
            }
        }
    } catch (error) {
        hideTypingIndicator();
        const errorMsg = `I'm sorry, I encountered an error: ${error.message || 'Unknown error'}. Please try again later.`;
        await appendMessage(errorMsg, 'bot');
        console.error('Assistant error:', error);
        showError(null, errorMsg);
        if (mode === 'listing') {
            lastAssistantMode = 'listing';
        } else {
            lastAssistantMode = 'general';
            lastAssistantActionType = null;
        }
    } finally {
        isLoading = false;
    }
}

// --- ANALYTICS PAGE ---
let currentAnalyticsFilter = 'all';

async function renderAnalyticsPage(filter = 'all') {
    const container = document.getElementById('analytics-container');
    if (!container) return;
    
    currentAnalyticsFilter = filter;
    
    try {
        container.innerHTML = `
            <div class="loading-container">
                <div class="spinner"></div>
                <p class="text-gray-400 mt-4">Analyzing data...</p>
            </div>
        `;
        
        const response = await getAnalyticsInsights(filter);
        
        if (!response.success) {
            throw new Error(response.error || 'Failed to load analytics');
        }
        
        const insights = response.insights;
        const userStats = response.user_stats || {};
        const filterType = response.filter || 'all';
        const summaryCurrency = insights?.summary?.currency || 'AED';
        const averagePriceLabel = typeof insights?.summary?.average_price === 'number'
            ? formatCurrency(insights.summary.average_price, summaryCurrency)
            : 'N/A';
        const minPriceLabel = typeof insights?.summary?.min_price === 'number'
            ? formatCurrency(insights.summary.min_price, summaryCurrency)
            : 'N/A';
        const maxPriceLabel = typeof insights?.summary?.max_price === 'number'
            ? formatCurrency(insights.summary.max_price, summaryCurrency)
            : 'N/A';
        
        // Update filter buttons
        document.querySelectorAll('.analytics-filter-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.filter === filterType) {
                btn.classList.add('active');
            }
        });
        
        const filterLabel = filterType === 'my' ? 'My Listings' : filterType === 'favorites' ? 'My Favorites' : 'All Data';
        
        container.innerHTML = `
            <div class="space-y-6">
                ${filterType !== 'all' ? `
                <div class="analytics-card bg-gradient-to-r from-blue-600 to-purple-600">
                    <h3 class="text-lg font-bold text-white mb-2">📊 Personal Statistics</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <p class="text-sm text-blue-100">My Listings</p>
                            <p class="text-2xl font-bold text-white">${userStats.my_listings || 0}</p>
                        </div>
                        <div>
                            <p class="text-sm text-blue-100">My Favorites</p>
                            <p class="text-2xl font-bold text-white">${userStats.favorites || 0}</p>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <!-- Summary Cards -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="analytics-card interactive-card" data-metric="total">
                        <h3 class="text-sm text-gray-400 mb-1">Total Cars</h3>
                        <p class="text-3xl font-bold text-white">${insights.summary.total_cars}</p>
                        <p class="text-xs text-gray-500 mt-1">${filterLabel}</p>
                    </div>
                    <div class="analytics-card interactive-card" data-metric="makes">
                        <h3 class="text-sm text-gray-400 mb-1">Total Makes</h3>
                        <p class="text-3xl font-bold text-white">${insights.summary.total_makes}</p>
                        <p class="text-xs text-gray-500 mt-1">Unique brands</p>
                    </div>
                    <div class="analytics-card interactive-card" data-metric="price">
                        <h3 class="text-sm text-gray-400 mb-1">Avg Price</h3>
                        <p class="text-3xl font-bold text-white">${averagePriceLabel}</p>
                        <p class="text-xs text-gray-500 mt-1">Range: ${minPriceLabel} - ${maxPriceLabel}</p>
                    </div>
                    <div class="analytics-card interactive-card" data-metric="rating">
                        <h3 class="text-sm text-gray-400 mb-1">Avg Rating</h3>
                        <p class="text-3xl font-bold text-white">${insights.summary.average_rating.toFixed(1)} ⭐</p>
                        <p class="text-xs text-gray-500 mt-1">Out of 5.0</p>
                    </div>
                </div>
                
                <!-- AI Insights -->
                <div class="analytics-card">
                    <h2 class="text-2xl font-bold text-white mb-4">🤖 AI-Powered Insights</h2>
                    <div class="prose prose-invert max-w-none">
                        <div class="text-gray-300 whitespace-pre-line">${insights.ai_insights || 'AI insights unavailable'}</div>
                    </div>
                </div>
                
                <!-- Top Makes with Interactive Bars -->
                <div class="analytics-card">
                    <h2 class="text-2xl font-bold text-white mb-4">📈 Top Makes Distribution</h2>
                    <div class="space-y-3">
                        ${insights.top_makes.map((item, index) => {
                            const maxCount = Math.max(...insights.top_makes.map(m => m.count));
                            const percentage = (item.count / maxCount) * 100;
                            return `
                            <div class="analytics-bar-item">
                                <div class="flex items-center justify-between mb-1">
                                    <span class="text-white font-semibold">${index + 1}. ${item.make}</span>
                                    <span class="text-blue-400 font-bold">${item.count} cars</span>
                                </div>
                                <div class="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                                    <div class="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500" style="width: ${percentage}%"></div>
                                </div>
                            </div>
                        `;
                        }).join('')}
                    </div>
                </div>
                
                <!-- Price Distribution with Interactive Bars -->
                <div class="analytics-card">
                    <h2 class="text-2xl font-bold text-white mb-4">💰 Price Distribution</h2>
                    <div class="space-y-3">
                        ${Object.entries(insights.price_distribution).map(([range, count]) => {
                            const maxCount = Math.max(...Object.values(insights.price_distribution));
                            const percentage = (count / maxCount) * 100;
                            return `
                            <div class="analytics-bar-item">
                                <div class="flex items-center justify-between mb-1">
                                    <span class="text-white">${range}</span>
                                    <span class="text-blue-400 font-bold">${count} cars</span>
                                </div>
                                <div class="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                                    <div class="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-500" style="width: ${percentage}%"></div>
                                </div>
                            </div>
                        `;
                        }).join('')}
                    </div>
                </div>
                
                <!-- Top Rated Cars -->
                <div class="analytics-card">
                    <h2 class="text-2xl font-bold text-white mb-4">Top Rated Cars</h2>
                    <div class="space-y-2">
                        ${insights.top_rated_cars.map((car, index) => `
                            <div class="flex items-center justify-between p-3 bg-gray-800 bg-opacity-50 rounded-lg hover:bg-opacity-70 cursor-pointer" data-car-id="${car.id}">
                                <div>
                                    <span class="text-white font-semibold">${index + 1}. ${car.make} ${car.model}</span>
                                    <span class="text-yellow-400 ml-2">⭐ ${car.rating.toFixed(1)}</span>
                                </div>
                                <span class="text-blue-400 font-bold">${formatCurrency(car.price, car.currency || 'AED')}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        
        // Add click handlers for top rated cars
        container.querySelectorAll('[data-car-id]').forEach(el => {
            el.addEventListener('click', async () => {
                const carId = parseInt(el.dataset.carId);
                const { getCar } = await import('./api.js');
                try {
                    const carResponse = await getCar(carId);
                    if (carResponse.success && carResponse.car) {
                        showCarInfoModal(carResponse.car);
                    }
                } catch (error) {
                    console.error('Error loading car:', error);
                }
            });
        });
    } catch (error) {
        console.error('Error rendering analytics:', error);
        const container = document.getElementById('analytics-container');
        if (container) {
            container.innerHTML = `
                <div class="error-container">
                    <div class="error-icon">⚠️</div>
                    <h3 class="text-xl font-bold text-white mb-2">Failed to Load Analytics</h3>
                    <p class="text-gray-400">${error.message || 'An error occurred'}</p>
                </div>
            `;
        }
    }
}

// --- PROFILE PAGE ---
async function renderProfilePage() {
    // Wait a bit to ensure page is visible
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const container = document.getElementById('profile-container');
    if (!container) {
        console.error('Profile container not found! Attempting to find page-profile...');
        const pageProfile = document.getElementById('page-profile');
        if (pageProfile) {
            console.log('Found page-profile, searching for container inside...');
            const foundContainer = pageProfile.querySelector('#profile-container');
            if (foundContainer) {
                console.log('Found container inside page-profile');
                // Use the found container
                renderProfileContent(foundContainer);
                return;
            }
        }
        console.error('Could not find profile-container anywhere!');
        return;
    }
    
    await renderProfileContent(container);
}

async function renderProfileContent(container) {
    try {
        container.innerHTML = `
            <div class="loading-container">
                <div class="spinner"></div>
                <p class="text-gray-400 mt-4">Loading profile...</p>
            </div>
        `;
        
        const response = await getProfile();
        
        if (!response || !response.success) {
            throw new Error(response?.error || 'Failed to load profile');
        }
        
        if (!response.profile) {
            throw new Error('Profile data not found in response');
        }
        
        const profile = response.profile;
        const createdDate = profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A';
        const lastLogin = profile.last_login ? new Date(profile.last_login).toLocaleDateString() : 'Never';
        
        container.innerHTML = `
            <div class="space-y-6">
                <div class="analytics-card">
                    <h2 class="text-2xl font-bold text-white mb-2">👤 Profile Management</h2>
                    <p class="text-gray-400 mb-6">Update your account information and password</p>
                    <form id="profile-form" class="space-y-6">
                        <!-- Username Section -->
                        <div class="space-y-2">
                            <label class="block text-sm font-medium text-gray-300 mb-2">
                                <span class="flex items-center gap-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                    </svg>
                                    Username
                                </span>
                            </label>
                            <input type="text" id="profile-username" name="username" class="form-input" value="${profile.username}" required minlength="3" maxlength="30">
                            <p class="text-xs text-gray-500">Your username must be between 3 and 30 characters</p>
                        </div>
                        
                        <!-- Email Section -->
                        <div class="space-y-2">
                            <label class="block text-sm font-medium text-gray-300 mb-2">
                                <span class="flex items-center gap-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                                    </svg>
                                    Email Address
                                </span>
                            </label>
                            <input type="email" id="profile-email" name="email" class="form-input" value="${profile.email}" required>
                            <p class="text-xs text-gray-500">We'll never share your email with anyone else</p>
                        </div>
                        
                        <!-- Password Change Section -->
                        <div class="pt-4 border-t border-gray-700">
                            <h3 class="text-lg font-bold text-white mb-2 flex items-center gap-2">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                                </svg>
                                Change Password
                            </h3>
                            <p class="text-sm text-gray-400 mb-4">Leave password fields blank if you don't want to change your password</p>
                            <div class="space-y-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-300 mb-2">Current Password *</label>
                                    <input type="password" id="profile-current-password" name="current_password" class="form-input" placeholder="Enter your current password" autocomplete="current-password">
                                    <p class="text-xs text-gray-500 mt-1">Required only if changing password</p>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-300 mb-2">New Password</label>
                                    <input type="password" id="profile-password" name="password" class="form-input" placeholder="Enter new password (minimum 6 characters)" autocomplete="new-password" minlength="6">
                                    <p class="text-xs text-gray-500 mt-1">Must be at least 6 characters long</p>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-300 mb-2">Confirm New Password</label>
                                    <input type="password" id="profile-password-confirm" name="password_confirm" class="form-input" placeholder="Confirm your new password" autocomplete="new-password" minlength="6">
                                    <p class="text-xs text-gray-500 mt-1" id="password-match-message"></p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Account Info Section -->
                        <div class="pt-4 border-t border-gray-700">
                            <h3 class="text-lg font-bold text-white mb-4">Account Information</h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div class="bg-gray-800 bg-opacity-50 p-3 rounded-lg">
                                    <p class="text-gray-400 mb-1">Account Created</p>
                                    <p class="text-white font-semibold">${createdDate}</p>
                                </div>
                                <div class="bg-gray-800 bg-opacity-50 p-3 rounded-lg">
                                    <p class="text-gray-400 mb-1">Last Login</p>
                                    <p class="text-white font-semibold">${lastLogin}</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Action Buttons -->
                        <div class="flex justify-end gap-3 pt-4 border-t border-gray-700">
                            <button type="button" id="profile-cancel-btn" class="bg-gray-600 text-white py-2 px-6 rounded-lg hover:bg-gray-700 transition-colors">Reset</button>
                            <button type="submit" class="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors font-semibold">Save Changes</button>
                        </div>
                    </form>
                    <div id="profile-error" class="hidden mt-4 p-4 bg-red-900 bg-opacity-50 border border-red-500 rounded-lg text-red-200"></div>
                    <div id="profile-success" class="hidden mt-4 p-4 bg-green-900 bg-opacity-50 border border-green-500 rounded-lg text-green-200"></div>
                </div>
            </div>
        `;
        
        // Add password confirmation validation
        const passwordInput = document.getElementById('profile-password');
        const passwordConfirmInput = document.getElementById('profile-password-confirm');
        const passwordMatchMessage = document.getElementById('password-match-message');
        
        if (passwordInput && passwordConfirmInput && passwordMatchMessage) {
            const validatePasswordMatch = () => {
                const password = passwordInput.value;
                const confirm = passwordConfirmInput.value;
                
                if (confirm.length === 0) {
                    passwordMatchMessage.textContent = '';
                    passwordConfirmInput.classList.remove('border-red-500', 'border-green-500');
                    return;
                }
                
                if (password === confirm) {
                    passwordMatchMessage.textContent = '✓ Passwords match';
                    passwordMatchMessage.classList.add('text-green-400');
                    passwordMatchMessage.classList.remove('text-red-400');
                    passwordConfirmInput.classList.add('border-green-500');
                    passwordConfirmInput.classList.remove('border-red-500');
                } else {
                    passwordMatchMessage.textContent = '✗ Passwords do not match';
                    passwordMatchMessage.classList.add('text-red-400');
                    passwordMatchMessage.classList.remove('text-green-400');
                    passwordConfirmInput.classList.add('border-red-500');
                    passwordConfirmInput.classList.remove('border-green-500');
                }
            };
            
            passwordInput.addEventListener('input', validatePasswordMatch);
            passwordConfirmInput.addEventListener('input', validatePasswordMatch);
        }
        
        // Add form submit handler
        const profileForm = document.getElementById('profile-form');
        if (profileForm) {
            profileForm.addEventListener('submit', handleProfileUpdate);
        }
        
        const cancelBtn = document.getElementById('profile-cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                // Reset form to original values
                renderProfilePage();
            });
        }
    } catch (error) {
        console.error('Error rendering profile:', error);
        if (container) {
            container.innerHTML = `
                <div class="analytics-card">
                    <div class="text-center py-8">
                        <div class="text-6xl mb-4">⚠️</div>
                        <h3 class="text-xl font-bold text-white mb-2">Failed to Load Profile</h3>
                        <p class="text-gray-400 mb-4">${error.message || 'An error occurred while loading your profile'}</p>
                        <div class="flex gap-3 justify-center">
                            <button onclick="window.renderProfilePage && window.renderProfilePage()" class="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">
                                Retry
                            </button>
                            <button onclick="location.reload()" class="bg-gray-600 text-white py-2 px-6 rounded-lg hover:bg-gray-700 transition-colors">
                                Reload Page
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            console.error('Profile container not available for error display!');
        }
    }
}

// Make renderProfilePage available globally for retry button
window.renderProfilePage = renderProfilePage;

async function handleProfileUpdate(event) {
    event.preventDefault();
    
    if (isLoading) return;
    isLoading = true;
    
    const errorDiv = document.getElementById('profile-error');
    const successDiv = document.getElementById('profile-success');
    
    if (errorDiv) errorDiv.classList.add('hidden');
    if (successDiv) successDiv.classList.add('hidden');
    
    try {
        const usernameInput = document.getElementById('profile-username');
        const emailInput = document.getElementById('profile-email');
        const currentPasswordInput = document.getElementById('profile-current-password');
        const newPasswordInput = document.getElementById('profile-password');
        const passwordConfirmInput = document.getElementById('profile-password-confirm');
        
        // Validate username
        const username = usernameInput.value.trim();
        if (username.length < 3 || username.length > 30) {
            throw new Error('Username must be between 3 and 30 characters');
        }
        
        // Validate email
        const email = emailInput.value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Please enter a valid email address');
        }
        
        const updates = {
            username: username,
            email: email
        };
        
        // Handle password change
        const newPassword = newPasswordInput ? newPasswordInput.value : '';
        const passwordConfirm = passwordConfirmInput ? passwordConfirmInput.value : '';
        
        if (newPassword) {
            if (newPassword.length < 6) {
                throw new Error('New password must be at least 6 characters long');
            }
            
            if (newPassword !== passwordConfirm) {
                throw new Error('New passwords do not match');
            }
            
            const currentPassword = currentPasswordInput ? currentPasswordInput.value : '';
            if (!currentPassword) {
                throw new Error('Current password is required to change password');
            }
            
            updates.password = newPassword;
            updates.current_password = currentPassword;
        }
        
        const response = await updateProfile(updates);
        
        if (response.success) {
            if (successDiv) {
                successDiv.textContent = response.message || 'Profile updated successfully!';
                successDiv.classList.remove('hidden');
            }
            showSuccess('Profile updated successfully!');
            
            // Update current user data
            if (updates.username) {
                currentUser.username = updates.username;
                setUserData(currentUser);
                updateAuthUI();
            }
            
            // Clear password fields
            if (document.getElementById('profile-current-password')) {
                document.getElementById('profile-current-password').value = '';
            }
            if (document.getElementById('profile-password')) {
                document.getElementById('profile-password').value = '';
            }
            if (document.getElementById('profile-password-confirm')) {
                document.getElementById('profile-password-confirm').value = '';
            }
            
            // Reload profile after a short delay
            setTimeout(() => renderProfilePage(), 1500);
        } else {
            throw new Error(response.error || 'Failed to update profile');
        }
    } catch (error) {
        console.error("Profile update error:", error);
        if (errorDiv) {
            errorDiv.textContent = error.message || 'Could not update profile';
            errorDiv.classList.remove('hidden');
        }
        showError(null, `Could not update profile: ${error.message}`);
    } finally {
        isLoading = false;
    }
}

// --- REVIEWS PAGE ---
async function renderReviewsPage() {
    try {
        showLoadingState(DOM.reviewsContainer);
        const response = await getCars({ sort: 'rating-desc', limit: 50 });
        
        if (response.success) {
            const topRatedCars = response.cars || [];
            renderCarList(topRatedCars, DOM.reviewsContainer, favorites);
        } else {
            throw new Error(response.error || 'Failed to fetch reviews');
        }
    } catch (error) {
        console.error("Could not fetch reviews:", error);
        showError(DOM.reviewsContainer, "Could not load top rated vehicles.");
    } finally {
        hideLoadingState();
    }
}

// --- MY LISTINGS PAGE ---
async function renderMyListingsPage() {
    try {
        showLoadingState(DOM.myListingsContainer);
        const response = await getMyListings();
        
        if (response.success) {
            const myCars = response.cars || [];
            if (myCars.length === 0) {
                DOM.myListingsContainer.innerHTML = `
                    <div class="text-center py-12">
                        <div class="text-6xl mb-4">🚗</div>
                        <h3 class="text-xl font-bold text-white mb-2">No Listings Yet</h3>
                        <p class="text-gray-400 mb-6">You haven't created any listings yet. Start by adding your first car!</p>
                        <button id="go-to-add-listing" class="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">
                            Add Your First Listing
                        </button>
                    </div>
                `;
                const btn = document.getElementById('go-to-add-listing');
                if (btn) {
                    btn.addEventListener('click', () => showPage('addListing'));
                }
            } else {
                renderCarList(myCars, DOM.myListingsContainer, [], true); // true = show edit/delete buttons
            }
        } else {
            throw new Error(response.error || 'Failed to fetch my listings');
        }
    } catch (error) {
        console.error("Could not fetch my listings:", error);
        showError(DOM.myListingsContainer, "Could not load your listings.");
    } finally {
        hideLoadingState();
    }
}

// --- EDIT LISTING ---
function showEditListingModal(car) {
    if (!DOM.editListingModal || !DOM.editListingForm) return;
    
    // Populate form with car data
    document.getElementById('edit-car-id').value = car.id;
    document.getElementById('edit-make').value = car.make || '';
    document.getElementById('edit-model').value = car.model || '';
    document.getElementById('edit-year').value = car.year || '';
    document.getElementById('edit-price').value = car.price || '';
    document.getElementById('edit-currency').value = car.currency || 'AED';
    document.getElementById('edit-rating').value = car.rating || 0;
    document.getElementById('edit-image').value = car.image || '';
    
    const specs = car.specs || {};
    document.getElementById('edit-bodyStyle').value = specs.bodyStyle || '';
    document.getElementById('edit-horsepower').value = specs.horsepower || '';
    document.getElementById('edit-engine').value = specs.engine || '';
    document.getElementById('edit-fuelEconomy').value = specs.fuelEconomy || '';
    
    DOM.editListingModal.classList.remove('hidden');
}

function hideEditListingModal() {
    if (DOM.editListingModal) {
        DOM.editListingModal.classList.add('hidden');
        if (DOM.editListingForm) {
            DOM.editListingForm.reset();
        }
    }
}

async function handleEditListing(event) {
    event.preventDefault();
    
    if (isLoading) return;
    isLoading = true;
    
    try {
        const carId = parseInt(document.getElementById('edit-car-id').value);
        const imageUrl = document.getElementById('edit-image').value;
        const updates = {
            make: document.getElementById('edit-make').value,
            model: document.getElementById('edit-model').value,
            year: document.getElementById('edit-year').value ? parseInt(document.getElementById('edit-year').value) : null,
            price: document.getElementById('edit-price').value ? parseFloat(document.getElementById('edit-price').value) : null,
            currency: document.getElementById('edit-currency').value || 'AED',
            image_url: imageUrl,
            image: imageUrl, // Also include 'image' field for compatibility
            rating: document.getElementById('edit-rating').value ? parseFloat(document.getElementById('edit-rating').value) : null,
            specs: {
                bodyStyle: document.getElementById('edit-bodyStyle').value || 'Unknown',
                horsepower: document.getElementById('edit-horsepower').value ? parseInt(document.getElementById('edit-horsepower').value) : 0,
                engine: document.getElementById('edit-engine').value || 'N/A',
                fuelEconomy: document.getElementById('edit-fuelEconomy').value || 'N/A'
            }
        };
        
        const response = await updateCar(carId, updates);
        
        if (response.success) {
            showSuccess('Listing updated successfully!');
            hideEditListingModal();
            
            // Refresh my listings page
            await renderMyListingsPage();
            
            // Also refresh main listings if currently viewing
            if (DOM.pages.listings && !DOM.pages.listings.classList.contains('hidden')) {
                await fetchCarData();
                applyFiltersAndRender();
            }
        } else {
            throw new Error(response.error || 'Failed to update listing');
        }
    } catch (error) {
        console.error("Edit listing error:", error);
        showError(null, `Could not update listing: ${error.message}`);
    } finally {
        isLoading = false;
    }
}

function isNavDropdownOpen() {
    return DOM.navMoreMenu && !DOM.navMoreMenu.classList.contains('hidden');
}

function openNavDropdown() {
    if (!DOM.navMoreMenu) return;
    DOM.navMoreMenu.classList.remove('hidden');
    DOM.navMoreToggle?.setAttribute('aria-expanded', 'true');
}

function closeNavDropdown() {
    if (!DOM.navMoreMenu) return;
    DOM.navMoreMenu.classList.add('hidden');
    DOM.navMoreToggle?.setAttribute('aria-expanded', 'false');
}

function toggleNavDropdown() {
    if (!DOM.navMoreMenu) return;
    if (isNavDropdownOpen()) {
        closeNavDropdown();
    } else {
        openNavDropdown();
    }
}

function updateThemeToggleUI() {
    if (!DOM.themeToggleButtons) return;
    DOM.themeToggleButtons.forEach(btn => {
        const btnTheme = btn?.dataset?.theme;
        if (!btnTheme) return;
        btn.classList.toggle('active', btnTheme === currentTheme);
    });
}

function applyTheme(theme = DEFAULT_THEME) {
    const normalizedTheme = SUPPORTED_THEMES.includes(theme) ? theme : DEFAULT_THEME;
    currentTheme = normalizedTheme;
    const body = document.body;
    if (body) {
        body.classList.remove('theme-light', 'theme-dark');
        body.classList.add(`theme-${normalizedTheme}`);
    }
    persistPreference(THEME_STORAGE_KEY, normalizedTheme);
    updateThemeToggleUI();
}

function setupPreferenceEventHandlers() {
    if (DOM.themeToggleButtons && DOM.themeToggleButtons.length) {
        DOM.themeToggleButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const preferredTheme = btn.dataset.theme;
                if (preferredTheme) {
                    applyTheme(preferredTheme);
                }
            });
        });
    }

    if (DOM.settingsCurrencySelect) {
        DOM.settingsCurrencySelect.addEventListener('change', (event) => {
            updatePreferredCurrency(event.target.value);
        });
    }
}

function initializePreferenceUI() {
    applyTheme(currentTheme);
    if (DOM.settingsCurrencySelect) {
        DOM.settingsCurrencySelect.value = preferredCurrency;
    }
    updateThemeToggleUI();
    applyAssistantTipsPreference();
}

function updatePreferredCurrency(currencyCode) {
    if (!currencyCode || !CURRENCY_TABLE[currencyCode]) {
        return;
    }
    preferredCurrency = currencyCode;
    persistPreference(CURRENCY_STORAGE_KEY, currencyCode);
    if (DOM.settingsCurrencySelect && DOM.settingsCurrencySelect.value !== currencyCode) {
        DOM.settingsCurrencySelect.value = currencyCode;
    }
    refreshCurrencyDisplays().catch(error => console.warn('Failed to refresh currency displays:', error));
}

function isAssistantTipsHidden() {
    return getStoredPreference(ASSISTANT_TIPS_STORAGE_KEY, 'false') === 'true';
}

function setAssistantTipsHidden(hidden) {
    persistPreference(ASSISTANT_TIPS_STORAGE_KEY, hidden ? 'true' : 'false');
}

function applyAssistantTipsPreference() {
    if (!DOM.assistantTipsPanel) return;
    DOM.assistantTipsPanel.classList.toggle('hidden', isAssistantTipsHidden());
}

function setupAssistantTipsHandlers() {
    if (DOM.assistantTipsDismissBtn) {
        DOM.assistantTipsDismissBtn.addEventListener('click', (event) => {
            event.preventDefault();
            setAssistantTipsHidden(true);
            applyAssistantTipsPreference();
        });
    }
}

async function refreshCurrencyDisplays() {
    const visiblePages = Object.entries(DOM.pages)
        .filter(([, pageEl]) => pageEl && !pageEl.classList.contains('hidden'))
        .map(([key]) => key);

    for (const pageId of visiblePages) {
        try {
            if (pageId === 'listings') {
                if (isLoading && allCars.length && DOM.listingsContainer) {
                    renderCarList(allCars, DOM.listingsContainer, favorites);
                } else {
                    await applyFiltersAndRender();
                }
            } else if (pageId === 'favorites') {
                await renderFavoritesPage();
            } else if (pageId === 'reviews') {
                await renderReviewsPage();
            } else if (pageId === 'myListings') {
                await renderMyListingsPage();
            } else if (pageId === 'analytics') {
                await renderAnalyticsPage(currentAnalyticsFilter);
            }
        } catch (error) {
            console.warn(`Failed to refresh ${pageId} for currency change:`, error);
        }
    }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    console.log('Setting up event listeners...');
    console.log('DOM.loginForm:', DOM.loginForm);
    console.log('DOM.signupForm:', DOM.signupForm);
    
    setupListingImageInteractions();
    setupChatbotAttachmentHandlers();
    setupGlobalFileDropGuards();
    setupPreferenceEventHandlers();
    setupAssistantTipsHandlers();
    if (DOM.listingImageStatus && !DOM.listingImageStatus.textContent) {
        setListingImageStatus('Drop, paste, or browse a photo to auto-host it for your listing.', 'muted');
    }
    if (DOM.chatbotAttachmentHint) {
        DOM.chatbotAttachmentHint.textContent = CHATBOT_ATTACHMENT_HINT_DEFAULT;
    }

    // Authentication
    if (DOM.loginForm) {
        console.log('Adding login form listener');
        DOM.loginForm.addEventListener('submit', handleLogin);
    } else {
        console.error('DOM.loginForm is null! Form not found.');
    }
    
    if (DOM.signupForm) {
        console.log('Adding signup form listener');
        DOM.signupForm.addEventListener('submit', handleSignup);
    } else {
        console.error('DOM.signupForm is null! Form not found.');
    }
    
    if (DOM.switchToSignup) {
        DOM.switchToSignup.addEventListener('click', () => showPage('signup'));
    }
    if (DOM.switchToLogin) {
        DOM.switchToLogin.addEventListener('click', () => showPage('login'));
    }
    if (DOM.navLogout) {
        DOM.navLogout.addEventListener('click', (event) => {
            closeNavDropdown();
            handleLogout(event);
        });
    }

    if (DOM.navMoreToggle) {
        DOM.navMoreToggle.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleNavDropdown();
        });
    }
    if (DOM.navMoreMenu) {
        DOM.navMoreMenu.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    }
    
    // Logo Button
    if (DOM.logoBtn) {
        DOM.logoBtn.addEventListener('click', () => {
            if (isAuthenticated) {
                applyFiltersAndRender();
                showPage('listings');
            } else {
                showPage('login');
            }
        });
    }
    
    // Mobile Menu Toggle
    if (DOM.mobileMenuToggle) {
        DOM.mobileMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (DOM.mobileMenu) {
                DOM.mobileMenu.classList.toggle('hidden');
            }
        });
    }
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', (event) => {
        if (DOM.mobileMenu && DOM.mobileMenuToggle) {
            const isClickInsideMenu = DOM.mobileMenu.contains(event.target);
            const isClickOnToggle = DOM.mobileMenuToggle.contains(event.target);
            
            if (!isClickInsideMenu && !isClickOnToggle && !DOM.mobileMenu.classList.contains('hidden')) {
                DOM.mobileMenu.classList.add('hidden');
            }
        }

        if (DOM.navMoreMenu && DOM.navMoreToggle) {
            const isClickInsideDropdown = DOM.navMoreMenu.contains(event.target);
            const isClickOnNavToggle = DOM.navMoreToggle.contains(event.target);
            if (!isClickInsideDropdown && !isClickOnNavToggle && isNavDropdownOpen()) {
                closeNavDropdown();
            }
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (DOM.mobileMenu && !DOM.mobileMenu.classList.contains('hidden')) {
                DOM.mobileMenu.classList.add('hidden');
            }
            closeNavDropdown();
        }
    });
    
    // Mobile Navigation Buttons
    const mobileNavMap = {
        'mobile-nav-listings': () => { if (requireAuth()) { showPage('listings'); applyFiltersAndRender(); } },
        'mobile-nav-reviews': () => { if (requireAuth()) { showPage('reviews'); renderReviewsPage(); } },
        'mobile-nav-favorites': () => { if (requireAuth()) { showPage('favorites'); renderFavoritesPage(); } },
        'mobile-nav-my-listings': () => { if (requireAuth()) { showPage('myListings'); renderMyListingsPage(); } },
        'mobile-nav-chatbot': () => { if (requireAuth()) { showPage('chatbot'); renderChatbotChatList(); } },
        'mobile-nav-analytics': () => { if (requireAuth()) { showPage('analytics'); } },
        'mobile-nav-add-listing': () => { if (requireAuth()) { showPage('addListing'); } },
    };
    
    Object.entries(mobileNavMap).forEach(([id, handler]) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', async () => {
                await handler();
                if (DOM.mobileMenu) {
                    DOM.mobileMenu.classList.add('hidden');
                }
            });
        }
    });

    // Navigation (only if authenticated)
    if (DOM.navButtons.listings) {
        DOM.navButtons.listings.addEventListener('click', async () => {
            if (!requireAuth()) return;
            closeNavDropdown();
            showPage('listings');
            await applyFiltersAndRender();
        });
    }
    
    if (DOM.navButtons.reviews) {
        DOM.navButtons.reviews.addEventListener('click', async () => {
            if (!requireAuth()) return;
            closeNavDropdown();
            showPage('reviews');
            await renderReviewsPage();
        });
    }
    
    if (DOM.navButtons.favorites) {
        DOM.navButtons.favorites.addEventListener('click', async () => {
            if (!requireAuth()) return;
            closeNavDropdown();
            showPage('favorites');
            await renderFavoritesPage();
        });
    }
    
    if (DOM.navButtons.myListings) {
        DOM.navButtons.myListings.addEventListener('click', async () => {
            if (!requireAuth()) return;
            closeNavDropdown();
            showPage('myListings');
            await renderMyListingsPage();
        });
    }
    
    if (DOM.navButtons.chatbot) {
        DOM.navButtons.chatbot.addEventListener('click', () => {
            if (!requireAuth()) return;
            closeNavDropdown();
            showPage('chatbot');
            renderChatbotChatList();
        });
    }
    
    if (DOM.navButtons.profile) {
        DOM.navButtons.profile.addEventListener('click', async () => {
            if (!requireAuth()) return;
            closeNavDropdown();
            showPage('profile');
            // Small delay to ensure page is visible before rendering
            setTimeout(async () => {
                await renderProfilePage();
            }, 100);
        });
    }
    
    if (DOM.navButtons.analytics) {
        DOM.navButtons.analytics.addEventListener('click', async () => {
            if (!requireAuth()) return;
            closeNavDropdown();
            showPage('analytics');
            await renderAnalyticsPage(currentAnalyticsFilter);
        });
    }
    
    // Analytics filter buttons
    document.querySelectorAll('.analytics-filter-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const filter = btn.dataset.filter;
            await renderAnalyticsPage(filter);
        });
    });
    
    if (DOM.navButtons.addListing) {
        DOM.navButtons.addListing.addEventListener('click', () => {
            if (!requireAuth()) return;
            closeNavDropdown();
            showPage('addListing');
        });
    }

    // Form Submission
    DOM.addListingForm.addEventListener('submit', handleAddListing);

    if (DOM.priceEstimateBtn) {
        DOM.priceEstimateBtn.addEventListener('click', handlePriceEstimateClick);
    }
    if (DOM.visionAnalyzeBtn) {
        DOM.visionAnalyzeBtn.addEventListener('click', handleVisionAnalysis);
    }
    if (DOM.visionApplyBtn) {
        DOM.visionApplyBtn.addEventListener('click', applyVisionSuggestion);
    }
    if (DOM.semanticSearchBtn) {
        DOM.semanticSearchBtn.addEventListener('click', handleSemanticSearch);
    }
    if (DOM.semanticSearchInput) {
        DOM.semanticSearchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                handleSemanticSearch(event);
            }
        });
    }

    // Event Delegation for Favorite, Details, Edit, Delete Buttons
    document.body.addEventListener('click', async (event) => {
        // Favorite button
        const favoriteBtn = event.target.closest('.favorite-btn');
        if (favoriteBtn && favoriteBtn.dataset.carId) {
            event.preventDefault();
            event.stopPropagation();
            await toggleFavorite(parseInt(favoriteBtn.dataset.carId));
            return;
        }
        
        // Details button
        const detailsBtn = event.target.closest('.details-button');
        if (detailsBtn && detailsBtn.dataset.carId) {
            event.preventDefault();
            event.stopPropagation();
            const carId = parseInt(detailsBtn.dataset.carId);
            try {
                const response = await getCar(carId);
                if (response.success && response.car) {
                    showCarInfoModal(response.car);
                } else {
                    // Fallback to local data
                    const car = allCars.find(c => c.id === carId);
                    if (car) {
                        showCarInfoModal(car);
                    } else {
                        showError(null, 'Car not found');
                    }
                }
            } catch (error) {
                console.error('Error fetching car:', error);
                // Fallback to local data
                const car = allCars.find(c => c.id === carId);
                if (car) {
                    showCarInfoModal(car);
                } else {
                    showError(null, 'Could not load car details');
                }
            }
            return;
        }
        
        // Edit button
        const editBtn = event.target.closest('.edit-button');
        if (editBtn && editBtn.dataset.carId) {
            event.preventDefault();
            event.stopPropagation();
            const carId = parseInt(editBtn.dataset.carId);
            const car = allCars.find(c => c.id === carId);
            if (car) {
                // TODO: Implement edit modal
                alert('Edit functionality coming soon!');
            }
            return;
        }
        
        // Delete button
        const deleteBtn = event.target.closest('.delete-button');
        if (deleteBtn && deleteBtn.dataset.carId) {
            event.preventDefault();
            event.stopPropagation();
            const carId = parseInt(deleteBtn.dataset.carId);
            await handleDeleteCar(carId);
            return;
        }
    });

    // Filters
    DOM.searchInput.addEventListener('input', debounce(applyFiltersAndRender, 300));
    DOM.makeFilter.addEventListener('change', applyFiltersAndRender);
    DOM.sortFilter.addEventListener('change', applyFiltersAndRender);

    // Chatbot
    if (DOM.chatbotSendBtn) {
        DOM.chatbotSendBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleChatSubmit(e);
        });
    }
    if (DOM.chatbotInput) {
        DOM.chatbotInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.stopPropagation();
                handleChatSubmit(event);
            }
        });
    }

    // Chatbot New Chat
    if (DOM.chatbotNewChatBtn) {
        DOM.chatbotNewChatBtn.addEventListener('click', () => {
            if (!requireAuth()) return;
            createNewChatbotSession();
            showSuccess('Started a new chat');
        });
    }

    // Modal
    DOM.carInfoCloseBtn.addEventListener('click', () => DOM.carInfoModal.classList.add('hidden'));
    DOM.carInfoModal.addEventListener('click', (event) => {
        if (event.target === DOM.carInfoModal) DOM.carInfoModal.classList.add('hidden');
    });
}

// --- UTILITY FUNCTIONS ---
function convertCurrency(value, fromCurrency = 'AED', toCurrency = preferredCurrency) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return null;
    }
    const from = CURRENCY_TABLE[fromCurrency] || CURRENCY_TABLE.AED;
    const to = CURRENCY_TABLE[toCurrency] || CURRENCY_TABLE.AED;
    const amountInAed = value * (from?.rate || 1);
    return amountInAed / (to?.rate || 1);
}

function formatCurrency(value, sourceCurrency = 'AED', targetCurrency = preferredCurrency) {
    const converted = convertCurrency(value, sourceCurrency, targetCurrency);
    if (converted === null) {
        return 'N/A';
    }
    const formatterLocale = CURRENCY_TABLE[targetCurrency]?.locale || undefined;
    return new Intl.NumberFormat(formatterLocale, {
        style: 'currency',
        currency: targetCurrency,
        maximumFractionDigits: 0
    }).format(converted);
}

setPriceFormatter((value, originalCurrency) => formatCurrency(value, originalCurrency));

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file. Please try another image.'));
        reader.readAsDataURL(file);
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- INITIALIZATION ---
async function init() {
    console.log('🚀 IntelliWheels Initializing...');
    
    // Wait for DOM to be fully ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
        return;
    }
    
    // Check if DOM elements exist
    if (!DOM.listingsContainer || !DOM.searchInput || !DOM.makeFilter) {
        console.error('DOM elements not found!');
        setTimeout(init, 100);
        return;
    }
    
    // Setup event listeners first
    setupEventListeners();
    showPage('listings');
    createParticles();
    
    // Check backend health
    try {
        const health = await healthCheck();
        if (!health.success) {
            console.warn('Backend not available:', health.error);
            showError(null, '⚠️ Backend server not available. Please start the Flask server (python app.py)');
        } else {
            console.log('✅ Backend is healthy');
        }
    } catch (error) {
        console.warn('Health check failed:', error);
    }
    
    // Load favorites
    try {
        favorites = await fetchFavorites();
        console.log(`Loaded ${favorites.length} favorites`);
    } catch (error) {
        console.error('Failed to load favorites:', error);
        favorites = Storage.getFavorites();
    }
    
    // Load makes for filter
    try {
        await loadMakes();
    } catch (error) {
        console.error('Failed to load makes:', error);
    }
    
    // Load initial car data
    try {
        const cars = await fetchCarData();
        console.log(`Loaded ${cars.length} cars`);
        
        if (cars.length > 0) {
            applyFiltersAndRender();
            // Load reviews page
            await renderReviewsPage();
        } else {
            console.warn('No cars found in database');
            showError(DOM.listingsContainer, 'No cars found. Please run the data ingestion script: python ingest_excel_to_db.py');
        }
    } catch (error) {
        console.error('Failed to load cars:', error);
        showError(DOM.listingsContainer, `Failed to load cars: ${error.message}`);
    }
    
    console.log('✅ IntelliWheels Ready!');
}

async function init() {
    console.log('🚀 IntelliWheels Initializing...');
    
    // Wait for DOM to be fully ready
    if (document.readyState === 'loading') {
        console.log('DOM still loading, waiting...');
        document.addEventListener('DOMContentLoaded', init);
        return;
    }
    
    console.log('DOM is ready, checking elements...');
    
    // Refresh DOM elements to ensure they're all available
    refreshDOM();
    initializePreferenceUI();
    
    // Load chat sessions from localStorage
    chatbotSessions = Storage.getChatbotSessions();
    
    // Create initial sessions if none exist
    if (chatbotSessions.length === 0) {
        createNewChatbotSession();
    } else {
        currentChatbotSessionId = chatbotSessions[0].id;
        conversationHistory = normalizeHistory(chatbotSessions[0].history || []);
        const lastMessage = conversationHistory[conversationHistory.length - 1];
        lastAssistantMode = lastMessage?.mode || 'general';
        lastAssistantActionType = null;
        renderChatbotChatList();
        // Render conversation if history exists
        if (conversationHistory.length > 0 && DOM.chatbotLog) {
            DOM.chatbotLog.innerHTML = '';
            conversationHistory.forEach(msg => {
                appendMessage(
                    msg.text,
                    msg.role === 'user' ? 'user' : 'bot',
                    msg.metadata?.relevantCarIds || [],
                    msg.metadata?.messageId || null,
                    msg.metadata?.listingData || null,
                    msg.metadata?.actionType || null
                );
            });
        }
    }
    
    // Check if DOM elements exist
    console.log('Checking DOM elements:');
    console.log('- listingsContainer:', DOM.listingsContainer);
    console.log('- searchInput:', DOM.searchInput);
    console.log('- makeFilter:', DOM.makeFilter);
    console.log('- loginForm:', DOM.loginForm);
    console.log('- signupForm:', DOM.signupForm);
    
    if (!DOM.listingsContainer || !DOM.searchInput || !DOM.makeFilter) {
        console.error('Some DOM elements not found! Retrying...');
        setTimeout(init, 100);
        return;
    }
    
    // Setup event listeners first
    console.log('Setting up event listeners...');
    setupEventListeners();
    createParticles();
    
    // Check authentication first
    const authenticated = await checkAuthentication();
    
    if (authenticated) {
        // User is authenticated, show main app
        updateAuthUI();
        showPage('listings');
        
        // Clear any old localStorage favorites (they might be from a different user or outdated)
        localStorage.removeItem('carFavorites');
        favorites = [];
        
        // Check backend health
        try {
            const health = await healthCheck();
            if (!health.success) {
                console.warn('Backend not available:', health.error);
                showError(null, '⚠️ Backend server not available. Please start the Flask server (python app.py)');
            } else {
                console.log('✅ Backend is healthy');
            }
        } catch (error) {
            console.warn('Health check failed:', error);
        }
        
        // Initialize app data (will load favorites from server)
        await initApp();
        
        console.log('✅ IntelliWheels Ready!');
    } else {
        // User not authenticated, show login page
        updateAuthUI();
        showPage('login');
        console.log('🔒 Please login to access IntelliWheels');
    }
}

// Make functions available globally
window.showCarInfoModal = showCarInfoModal;
window.showPage = showPage;

// Start initialization
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 0);
} else {
    document.addEventListener('DOMContentLoaded', init);
}
