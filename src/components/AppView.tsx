'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addFavorite,
  analyzeListingImage,
  createListing,
  deleteListing,
  fetchCars,
  fetchFavorites,
  fetchDealers,
  fetchMakes,
  fetchMyListings,
  getAnalytics,
  getPriceEstimate,
  handleChatbotMessage,
  handleListingAssistantMessage,
  removeFavorite,
  semanticSearch,
  updateListing,
  uploadListingImage,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  AnalyticsInsights,
  Car,
  CarFilters,
  ChatMessage,
  ChatSession,
  CurrencyCode,
  DealerSummary,
  PriceEstimatePayload,
  VisionAttributes,
} from '@/lib/types';
import { CHAT_HISTORY_LIMIT, STORAGE_KEYS } from '@/lib/config';
import { getCatalogEngines, getCatalogMakes, getCatalogModels } from '@/lib/catalog';

const NAV_CONFIG = [
  { key: 'listings', labelKey: 'navCatalog', descriptionKey: 'navCatalogDesc' },
  { key: 'favorites', labelKey: 'navFavorites', descriptionKey: 'navFavoritesDesc' },
  { key: 'dealers', labelKey: 'navDealers', descriptionKey: 'navDealersDesc' },
  { key: 'myListings', labelKey: 'navMyListings', descriptionKey: 'navMyListingsDesc' },
  { key: 'addListing', labelKey: 'navAddListing', descriptionKey: 'navAddListingDesc' },
  { key: 'profile', labelKey: 'navProfile', descriptionKey: 'navProfileDesc' },
  { key: 'chatbot', labelKey: 'navChatbot', descriptionKey: 'navChatbotDesc' },
  { key: 'analytics', labelKey: 'navAnalytics', descriptionKey: 'navAnalyticsDesc' },
] as const;

type PageKey = (typeof NAV_CONFIG)[number]['key'];

const SERVICE_CONFIG = [
  { key: 'marketplace', labelKey: 'serviceMarketplace', descriptionKey: 'serviceMarketplaceDesc', defaultPage: 'listings' as PageKey },
  { key: 'dealer', labelKey: 'serviceDealer', descriptionKey: 'serviceDealerDesc', defaultPage: 'myListings' as PageKey },
  { key: 'insights', labelKey: 'serviceInsights', descriptionKey: 'serviceInsightsDesc', defaultPage: 'chatbot' as PageKey },
] as const;

type ServiceMode = (typeof SERVICE_CONFIG)[number]['key'];

const SERVICE_NAV_MAP: Record<ServiceMode, PageKey[]> = {
  marketplace: ['listings', 'favorites', 'dealers', 'myListings', 'addListing', 'profile'],
  dealer: ['listings', 'dealers', 'myListings', 'addListing', 'profile', 'analytics'],
  insights: ['chatbot', 'analytics', 'listings', 'favorites', 'profile'],
};

type ThemeMode = 'light' | 'dark' | 'system';

const THEME_OPTIONS: Array<{ value: ThemeMode; labelKey: 'themeLight' | 'themeDark' | 'themeSystem' }> = [
  { value: 'light', labelKey: 'themeLight' },
  { value: 'dark', labelKey: 'themeDark' },
  { value: 'system', labelKey: 'themeSystem' },
];

const TRANSLATIONS = {
  en: {
    tagline: 'Intelligent automotive marketplace',
    statusLabel: 'Status',
    statusGuest: 'Guest',
    statusAuthenticated: 'Authenticated',
    selectorsCurrency: 'Currency',
    selectorsLanguage: 'Language',
    serviceLabel: 'Workspace',
    serviceSubtitle: 'Choose a capability focus',
    serviceCurrent: 'Currently exploring',
    serviceMarketplace: 'Marketplace',
    serviceMarketplaceDesc: 'Live inventory & customers',
    serviceDealer: 'Dealer Hub',
    serviceDealerDesc: 'Manage listings & leads',
    serviceInsights: 'AI Insights',
    serviceInsightsDesc: 'Chat, analytics, vision',
    serviceMenuCta: 'Switch workspace',
    navMenuLabel: 'Browse sections',
    themeLabel: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    settingsButton: 'Settings',
    settingsTitle: 'Workspace settings',
    settingsSubtitle: 'Personalize your experience',
    settingsProfileCta: 'Manage profile',
    settingsProfileGuest: 'Sign in / Sign up',
    navCatalog: 'Catalog',
    navCatalogDesc: 'Explore the latest inventory',
    navFavorites: 'Favorites',
    navFavoritesDesc: 'Your saved picks',
    navDealers: 'Dealers',
    navDealersDesc: 'Meet verified sellers',
    navMyListings: 'My Listings',
    navMyListingsDesc: 'Manage your cars',
    navAddListing: 'Add Listing',
    navAddListingDesc: 'Create a new listing',
    navProfile: 'Profile & Auth',
    navProfileDesc: 'Account settings',
    navChatbot: 'AI Assistant',
    navChatbotDesc: 'Chat & vision tools',
    navAnalytics: 'Analytics',
    navAnalyticsDesc: 'Market intelligence',
    searchPlaceholder: 'Search make, model, year',
    semanticPlaceholder: 'e.g. Luxury hybrid SUV under 150k',
    dropPrompt: 'Drag & drop or paste an image',
    dropHint: 'JPG, PNG up to 10MB',
    priceAssistLabel: 'AI Price Assist',
    uploadPhotoLabel: 'Upload Photo',
    visionHelperLabel: 'Vision Helper',
    galleryLabel: 'Gallery',
    galleryHint: 'Attach up to 6 showcase shots',
    galleryEmpty: 'No gallery images yet.',
    galleryUploadLabel: 'Upload images',
    galleryAddButton: 'Add',
    galleryRemove: 'Remove',
    videoLabel: 'Video link',
    makeSelectLabel: 'Choose make',
    modelSelectLabel: 'Choose model',
    engineSelectLabel: 'Choose engine',
    odometerLabel: 'Odometer (km)',
    descriptionHeading: 'Description',
    dealersHeading: 'Featured dealer network',
    dealersSubheading: 'Shop curated showrooms powered by IntelliWheels partners.',
    dealersEmpty: 'No dealer partners are live yet.',
    dealersVisit: 'View showroom',
    dealerMetaListings: 'Listings',
    dealerMetaAverage: 'Avg price',
    dealerMetaTopMakes: 'Top makes',
    dealerInventoryTitle: 'Available cars',
    dealerContactCta: 'Contact dealer',
    settingsLabel: 'Settings',
    settingsTheme: 'Theme',
    settingsLanguage: 'Language',
    settingsCurrency: 'Currency',
    footerContact: 'Contact',
    footerSupport: 'Support',
    footerSocial: 'Social',
    footerRights: 'All rights reserved.',
    footerEmail: 'Email us',
    footerPhone: 'Call support',
    footerInstagram: 'Instagram',
  },
  ar: {
    tagline: 'منصة سيارات ذكية',
    statusLabel: 'الحالة',
    statusGuest: 'زائر',
    statusAuthenticated: 'مسجل',
    selectorsCurrency: 'العملة',
    selectorsLanguage: 'اللغة',
    serviceLabel: 'بيئة العمل',
    serviceSubtitle: 'اختر نمط الخدمة الأنسب',
    serviceCurrent: 'أنت الآن في',
    serviceMarketplace: 'السوق',
    serviceMarketplaceDesc: 'المخزون المباشر والعملاء',
    serviceDealer: 'مركز الوكلاء',
    serviceDealerDesc: 'إدارة العروض والعملاء المحتملين',
    serviceInsights: 'رؤى الذكاء',
    serviceInsightsDesc: 'الدردشة والتحليلات والرؤية',
    serviceMenuCta: 'تغيير مساحة العمل',
    navMenuLabel: 'تصفح الأقسام',
    themeLabel: 'الوضع',
    themeLight: 'فاتح',
    themeDark: 'داكن',
    themeSystem: 'حسب النظام',
    settingsButton: 'الإعدادات',
    settingsTitle: 'إعدادات مساحة العمل',
    settingsSubtitle: 'خصص تجربتك',
    settingsProfileCta: 'إدارة الحساب',
    settingsProfileGuest: 'تسجيل الدخول / إنشاء حساب',
    navCatalog: 'الكتالوج',
    navCatalogDesc: 'اكتشف أحدث السيارات',
    navFavorites: 'المفضلة',
    navFavoritesDesc: 'سياراتك المختارة',
    navDealers: 'الوكلاء',
    navDealersDesc: 'تعرف على شركائنا المعتمدين',
    navMyListings: 'سياراتي',
    navMyListingsDesc: 'إدارة السيارات المعروضة',
    navAddListing: 'إضافة سيارة',
    navAddListingDesc: 'إنشاء عرض جديد',
    navProfile: 'الملف الشخصي',
    navProfileDesc: 'إدارة الحساب',
    navChatbot: 'المساعد الذكي',
    navChatbotDesc: 'دردشة ورؤية بالذكاء الاصطناعي',
    navAnalytics: 'التحليلات',
    navAnalyticsDesc: 'رؤى السوق',
    searchPlaceholder: 'ابحث عن الموديل أو السنة',
    semanticPlaceholder: 'مثال: سيارة هجينة فاخرة أقل من 150 ألف',
    dropPrompt: 'اسحب وأفلت أو الصق صورة هنا',
    dropHint: 'صور ‎JPG, PNG‎ حتى 10 ميغابايت',
    priceAssistLabel: 'مساعد التسعير بالذكاء الاصطناعي',
    uploadPhotoLabel: 'تحميل صورة',
    visionHelperLabel: 'مساعد الرؤية',
    galleryLabel: 'معرض الصور',
    galleryHint: 'أضف حتى ٦ صور مميزة',
    galleryEmpty: 'لا توجد صور بعد.',
    galleryUploadLabel: 'رفع الصور',
    galleryAddButton: 'إضافة',
    galleryRemove: 'إزالة',
    videoLabel: 'رابط الفيديو',
    makeSelectLabel: 'اختر الشركة',
    modelSelectLabel: 'اختر الموديل',
    engineSelectLabel: 'اختر المحرك',
    odometerLabel: 'قراءة العداد (كم)',
    descriptionHeading: 'الوصف',
    dealersHeading: 'شبكة الوكلاء المميزين',
    dealersSubheading: 'استكشف صالات العرض المختارة من شركاء IntelliWheels.',
    dealersEmpty: 'لا يوجد وكلاء نشطون حالياً.',
    dealersVisit: 'عرض الصالة',
    dealerMetaListings: 'العروض',
    dealerMetaAverage: 'متوسط السعر',
    dealerMetaTopMakes: 'أبرز العلامات',
    dealerInventoryTitle: 'السيارات المتاحة',
    dealerContactCta: 'تواصل مع الوكيل',
    settingsLabel: 'الإعدادات',
    settingsTheme: 'المظهر',
    settingsLanguage: 'اللغة',
    settingsCurrency: 'العملة',
    footerContact: 'تواصل معنا',
    footerSupport: 'الدعم',
    footerSocial: 'وسائل التواصل',
    footerRights: 'جميع الحقوق محفوظة.',
    footerEmail: 'راسلنا',
    footerPhone: 'اتصل بالدعم',
    footerInstagram: 'إنستغرام',
  },
} as const;

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
] as const;

const CURRENCY_OPTIONS: CurrencyCode[] = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'BHD', 'KWD', 'OMR', 'JOD'];

const CURRENCY_RATES: Record<CurrencyCode, number> = {
  JOD: 1,
  AED: 0.19,
  USD: 0.71,
  EUR: 0.65,
  GBP: 0.56,
  SAR: 0.19,
  QAR: 0.19,
  BHD: 0.53,
  KWD: 0.43,
  OMR: 2.15,
};

const DEFAULT_FILTERS: CarFilters = {
  make: 'all',
  search: '',
  sort: 'default',
};

const LISTINGS_PER_PAGE = 9;

interface ToastState {
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ListingFormState {
  make: string;
  model: string;
  year: string;
  price: string;
  currency: string;
  bodyStyle: string;
  horsepower: string;
  engine: string;
  fuelEconomy: string;
  odometer: string;
  image: string;
  galleryImages: string[];
  videoUrl: string;
  description: string;
}

interface VisionSuggestion extends VisionAttributes {
  raw?: string;
}

export function AppView() {
  const { user, token, loading: authLoading, login, signup, logout, updateMyProfile, refreshProfile, error: authError, clearError } = useAuth();
  const [activePage, setActivePage] = useState<PageKey>('listings');
  const [serviceMode, setServiceMode] = useState<ServiceMode>('marketplace');
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [filters, setFilters] = useState<CarFilters>(DEFAULT_FILTERS);
  const [cars, setCars] = useState<Car[]>([]);
  const [makes, setMakes] = useState<string[]>([]);
  const [dealers, setDealers] = useState<DealerSummary[]>([]);
  const [dealersLoading, setDealersLoading] = useState(false);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [myListings, setMyListings] = useState<Car[]>([]);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsInsights | null>(null);
  const [analyticsFilter, setAnalyticsFilter] = useState<'all' | 'my' | 'favorites'>('all');
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticResults, setSemanticResults] = useState<Car[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSubmittingListing, setIsSubmittingListing] = useState(false);
  const [listingForm, setListingForm] = useState<ListingFormState>({
    make: '',
    model: '',
    year: '',
    price: '',
    currency: 'AED',
    bodyStyle: '',
    horsepower: '',
    engine: '',
    fuelEconomy: '',
    odometer: '',
    image: '',
    galleryImages: [],
    videoUrl: '',
    description: '',
  });
  const [currency, setCurrency] = useState<CurrencyCode>('JOD');
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [priceEstimate, setPriceEstimate] = useState<{ value: number; currency: string; range?: { low: number; high: number } } | null>(null);
  const [visionSuggestion, setVisionSuggestion] = useState<VisionSuggestion | null>(null);
  const [visionLoading, setVisionLoading] = useState(false);
  const [assistantMode, setAssistantMode] = useState<'general' | 'listing'>('general');
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatAttachment, setChatAttachment] = useState<{ preview: string; base64: string; mime: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingGalleryUrl, setPendingGalleryUrl] = useState('');
  const serviceMenuRef = useRef<HTMLDivElement | null>(null);
  const navMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const resolvedTheme = theme === 'system' ? 'light' : theme;
  const currentService = SERVICE_CONFIG.find((service) => service.key === serviceMode) ?? SERVICE_CONFIG[0];
  const router = useRouter();

  const copy = TRANSLATIONS[language];
  const apiHost = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
    return base.replace(/\/api$/, '');
  }, []);
  const makeOptions = useMemo(() => getCatalogMakes(), []);
  const modelOptions = useMemo(() => (listingForm.make ? getCatalogModels(listingForm.make) : []), [listingForm.make]);
  const engineOptions = useMemo(
    () => (listingForm.make && listingForm.model ? getCatalogEngines(listingForm.make, listingForm.model) : []),
    [listingForm.make, listingForm.model]
  );
  const availableMakeOptions = useMemo(() => {
    if (!listingForm.make || makeOptions.includes(listingForm.make)) {
      return makeOptions;
    }
    return [...makeOptions, listingForm.make];
  }, [listingForm.make, makeOptions]);
  const availableModelOptions = useMemo(() => {
    if (!listingForm.model || modelOptions.includes(listingForm.model)) {
      return modelOptions;
    }
    return [...modelOptions, listingForm.model];
  }, [listingForm.model, modelOptions]);
  const availableEngineOptions = useMemo(() => {
    if (!listingForm.engine || engineOptions.includes(listingForm.engine)) {
      return engineOptions;
    }
    return [...engineOptions, listingForm.engine];
  }, [engineOptions, listingForm.engine]);
  const direction = language === 'ar' ? 'rtl' : 'ltr';
  const backgroundClass = resolvedTheme === 'dark'
    ? 'bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100'
    : 'bg-gradient-to-br from-slate-50 via-white to-sky-50 text-slate-900';
  const headerSurfaceClass = resolvedTheme === 'dark'
    ? 'bg-[#06122A] text-slate-100'
    : 'bg-gradient-to-r from-sky-900 via-slate-900 to-slate-800 text-white';
  const mainSurfaceClass = resolvedTheme === 'dark'
    ? 'border-slate-800 bg-slate-900/80 text-slate-100'
    : 'border-slate-100 bg-white/90 text-slate-900';
  const headerMuted = resolvedTheme === 'dark' ? 'text-slate-300/80' : 'text-slate-200/80';
  const headerSubtleText = resolvedTheme === 'dark' ? 'text-slate-200/90' : 'text-slate-100/80';
  const selectorClass = resolvedTheme === 'dark'
    ? 'rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100'
    : 'rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900';
  const statusPillClass = token
    ? 'border border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
    : resolvedTheme === 'dark'
      ? 'border border-blue-500/30 bg-blue-900/40 text-blue-200'
      : 'border border-slate-200 bg-white/20 text-white';
  const subtleBorderClass = resolvedTheme === 'dark' ? 'border-blue-900/30' : 'border-sky-900/40';
  const navActiveItemClass = resolvedTheme === 'dark'
    ? 'bg-blue-900/60 text-slate-50'
    : 'bg-slate-100 text-slate-900';
  const navIdleItemClass = resolvedTheme === 'dark'
    ? 'text-slate-200 hover:bg-blue-900/40'
    : 'text-slate-700 hover:bg-slate-100';
  const navItems = useMemo(() => {
    const allowedKeys = new Set(SERVICE_NAV_MAP[serviceMode] ?? NAV_CONFIG.map((item) => item.key));
    return NAV_CONFIG.filter((item) => allowedKeys.has(item.key)).map((item) => ({
      key: item.key,
      label: copy[item.labelKey],
      description: copy[item.descriptionKey],
    }));
  }, [language, serviceMode]);
  const handleOpenCarDetails = useCallback(
    (carId: number) => {
      router.push(`/cars/${carId}`);
    },
    [router]
  );
  const handleOpenDealer = useCallback(
    (dealerId: number) => {
      router.push(`/dealers/${dealerId}`);
    },
    [router]
  );
  const inputFieldClass = 'rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none';

  const chatSession = useMemo(() => chatSessions.find((session) => session.id === activeSessionId) ?? null, [chatSessions, activeSessionId]);
  const chatMessages = chatSession?.messages ?? [];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedService = localStorage.getItem(STORAGE_KEYS.serviceMode) as ServiceMode | null;
    if (storedService && SERVICE_NAV_MAP[storedService]) {
      setServiceMode((prev) => (prev === storedService ? prev : storedService));
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedTheme = localStorage.getItem(STORAGE_KEYS.theme) as ThemeMode | null;
    if (storedTheme) {
      setTheme((prev) => (prev === storedTheme ? prev : storedTheme));
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedSessions = localStorage.getItem(STORAGE_KEYS.chatSessions);
    if (!storedSessions) return;
    try {
      const parsed = JSON.parse(storedSessions);
      if (Array.isArray(parsed)) {
        setChatSessions(parsed);
        setActiveSessionId((prev) => prev ?? parsed[0]?.id ?? null);
      }
    } catch (err) {
      console.warn('Failed to parse chat sessions', err);
    }
  }, []);

  useEffect(() => {
    if (activeSessionId || !chatSessions.length) return;
    setActiveSessionId(chatSessions[0].id);
  }, [chatSessions, activeSessionId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.serviceMode, serviceMode);
  }, [serviceMode]);

  useEffect(() => {
    const allowedPages = SERVICE_NAV_MAP[serviceMode] ?? NAV_CONFIG.map((item) => item.key);
    // Don't force redirect if trying to access pages that might be conditionally allowed or are valid
    if (!allowedPages.includes(activePage) && activePage !== 'addListing') {
      // Check if 'add_listing' is valid for this mode generally, or just allow it if user is logged in
      // For now, let's trust the user selection unless it's completely invalid
      if (activePage !== 'profile') {
        setActivePage(allowedPages[0] ?? 'listings');
      }
    }
  }, [serviceMode, activePage]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (serviceMenuOpen && serviceMenuRef.current && !serviceMenuRef.current.contains(target)) {
        setServiceMenuOpen(false);
      }
      if (navMenuOpen && navMenuRef.current && !navMenuRef.current.contains(target)) {
        setNavMenuOpen(false);
      }
      if (settingsOpen && settingsMenuRef.current && !settingsMenuRef.current.contains(target)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [serviceMenuOpen, navMenuOpen, settingsOpen]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setServiceMenuOpen(false);
        setNavMenuOpen(false);
        setSettingsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const resolveImageUrl = useCallback(
    (src?: string | null) => {
      if (!src) return '/placeholder-car.svg';
      if (src.startsWith('http')) return src;
      if (src.startsWith('data:')) return src;
      if (!apiHost) return src;
      return `${apiHost}${src.startsWith('/') ? src : `/${src}`}`;
    },
    [apiHost]
  );

  const getCarImage = useCallback(
    (car: Car) => {
      if (car.image) {
        return resolveImageUrl(car.image);
      }
      if (car.galleryImages?.length) {
        return resolveImageUrl(car.galleryImages[0]);
      }
      const mediaPreview = car.mediaGallery?.find((entry) => entry.type === 'image' && entry.url)?.url;
      if (mediaPreview) {
        return resolveImageUrl(mediaPreview);
      }
      if (car.imageUrls?.length) {
        return resolveImageUrl(car.imageUrls[0]);
      }
      return '/placeholder-car.svg';
    },
    [resolveImageUrl]
  );

  const formatPrice = useCallback(
    (value?: number, sourceCurrency: CurrencyCode = 'AED') => {
      if (value === undefined || value === null) return 'TBD';
      const converted = convertCurrency(value, sourceCurrency, currency);
      return formatCurrency(converted ?? value, currency);
    },
    [currency]
  );

  const requireAuth = useCallback(() => {
    if (!token) {
      setToast({ type: 'info', message: 'Please sign in to access this feature.' });
      setActivePage('profile');
      return false;
    }
    return true;
  }, [token]);

  const showToast = useCallback((message: string, type: ToastState['type'] = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCars() {
      try {
        const response = await fetchCars(filters, controller.signal, token);
        if (response.success) {
          setCars(response.cars || []);
        }
      } catch (err: any) {
        console.error('Failed to load cars', err);
        // Only redirect if explicitly rejected and not already on a vital public page
        if (typeof err?.message === 'string' && err.message.toLowerCase().includes('auth') && activePage !== 'listings' && activePage !== 'dealers') {
          // Don't auto-redirect, just let the user see the restricted content message or handle it locally
        }
      }
    }
    loadCars();
    return () => controller.abort();
  }, [filters, token, requireAuth]);

  useEffect(() => {
    async function loadMakes() {
      try {
        const response = await fetchMakes(token);
        if (response.success) {
          const deduped = Array.from(new Set(['all', ...(response.makes || [])]));
          setMakes(deduped);
        }
      } catch (err: any) {
        console.warn('Failed to load makes', err);
        if (typeof err?.message === 'string' && err.message.toLowerCase().includes('auth')) {
          requireAuth();
        }
      }
    }
    loadMakes();
  }, [token, requireAuth]);

  useEffect(() => {
    if (!token) {
      setFavorites([]);
      setMyListings([]);
      return;
    }

    async function hydrateAuthorizedData() {
      try {
        const [favoritesResponse, listingsResponse] = await Promise.all([
          fetchFavorites(token),
          fetchMyListings(token),
        ]);
        if (favoritesResponse.success) {
          setFavorites((favoritesResponse.cars || []).map((car) => car.id));
        }
        if (listingsResponse.success) {
          setMyListings(listingsResponse.cars || []);
        }
      } catch (err) {
        console.warn('Failed to load protected data', err);
      }
    }
    hydrateAuthorizedData();
  }, [token]);

  useEffect(() => {
    if (!token) {
      setAnalyticsData(null);
      return;
    }
    async function loadAnalytics() {
      try {
        const response = await getAnalytics(analyticsFilter, token);
        if (response.success) {
          setAnalyticsData(response.insights);
        }
      } catch (err) {
        console.warn('Failed to load analytics', err);
      }
    }
    loadAnalytics();
  }, [token, analyticsFilter]);

  useEffect(() => {
    if (!token) {
      setDealers([]);
      setDealersLoading(false);
      return;
    }
    let cancelled = false;
    async function loadDealerDirectory() {
      setDealersLoading(true);
      try {
        const response = await fetchDealers(token);
        if (!cancelled && response.success) {
          setDealers(response.dealers || []);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to load dealers', err);
        }
      } finally {
        if (!cancelled) {
          setDealersLoading(false);
        }
      }
    }
    loadDealerDirectory();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.chatSessions, JSON.stringify(chatSessions));
  }, [chatSessions]);

  const persistChatSession = useCallback((sessionId: string, messages: ChatMessage[]) => {
    setChatSessions((prev) =>
      prev
        .map((session) =>
          session.id === sessionId
            ? {
              ...session,
              messages: messages.slice(-CHAT_HISTORY_LIMIT),
              updatedAt: new Date().toISOString(),
              title:
                session.title === 'New Chat' && messages.length
                  ? messages.find((msg) => msg.role === 'user')?.text.slice(0, 60) || 'Chat'
                  : session.title,
            }
            : session
        )
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    );
  }, []);

  const startNewChat = useCallback(() => {
    const newSession: ChatSession = {
      id: `session-${Date.now()}`,
      title: 'New Chat',
      messages: [],
      updatedAt: new Date().toISOString(),
    };
    setChatSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    return newSession.id;
  }, []);

  const ensureSession = useCallback(() => {
    if (activeSessionId) return activeSessionId;
    return startNewChat();
  }, [activeSessionId, startNewChat]);

  const toggleFavorite = useCallback(
    async (car: Car) => {
      if (!requireAuth()) return;
      const isFavorited = favorites.includes(car.id);
      setFavorites((prev) =>
        isFavorited ? prev.filter((id) => id !== car.id) : [...prev, car.id]
      );
      try {
        if (isFavorited) {
          await removeFavorite(car.id, token);
          showToast('Removed from favorites', 'info');
        } else {
          await addFavorite(car.id, token);
          showToast('Added to favorites');
        }
      } catch (err) {
        showToast('Unable to update favorites', 'error');
        setFavorites((prev) =>
          isFavorited ? [...prev, car.id] : prev.filter((id) => id !== car.id)
        );
      }
    },
    [favorites, requireAuth, token, showToast]
  );

  const handleListingInput = (field: keyof ListingFormState, value: string) => {
    setListingForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleMakeSelect = (value: string) => {
    setListingForm((prev) => ({
      ...prev,
      make: value,
      model: '',
      engine: '',
    }));
  };

  const handleModelSelect = (value: string) => {
    setListingForm((prev) => ({
      ...prev,
      model: value,
      engine: '',
    }));
  };

  const hydrateFromVision = (attributes: VisionSuggestion) => {
    setListingForm((prev) => ({
      ...prev,
      make: attributes.make || prev.make,
      model: attributes.model || prev.model,
      year: attributes.year ? String(attributes.year) : prev.year,
      bodyStyle: attributes.bodyStyle || prev.bodyStyle,
      price: attributes.estimatedPrice ? String(attributes.estimatedPrice) : prev.price,
      description: attributes.conditionDescription || prev.description,
    }));
  };

  const handleVisionAnalyze = async (file: File) => {
    if (!requireAuth()) return;
    setVisionLoading(true);
    try {
      const base64 = await fileToDataUrl(file);
      const response = await analyzeListingImage({ image_base64: base64, mime_type: file.type }, token);
      if (response.success) {
        setVisionSuggestion({ ...response.attributes, raw: response.raw });
        hydrateFromVision(response.attributes);
        showToast('Vision helper filled the form');
      } else {
        const errorMessage = (response as { error?: string }).error;
        showToast(errorMessage || 'Vision helper failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Vision helper failed', 'error');
    } finally {
      setVisionLoading(false);
    }
  };

  const uploadImageAsset = useCallback(
    async (file: File) => {
      const response = await uploadListingImage(file, token);
      if (response.success && response.url) {
        return response.url;
      }
      const errorMessage = (response as { error?: string }).error;
      throw new Error(errorMessage || 'Upload failed');
    },
    [token]
  );

  const handleUploadImage = async (file: File) => {
    if (!requireAuth()) return;
    try {
      const url = await uploadImageAsset(file);
      handleListingInput('image', url);
      showToast('Image uploaded');
    } catch (err: any) {
      showToast(err.message || 'Upload failed', 'error');
    }
  };

  const handleGalleryUpload = async (fileList: FileList | null) => {
    if (!requireAuth() || !fileList || fileList.length === 0) return;
    try {
      const uploads = Array.from(fileList).slice(0, 6);
      const uploadedUrls: string[] = [];
      for (const file of uploads) {
        // eslint-disable-next-line no-await-in-loop
        const url = await uploadImageAsset(file);
        uploadedUrls.push(url);
      }
      if (!uploadedUrls.length) return;
      setListingForm((prev) => {
        const combined = [...prev.galleryImages, ...uploadedUrls];
        const primaryImage = prev.image || combined[0] || '';
        return { ...prev, galleryImages: combined, image: primaryImage };
      });
      showToast('Gallery updated');
    } catch (err: any) {
      showToast(err.message || 'Gallery upload failed', 'error');
    }
  };

  const handleAddGalleryUrl = () => {
    const trimmed = pendingGalleryUrl.trim();
    if (!trimmed) return;
    setListingForm((prev) => {
      if (prev.galleryImages.includes(trimmed)) {
        return prev;
      }
      const gallery = [...prev.galleryImages, trimmed];
      return {
        ...prev,
        galleryImages: gallery,
        image: prev.image || gallery[0] || '',
      };
    });
    setPendingGalleryUrl('');
  };

  const handleRemoveGalleryImage = (index: number) => {
    setListingForm((prev) => {
      const target = prev.galleryImages[index];
      const nextGallery = prev.galleryImages.filter((_, idx) => idx !== index);
      let nextImage = prev.image;
      if (nextImage === target) {
        nextImage = nextGallery[0] || '';
      }
      return { ...prev, galleryImages: nextGallery, image: nextImage };
    });
  };

  const handlePriceAssist = async () => {
    if (!requireAuth()) return;
    if (!listingForm.make || !listingForm.model || !listingForm.year) {
      showToast('Add make, model, and year first', 'info');
      return;
    }
    const payload: PriceEstimatePayload = {
      make: listingForm.make,
      model: listingForm.model,
      year: Number(listingForm.year),
      bodyStyle: listingForm.bodyStyle || undefined,
      horsepower: listingForm.horsepower ? Number(listingForm.horsepower) : undefined,
      currency: listingForm.currency as any,
    };
    try {
      const response = await getPriceEstimate(payload, token);
      if (response.success) {
        setPriceEstimate({
          value: Math.round(response.estimate),
          currency: response.currency,
          range: response.range,
        });
        handleListingInput('price', String(Math.round(response.estimate)));
      } else {
        const errorMessage = (response as { error?: string }).error;
        showToast(errorMessage || 'Unable to generate estimate', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Unable to generate estimate', 'error');
    }
  };

  const handleListingSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requireAuth()) return;
    setIsSubmittingListing(true);
    try {
      const cleanedGallery = listingForm.galleryImages.filter((url) => Boolean(url?.trim()));
      const normalizedGallery = cleanedGallery.length ? cleanedGallery : listingForm.image ? [listingForm.image] : [];
      const normalizedVideo = listingForm.videoUrl.trim();
      const mediaGalleryPayload = [
        ...normalizedGallery.map((url) => ({ type: 'image' as const, url })),
        ...(normalizedVideo ? [{ type: 'video' as const, url: normalizedVideo }] : []),
      ];
      const payload: Partial<Car> = {
        make: listingForm.make,
        model: listingForm.model,
        year: listingForm.year ? Number(listingForm.year) : undefined,
        price: listingForm.price ? Number(listingForm.price) : undefined,
        currency: listingForm.currency,
        odometerKm: listingForm.odometer ? Number(listingForm.odometer) : undefined,
        image: listingForm.image || normalizedGallery[0],
        galleryImages: normalizedGallery,
        mediaGallery: mediaGalleryPayload,
        videoUrl: normalizedVideo || undefined,
        description: listingForm.description,
        specs: {
          bodyStyle: listingForm.bodyStyle,
          horsepower: listingForm.horsepower ? Number(listingForm.horsepower) : undefined,
          engine: listingForm.engine,
          fuelEconomy: listingForm.fuelEconomy,
        },
      };
      const response = await createListing(payload, token);
      if (response.success) {
        showToast('Listing created successfully');
        setListingForm({
          make: '',
          model: '',
          year: '',
          price: '',
          currency: listingForm.currency,
          bodyStyle: '',
          horsepower: '',
          engine: '',
          fuelEconomy: '',
          odometer: '',
          image: '',
          galleryImages: [],
          videoUrl: '',
          description: '',
        });
        setPendingGalleryUrl('');
        setPriceEstimate(null);
        setVisionSuggestion(null);
        const refresh = await fetchMyListings(token);
        if (refresh.success) setMyListings(refresh.cars || []);
      } else {
        showToast(response.error || 'Could not create listing', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Could not create listing', 'error');
    } finally {
      setIsSubmittingListing(false);
    }
  };

  const handleDeleteListing = async (carId: number) => {
    if (!requireAuth()) return;
    try {
      await deleteListing(carId, token);
      setMyListings((prev) => prev.filter((car) => car.id !== carId));
      showToast('Listing removed', 'info');
    } catch (err: any) {
      showToast(err.message || 'Unable to delete listing', 'error');
    }
  };

  const handleSemanticSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requireAuth()) return;
    if (!semanticQuery.trim()) {
      setSemanticResults([]);
      return;
    }
    setSemanticLoading(true);
    try {
      const response = await semanticSearch(semanticQuery.trim(), 6, token);
      if (response.success) {
        setSemanticResults(response.results?.map((entry) => entry.car) || []);
      }
    } catch (err) {
      showToast('Semantic search failed', 'error');
    } finally {
      setSemanticLoading(false);
    }
  };

  const handleChatSubmit = async () => {
    if (!requireAuth()) return;
    const message = chatInput.trim();
    if (!message && !chatAttachment) return;
    let sessionId = ensureSession();
    if (!sessionId) {
      sessionId = startNewChat();
    }
    const timestamp = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: `user-${timestamp}`,
      role: 'user',
      text: message || '[Attachment] Please analyze the uploaded image.',
      timestamp,
      attachmentUrl: chatAttachment?.preview,
    };
    const updatedMessages = [...chatMessages, userMessage].slice(-CHAT_HISTORY_LIMIT);
    persistChatSession(sessionId, updatedMessages);
    setChatInput('');
    setChatAttachment(null);
    setChatBusy(true);

    try {
      const historyPayload: Array<{ role: 'user' | 'bot'; text: string }> = updatedMessages
        .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
        .map((msg) => ({ role: msg.role === 'user' ? 'user' : 'bot', text: msg.text }));

      const response =
        assistantMode === 'listing'
          ? await handleListingAssistantMessage({ query: message, history: historyPayload }, token)
          : await handleChatbotMessage(
            {
              query: message,
              history: historyPayload,
              imageBase64: chatAttachment?.base64,
              imageMimeType: chatAttachment?.mime,
            },
            token
          );

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: response.response,
        timestamp: new Date().toISOString(),
        relevantCarIds: (response as any).relevant_car_ids || [],
        listingData: (response as any).listing_data || null,
        actionType: (response as any).action_type || null,
      };

      persistChatSession(sessionId, [...updatedMessages, assistantMessage]);
    } catch (err: any) {
      showToast(err.message || 'Assistant failed to respond', 'error');
    } finally {
      setChatBusy(false);
    }
  };

  const renderToast = () => {
    if (!toast) return null;
    const base = toast.type === 'error' ? 'bg-red-500/90' : toast.type === 'info' ? 'bg-blue-500/90' : 'bg-emerald-500/90';
    return (
      <div className={`fixed top-6 right-6 z-50 rounded-xl px-4 py-3 text-white shadow-xl ${base}`}>
        {toast.message}
      </div>
    );
  };

  const filteredCars = useMemo(() => {
    return cars.filter((car) => {
      if (filters.make !== 'all' && car.make !== filters.make) return false;
      if (filters.search) {
        const haystack = `${car.make} ${car.model} ${car.year}`.toLowerCase();
        if (!haystack.includes(filters.search.toLowerCase())) return false;
      }
      return true;
    });
  }, [cars, filters]);

  const sortedCars = useMemo(() => {
    const clone = [...filteredCars];
    switch (filters.sort) {
      case 'price-asc':
        return clone.sort((a, b) => (a.price || 0) - (b.price || 0));
      case 'price-desc':
        return clone.sort((a, b) => (b.price || 0) - (a.price || 0));
      case 'rating-desc':
        return clone.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      case 'year-desc':
        return clone.sort((a, b) => (b.year || 0) - (a.year || 0));
      default:
        return clone;
    }
  }, [filteredCars, filters.sort]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(sortedCars.length / LISTINGS_PER_PAGE)), [sortedCars.length]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters.make, filters.search, filters.sort]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedCars = useMemo(() => {
    const start = (currentPage - 1) * LISTINGS_PER_PAGE;
    return sortedCars.slice(start, start + LISTINGS_PER_PAGE);
  }, [currentPage, sortedCars]);

  const paginationWindow = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + 4);
    start = Math.max(1, end - 4);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [currentPage, totalPages]);

  const goToPage = useCallback(
    (page: number) => {
      const safePage = Math.min(Math.max(page, 1), totalPages);
      setCurrentPage(safePage);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [totalPages]
  );

  const renderCarCard = (car: Car) => (
    <div
      key={car.id}
      className="flex flex-col rounded-3xl border border-slate-100 bg-white/90 p-4 shadow-lg transition hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="relative overflow-hidden rounded-2xl bg-slate-100">
        <img
          src={getCarImage(car)}
          alt={`${car.make} ${car.model}`}
          loading="lazy"
          onError={(event) => {
            const img = event.currentTarget;
            if (img.src.includes('placeholder-car.svg')) return;
            img.src = '/placeholder-car.svg';
          }}
          className="h-48 w-full object-cover"
        />
        <button
          onClick={() => toggleFavorite(car)}
          className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${favorites.includes(car.id) ? 'bg-rose-500 text-white' : 'bg-white/90 text-slate-900'
            }`}
        >
          {favorites.includes(car.id) ? 'Favorited' : 'Favorite'}
        </button>
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{car.make} {car.model}</h3>
          <p className="text-sm text-slate-500">{car.year || 'Year TBD'}</p>
        </div>
        <div className="text-right text-2xl font-bold text-emerald-600">
          {formatPrice(car.price, car.currency)}
        </div>
      </div>
      {car.specs?.bodyStyle && (
        <p className="text-sm text-slate-600">{car.specs.bodyStyle}</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
        {car.rating ? <span>⭐ {car.rating.toFixed(1)}</span> : null}
        {car.reviews ? <span>{car.reviews} reviews</span> : null}
        {car.galleryImages?.length ? <span>{car.galleryImages.length} photos</span> : null}
        {car.videoUrl ? <span>🎥 Video</span> : null}
        {car.odometerKm ? <span>{car.odometerKm.toLocaleString()} km</span> : null}
      </div>
      {car.description && (
        <p className="mt-3 line-clamp-3 text-sm text-slate-600">{car.description}</p>
      )}
      <button
        className="mt-4 w-full rounded-xl bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        onClick={() => handleOpenCarDetails(car.id)}
      >
        View Details
      </button>
    </div>
  );

  const renderDealerCard = (dealer: DealerSummary) => (
    <div key={dealer.id} className="flex flex-col rounded-3xl border border-slate-100 bg-white/90 p-4 shadow hover:shadow-lg">
      <div className="h-40 overflow-hidden rounded-2xl bg-slate-100">
        <img
          src={dealer.hero_image || '/placeholder-car.svg'}
          alt={dealer.name}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{dealer.name}</h3>
          <p className="text-sm text-slate-500">{dealer.total_listings} {copy.dealerMetaListings}</p>
        </div>
        <div className="text-right text-sm text-slate-500">
          <p>{copy.dealerMetaAverage}</p>
          <p className="text-base font-semibold text-emerald-600">
            {dealer.average_price ? formatPrice(dealer.average_price, 'AED') : '—'}
          </p>
        </div>
      </div>
      {dealer.top_makes?.length ? (
        <div className="mt-3 text-xs text-slate-500">
          <p className="font-semibold text-slate-700">{copy.dealerMetaTopMakes}</p>
          <p>{dealer.top_makes.map((entry) => entry.make).slice(0, 3).join(', ')}</p>
        </div>
      ) : null}
      <button
        className="mt-4 w-full rounded-xl bg-slate-900/90 py-2 text-sm font-semibold text-white"
        onClick={() => handleOpenDealer(dealer.id)}
      >
        {copy.dealersVisit}
      </button>
    </div>
  );


  const renderAuthPanel = () => (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">Sign In</h3>
        {authError && (
          <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600">{authError}</p>
        )}
        <form
          className="mt-4 space-y-4"
          onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const username = String(formData.get('login-username'));
            const password = String(formData.get('login-password'));
            clearError();
            const success = await login(username, password);
            if (success) {
              showToast(`Welcome back, ${username}!`);
            } else {
              showToast('Unable to sign in. Please check your details.', 'error');
            }
          }}
        >
          <input name="login-username" placeholder="Username" className={`w-full ${inputFieldClass}`} required />
          <input name="login-password" type="password" placeholder="Password" className={`w-full ${inputFieldClass}`} required />
          <button className="w-full rounded-2xl bg-sky-600 py-3 font-semibold text-white">Sign In</button>
        </form>
      </div>
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">Create Account</h3>
        <form
          className="mt-4 space-y-4"
          onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formElement = event.currentTarget;
            const formData = new FormData(formElement);
            const username = String(formData.get('signup-username'));
            const email = String(formData.get('signup-email'));
            const password = String(formData.get('signup-password'));
            clearError();
            const success = await signup(username, email, password);
            if (success) {
              showToast('Account created! You are now signed in.');
              formElement.reset();
            } else {
              showToast('Unable to sign up. Please try again.', 'error');
            }
          }}
        >
          <input name="signup-username" placeholder="Username" className={`w-full ${inputFieldClass}`} required />
          <input name="signup-email" type="email" placeholder="Email" className={`w-full ${inputFieldClass}`} required />
          <input name="signup-password" type="password" placeholder="Password" className={`w-full ${inputFieldClass}`} required />
          <button className="w-full rounded-2xl bg-emerald-500 py-3 font-semibold text-white">Sign Up</button>
        </form>
      </div>
    </div>
  );

  const renderProfilePanel = () => {
    if (!user) {
      return (
        <div className="space-y-6">
          <p className="text-slate-600">Sign in to manage your account and unlock favorites, listings, and analytics.</p>
          {renderAuthPanel()}
        </div>
      );
    }
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Profile</h3>
          <p className="text-slate-600">Username: {user.username}</p>
          <p className="text-slate-600">Email: {user.email}</p>
          <button className="mt-4 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-900" onClick={() => refreshProfile()}>
            Refresh Profile
          </button>
        </div>
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Update Profile</h3>
          <form
            className="mt-4 space-y-3"
            onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const formData = new FormData(formElement);
              const username = formData.get('profile-username')?.toString();
              const email = formData.get('profile-email')?.toString();
              const current_password = formData.get('profile-current-password')?.toString();
              const password = formData.get('profile-password')?.toString();
              const result = await updateMyProfile({ username, email, current_password, password });
              if (result) {
                showToast('Profile updated');
                formElement.reset();
              }
            }}
          >
            <input name="profile-username" placeholder="Username" defaultValue={user.username} className={`w-full ${inputFieldClass}`} />
            <input name="profile-email" type="email" placeholder="Email" defaultValue={user.email} className={`w-full ${inputFieldClass}`} />
            <input name="profile-current-password" type="password" placeholder="Current password" className={`w-full ${inputFieldClass}`} />
            <input name="profile-password" type="password" placeholder="New password" className={`w-full ${inputFieldClass}`} />
            <button className="w-full rounded-2xl bg-emerald-500 py-3 font-semibold text-white">Save Changes</button>
          </form>
          <button className="mt-4 w-full rounded-2xl border border-slate-200 py-2 font-semibold text-slate-900" onClick={() => logout()}>
            Sign Out
          </button>
        </div>
      </div>
    );
  };

  const renderChatbot = () => (
    <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
      <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
        <button className="w-full rounded-2xl bg-slate-900/5 px-3 py-2 text-sm font-semibold text-slate-900" onClick={() => startNewChat()}>
          + New Chat
        </button>
        <div className="mt-4 space-y-2">
          {chatSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={`w-full rounded-2xl px-3 py-2 text-left text-sm ${session.id === activeSessionId ? 'bg-sky-50 text-slate-900' : 'bg-slate-50 text-slate-500'
                }`}
            >
              <span className="block font-semibold">{session.title}</span>
              <span className="text-xs">{new Date(session.updatedAt).toLocaleString()}</span>
            </button>
          ))}
        </div>
        <div className="mt-6 space-y-3">
          <label className="text-xs uppercase text-slate-500">Assistant Mode</label>
          <select
            value={assistantMode}
            onChange={(event) => setAssistantMode(event.target.value as 'general' | 'listing')}
            className={`w-full ${inputFieldClass}`}
          >
            <option value="general">General Q&A</option>
            <option value="listing">Listing Assistant</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex-1 space-y-4 overflow-y-auto pr-2">
          {chatMessages.length === 0 && (
            <p className="text-center text-slate-500">Start the conversation with IntelliWheels AI Assistant.</p>
          )}
          {chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={`max-w-3xl rounded-2xl p-4 ${msg.role === 'user' ? 'ml-auto bg-sky-100 text-slate-900' : 'bg-slate-50 text-slate-600'}`}
            >
              <p className="text-xs uppercase text-slate-400">{msg.role === 'user' ? 'You' : 'Assistant'}</p>
              <p className="mt-1 whitespace-pre-line text-sm">{msg.text}</p>
              {msg.listingData && (
                <div className="mt-3 rounded-xl bg-white p-3 text-xs text-slate-500">
                  <p className="font-semibold text-slate-900">Proposed Listing</p>
                  {Object.entries(msg.listingData).map(([key, value]) =>
                    value ? <p key={key}>{camelToTitle(key)}: {String(value)}</p> : null
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {chatAttachment && (
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
              <span>Attached image</span>
              <button onClick={() => setChatAttachment(null)} className="text-xs text-rose-500">Remove</button>
            </div>
          )}
          <textarea
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder="Ask about pricing, specs, or request a listing draft..."
            className="min-h-[120px] w-full rounded-3xl border border-slate-200 bg-slate-50 p-4 text-slate-900 placeholder-slate-500"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-900">
              Attach Image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const base64 = await fileToDataUrl(file);
                  setChatAttachment({
                    preview: URL.createObjectURL(file),
                    base64,
                    mime: file.type,
                  });
                }}
              />
            </label>
            <button
              className="flex-1 rounded-2xl bg-sky-600 py-3 text-center font-semibold text-white disabled:bg-sky-300"
              onClick={handleChatSubmit}
              disabled={chatBusy}
            >
              {chatBusy ? 'Thinking...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAnalytics = () => {
    if (!requireAuth()) return null;
    if (!analyticsData) {
      return <p className="text-slate-500">No analytics available yet. Create listings or favorites to unlock insights.</p>;
    }
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          {['all', 'my', 'favorites'].map((filter) => (
            <button
              key={filter}
              onClick={() => setAnalyticsFilter(filter as 'all' | 'my' | 'favorites')}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold ${analyticsFilter === filter ? 'bg-sky-600 text-white' : 'border border-slate-200 bg-white text-slate-600'
                }`}
            >
              {camelToTitle(filter)}
            </button>
          ))}
        </div>
        {analyticsData.summary && (
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Average Price" value={formatPrice(analyticsData.summary.average_price, analyticsData.summary.currency)} />
            <StatCard label="Cheapest" value={formatPrice(analyticsData.summary.min_price, analyticsData.summary.currency)} />
            <StatCard label="Most Expensive" value={formatPrice(analyticsData.summary.max_price, analyticsData.summary.currency)} />
          </div>
        )}
        {analyticsData.market_top_makes && (
          <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Top Makes</h3>
            <div className="mt-4 space-y-3">
              {analyticsData.market_top_makes.map((entry) => (
                <div key={entry.make} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{entry.make}</span>
                  <span>{formatPrice(entry.avg_price, analyticsData.summary?.currency)}</span>
                  <span>{entry.listings} listings</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    switch (activePage) {
      case 'listings':
        return (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
              <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="grid gap-4 md:grid-cols-3">
                  <select value={filters.make} onChange={(event) => setFilters((prev) => ({ ...prev, make: event.target.value }))} className={inputFieldClass}>
                    {makes.map((make) => (
                      <option key={make} value={make}>{camelToTitle(make)}</option>
                    ))}
                  </select>
                  <input
                    value={filters.search}
                    onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                    placeholder="Search make, model, year"
                    className={inputFieldClass}
                  />
                  <select value={filters.sort} onChange={(event) => setFilters((prev) => ({ ...prev, sort: event.target.value as CarFilters['sort'] }))} className={inputFieldClass}>
                    <option value="default">Recommended</option>
                    <option value="price-asc">Price: Low → High</option>
                    <option value="price-desc">Price: High → Low</option>
                    <option value="year-desc">Newer first</option>
                    <option value="rating-desc">Top rated</option>
                  </select>
                </div>
              </div>
              <form onSubmit={handleSemanticSearch} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">AI Semantic Search</p>
                <div className="mt-3 flex gap-3">
                  <input
                    value={semanticQuery}
                    onChange={(event) => setSemanticQuery(event.target.value)}
                    placeholder="e.g. Luxury hybrid SUV under 150k"
                    className={`flex-1 ${inputFieldClass}`}
                  />
                  <button className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white">
                    {semanticLoading ? 'Searching...' : 'Search'}
                  </button>
                </div>
                {semanticResults.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {semanticResults.map((car) => (
                      <div key={car.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">
                        <img src={getCarImage(car)} alt={car.model} className="h-14 w-20 rounded-xl object-cover" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-900">{car.make} {car.model}</span>
                            <button className="text-xs text-sky-600" onClick={() => handleOpenCarDetails(car.id)}>Inspect</button>
                          </div>
                          <p>{formatPrice(car.price, car.currency)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </form>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {paginatedCars.length === 0 ? (
                <p className="col-span-full text-center text-slate-500">No listings match your filters yet.</p>
              ) : (
                paginatedCars.map((car) => renderCarCard(car))
              )}
            </div>
            {sortedCars.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                <p>
                  Showing {Math.min((currentPage - 1) * LISTINGS_PER_PAGE + 1, sortedCars.length)}-
                  {Math.min(currentPage * LISTINGS_PER_PAGE, sortedCars.length)} of {sortedCars.length} listings
                </p>
                {totalPages > 1 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="rounded-2xl border border-slate-200 px-3 py-1 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"
                    >
                      Prev
                    </button>
                    {paginationWindow[0] > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => goToPage(1)}
                          className="rounded-2xl border border-slate-200 px-3 py-1 font-semibold text-slate-700"
                        >
                          1
                        </button>
                        {paginationWindow[0] > 2 && <span className="text-slate-400">…</span>}
                      </>
                    )}
                    {paginationWindow.map((page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => goToPage(page)}
                        className={`rounded-2xl px-3 py-1 font-semibold ${currentPage === page ? 'bg-sky-600 text-white' : 'border border-slate-200 text-slate-700'
                          }`}
                      >
                        {page}
                      </button>
                    ))}
                    {paginationWindow[paginationWindow.length - 1] < totalPages && (
                      <>
                        {paginationWindow[paginationWindow.length - 1] < totalPages - 1 && (
                          <span className="text-slate-400">…</span>
                        )}
                        <button
                          type="button"
                          onClick={() => goToPage(totalPages)}
                          className="rounded-2xl border border-slate-200 px-3 py-1 font-semibold text-slate-700"
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="rounded-2xl border border-slate-200 px-3 py-1 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      case 'favorites':
        return (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cars.filter((car) => favorites.includes(car.id)).map((car) => renderCarCard(car))}
            {favorites.length === 0 && <p className="text-slate-500">No favorites yet.</p>}
          </div>
        );
      case 'dealers':
        if (!requireAuth()) return null;
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{copy.dealersHeading}</h2>
              <p className="text-sm text-slate-600">{copy.dealersSubheading}</p>
            </div>
            {dealersLoading ? (
              <p className="text-slate-500">Loading dealers...</p>
            ) : dealers.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {dealers.map((dealer) => renderDealerCard(dealer))}
              </div>
            ) : (
              <p className="text-slate-500">{copy.dealersEmpty}</p>
            )}
          </div>
        );
      case 'myListings':
        if (!requireAuth()) return null;
        return (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {myListings.map((car) => (
              <div key={car.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex gap-3">
                  <img src={getCarImage(car)} alt={car.model} className="h-24 w-32 rounded-2xl object-cover" />
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-900">{car.make} {car.model}</h3>
                    <p className="text-sm text-slate-500">{car.year}</p>
                    <p className="text-xl font-bold text-emerald-600">{formatPrice(car.price, car.currency)}</p>
                    {car.odometerKm ? (
                      <p className="text-xs text-slate-500">{car.odometerKm.toLocaleString()} km</p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <button className="flex-1 rounded-2xl bg-slate-900/5 py-2 text-sm font-semibold text-slate-900" onClick={() => handleOpenCarDetails(car.id)}>
                    View
                  </button>
                  <button className="flex-1 rounded-2xl bg-rose-500 py-2 text-sm font-semibold text-white" onClick={() => handleDeleteListing(car.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {myListings.length === 0 && <p className="text-slate-500">No personal listings yet.</p>}
          </div>
        );
      case 'addListing':
        if (!requireAuth()) return null;
        return (
          <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
            <form className="space-y-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm" onSubmit={handleListingSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <select
                  value={listingForm.make}
                  onChange={(event) => handleMakeSelect(event.target.value)}
                  className={inputFieldClass}
                  required
                >
                  <option value="">{copy.makeSelectLabel}</option>
                  {availableMakeOptions.map((makeOption) => (
                    <option key={makeOption} value={makeOption}>{makeOption}</option>
                  ))}
                </select>
                <select
                  value={listingForm.model}
                  onChange={(event) => handleModelSelect(event.target.value)}
                  className={inputFieldClass}
                  required
                  disabled={!listingForm.make}
                >
                  <option value="">{copy.modelSelectLabel}</option>
                  {availableModelOptions.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
                <input value={listingForm.year} onChange={(event) => handleListingInput('year', event.target.value)} placeholder="Year" className={inputFieldClass} required />
                <input value={listingForm.price} onChange={(event) => handleListingInput('price', event.target.value)} placeholder="Price" className={inputFieldClass} required />
                <select value={listingForm.currency} onChange={(event) => handleListingInput('currency', event.target.value)} className={inputFieldClass}>
                  {CURRENCY_OPTIONS.map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
                <input value={listingForm.bodyStyle} onChange={(event) => handleListingInput('bodyStyle', event.target.value)} placeholder="Body style" className={inputFieldClass} />
                <input value={listingForm.horsepower} onChange={(event) => handleListingInput('horsepower', event.target.value)} placeholder="Horsepower" className={inputFieldClass} />
                {availableEngineOptions.length > 0 ? (
                  <select
                    value={listingForm.engine}
                    onChange={(event) => handleListingInput('engine', event.target.value)}
                    className={inputFieldClass}
                    disabled={!listingForm.model}
                  >
                    <option value="">{copy.engineSelectLabel}</option>
                    {availableEngineOptions.map((engine) => (
                      <option key={engine} value={engine}>{engine}</option>
                    ))}
                  </select>
                ) : (
                  <input value={listingForm.engine} onChange={(event) => handleListingInput('engine', event.target.value)} placeholder={copy.engineSelectLabel} className={inputFieldClass} />
                )}
                <input value={listingForm.fuelEconomy} onChange={(event) => handleListingInput('fuelEconomy', event.target.value)} placeholder="Fuel economy" className={inputFieldClass} />
                <input
                  value={listingForm.odometer}
                  onChange={(event) => handleListingInput('odometer', event.target.value)}
                  placeholder={copy.odometerLabel}
                  className={inputFieldClass}
                  type="number"
                  min="0"
                />
                <input value={listingForm.image} onChange={(event) => handleListingInput('image', event.target.value)} placeholder="Image URL" className={inputFieldClass} />
              </div>
              <textarea value={listingForm.description} onChange={(event) => handleListingInput('description', event.target.value)} placeholder="Description" className={`h-32 w-full ${inputFieldClass}`}
              />
              <div className="flex flex-wrap gap-3">
                <button type="button" className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white" onClick={handlePriceAssist}>
                  {copy.priceAssistLabel}
                </button>
                <label className="cursor-pointer rounded-2xl border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-900">
                  {copy.uploadPhotoLabel}
                  <input type="file" accept="image/*" className="hidden" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleUploadImage(file);
                  }} />
                </label>
                <label className="cursor-pointer rounded-2xl border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-900">
                  {copy.visionHelperLabel}
                  <input type="file" accept="image/*" className="hidden" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleVisionAnalyze(file);
                  }} />
                </label>
              </div>
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{copy.galleryLabel}</p>
                    <p className="text-xs text-slate-500">{copy.galleryHint}</p>
                  </div>
                  <label className="cursor-pointer rounded-2xl border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900">
                    {copy.galleryUploadLabel}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => handleGalleryUpload(event.target.files)}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={pendingGalleryUrl}
                    onChange={(event) => setPendingGalleryUrl(event.target.value)}
                    placeholder="Paste image URL"
                    className={`flex-1 ${inputFieldClass}`}
                  />
                  <button type="button" className="rounded-2xl bg-slate-900/10 px-4 py-2 text-sm font-semibold text-slate-900" onClick={handleAddGalleryUrl}>
                    {copy.galleryAddButton}
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {listingForm.galleryImages.length === 0 && (
                    <p className="text-sm text-slate-500 sm:col-span-3">{copy.galleryEmpty}</p>
                  )}
                  {listingForm.galleryImages.map((url, index) => (
                    <div key={`${url}-${index}`} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <img src={url} alt={`Gallery ${index + 1}`} className="h-32 w-full object-cover" />
                      <button type="button" className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-rose-500" onClick={() => handleRemoveGalleryImage(index)}>
                        {copy.galleryRemove}
                      </button>
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500">{copy.videoLabel}</label>
                  <input
                    value={listingForm.videoUrl}
                    onChange={(event) => handleListingInput('videoUrl', event.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className={`mt-1 w-full ${inputFieldClass}`}
                  />
                </div>
              </div>
              {priceEstimate && (
                <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
                  Suggested price {formatPrice(priceEstimate.value, priceEstimate.currency)}
                  {priceEstimate.range && (
                    <p className="text-emerald-700">
                      Range {formatPrice(priceEstimate.range.low, priceEstimate.currency)} → {formatPrice(priceEstimate.range.high, priceEstimate.currency)}
                    </p>
                  )}
                </div>
              )}
              {visionSuggestion && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">Vision insights</p>
                  {visionSuggestion.highlights?.map((highlight, index) => (
                    <p key={index}>• {highlight}</p>
                  ))}
                </div>
              )}
              <button className="w-full rounded-2xl bg-emerald-600 py-3 text-lg font-semibold text-white" disabled={isSubmittingListing}>
                {isSubmittingListing ? 'Publishing...' : 'Publish Listing'}
              </button>
            </form>
            <div className="space-y-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900">Vision Helper Tips</h3>
              <p className="text-sm text-slate-600">Upload clear daylight shots. The AI will detect make, model, color, and condition to pre-fill your listing.</p>
              {visionLoading && <p className="text-slate-500">Analyzing image...</p>}
            </div>
          </div>
        );
      case 'profile':
        return renderProfilePanel();
      case 'chatbot':
        return renderChatbot();

      case 'analytics':
        return renderAnalytics();
      default:
        return null;
    }
  };

  const currentServiceLabel = copy[currentService.labelKey];
  const currentServiceDescription = copy[currentService.descriptionKey];
  const currentYear = new Date().getFullYear();

  return (
    <div className={`${backgroundClass} min-h-screen`} dir={direction}>
      {renderToast()}
      <header className={`sticky top-0 z-50 border-b backdrop-blur-md transition-colors duration-300 ${headerSurfaceClass} ${subtleBorderClass}`}>
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            {/* Logo */}
            <div
              className="group flex cursor-pointer items-center gap-3"
              onClick={() => setActivePage('listings')}
            >
              <img
                src="/intellliwheels_logo_concept_dynamic.png"
                alt="IntelliWheels"
                className="h-12 w-auto object-contain transition-transform group-hover:scale-105"
              />
              <div className="hidden flex-col md:flex">
                <span className={`text-xl font-bold tracking-tight ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>IntelliWheels</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${headerMuted}`}>Automotive Intelligence</span>
              </div>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden items-center gap-1 md:flex">
              {[
                { key: 'listings', label: copy.navCatalog },
                { key: 'dealers', label: copy.navDealers },
                { key: 'addListing', label: copy.navAddListing },
                { key: 'chatbot', label: copy.navChatbot },
                { key: 'analytics', label: copy.navAnalytics },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActivePage(item.key as PageKey)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${activePage === item.key
                    ? 'bg-slate-100/10 text-indigo-500 shadow-sm ring-1 ring-inset ring-slate-200/10 dark:text-indigo-400'
                    : `text-slate-500 hover:bg-slate-100/5 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200`
                    }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            <div className={`hidden h-8 w-px md:block ${resolvedTheme === 'dark' ? 'bg-slate-800' : 'bg-slate-200'}`} />

            <div className="flex items-center gap-2">
              {/* Search Trigger (Visual Only for now) */}
              <button className={`hidden rounded-full p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800 sm:block`}>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </button>

              {/* Settings Toggle */}
              <div className="relative" ref={settingsMenuRef}>
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className={`flex items-center gap-2 rounded-full border p-1 pr-4 transition-all hover:shadow-md ${statusPillClass}`}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-white dark:text-slate-900">
                    {user?.username?.[0]?.toUpperCase() || 'G'}
                  </div>
                  <span className="text-xs font-bold">{user ? user.username : copy.statusGuest}</span>
                  <span className="text-xs opacity-50">▼</span>
                </button>

                {settingsOpen && (
                  <div className={`absolute right-0 top-full mt-4 w-72 origin-top-right overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-800 dark:bg-slate-900`}>
                    <div className="bg-slate-50 px-6 py-4 dark:bg-slate-800/50">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{copy.settingsTitle}</p>
                      <p className="text-sm text-slate-400">{copy.settingsSubtitle}</p>
                    </div>
                    <div className="p-2">
                      <button
                        onClick={() => { setActivePage('profile'); setSettingsOpen(false); }}
                        className="flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-xl dark:bg-indigo-900/30">👤</span>
                        <div>
                          <p className={`font-semibold text-sm ${resolvedTheme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>{user ? copy.settingsProfileCta : copy.settingsProfileGuest}</p>
                          <p className="text-xs text-slate-500">{user?.email || 'Manage account'}</p>
                        </div>
                      </button>
                      <div className="my-2 h-px bg-slate-100 dark:bg-slate-800" />
                      <div className="my-2 h-px bg-slate-100 dark:bg-slate-800" />
                      <div className="space-y-4 px-3 py-2">
                        {/* Language Selector */}
                        <div>
                          <label className="mb-1 block text-xs font-bold text-slate-500">{copy.settingsLanguage}</label>
                          <div className="grid grid-cols-2 gap-2">
                            {LANGUAGE_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => setLanguage(opt.value)}
                                className={`rounded-lg py-1.5 text-xs font-semibold transition ${language === opt.value
                                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                                  }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Currency Selector */}
                        <div>
                          <label className="mb-1 block text-xs font-bold text-slate-500">{copy.settingsCurrency}</label>
                          <select
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                            className="w-full appearance-none rounded-xl border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            {CURRENCY_OPTIONS.map((code) => (
                              <option key={code} value={code}>{code}</option>
                            ))}
                          </select>
                        </div>

                        {/* Theme Selector */}
                        <div>
                          <p className="mb-1 text-xs font-bold text-slate-500">{copy.themeLabel}</p>
                          <div className="grid grid-cols-3 gap-2">
                            {THEME_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => setTheme(opt.value)}
                                className={`rounded-lg py-2 text-xs font-semibold transition ${theme === opt.value
                                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                                  }`}
                              >
                                {copy[opt.labelKey]}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="mt-2">
                          {!user ? (
                            <div className="grid grid-cols-2 gap-2 p-1">
                              <button onClick={() => { setActivePage('profile'); setSettingsOpen(false); }} className="rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Sign In</button>
                              <button onClick={() => { setActivePage('profile'); setSettingsOpen(false); }} className="rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-slate-800">Sign Up</button>
                            </div>
                          ) : (
                            <button onClick={() => { logout(); setSettingsOpen(false); }} className="w-full rounded-xl border border-slate-200 py-2.5 text-center text-sm font-bold text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-900/20">Sign Out</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile Menu Toggle */}
              <button
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 md:hidden dark:border-slate-700 dark:text-slate-300"
                onClick={() => setNavMenuOpen(!navMenuOpen)}
              >
                ☰
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {navMenuOpen && (
          <div className="border-t border-slate-100 bg-white/95 px-4 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 md:hidden">
            <div className="space-y-1">
              {[
                { key: 'listings', label: copy.navCatalog },
                { key: 'dealers', label: copy.navDealers },
                { key: 'chatbot', label: copy.navChatbot },
                { key: 'analytics', label: copy.navAnalytics },
                { key: 'profile', label: copy.navProfile },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => { setActivePage(item.key as PageKey); setNavMenuOpen(false); }}
                  className={`block w-full rounded-xl px-4 py-3 text-left font-semibold ${activePage === item.key ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300'
                    }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-10">
        <main className={`rounded-3xl ${mainSurfaceClass} p-6 shadow-lg`}>
          {authLoading ? <p className="text-center text-slate-500">Loading account...</p> : renderContent()}
        </main>
      </div>
      <footer className={`${headerSurfaceClass} border-t ${subtleBorderClass}`}>
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="flex flex-wrap items-start justify-between gap-6 text-sm">
            <div>
              <p className="text-lg font-semibold">IntelliWheels</p>
              <p className={`text-sm ${headerSubtleText}`}>{copy.tagline}</p>
            </div>
            <div>
              <p className="font-semibold">{copy.footerSupport}</p>
              <p className={`text-sm ${headerSubtleText}`}>{copy.footerEmail}: support@intelliwheels.ai</p>
              <p className={`text-sm ${headerSubtleText}`}>{copy.footerPhone}: +971 55 501 0101</p>
            </div>
            <div>
              <p className="font-semibold">{copy.footerContact}</p>
              <p className={`text-sm ${headerSubtleText}`}>Suite 14, Dubai Design District</p>
              <p className={`text-sm ${headerSubtleText}`}>hello@intelliwheels.ai</p>
            </div>
            <div>
              <p className="font-semibold">{copy.footerSocial}</p>
              <div className="flex flex-col gap-1 text-sky-600">
                <a href="https://www.instagram.com/intelliwheels" target="_blank" rel="noreferrer">{copy.footerInstagram}</a>
                <a href="https://x.com/IntelliWheels" target="_blank" rel="noreferrer">X / Twitter</a>
              </div>
            </div>
          </div>
          <p className={`mt-6 text-xs ${headerMuted}`}>© {currentYear} IntelliWheels. {copy.footerRights}</p>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-5 text-slate-900 shadow-sm">
      <p className="text-xs uppercase text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function convertCurrency(value?: number, fromCurrency: CurrencyCode = 'AED', toCurrency: CurrencyCode = 'AED') {
  if (value === undefined || value === null) return null;
  if (fromCurrency === toCurrency) return value;

  // Convert from source to JOD (Base) first
  // Rates are defined as "How many JOD is 1 Unit of Source" ? NO
  // Let's assume rates in CURRENCY_RATES are "Value of 1 [Key] in JOD"
  // Wait, previous rates were based on AED. 
  // Old: USD: 3.6725 (1 USD = 3.67 AED).
  // New Base: JOD.
  // Rate logic: 1 JOD = X Currency? OR 1 Currency = X JOD?
  // Let's stick to: 1 [Key] = [Value] Base Currency (JOD).
  // So if Base is JOD:
  // USD = 0.709 (1 USD is 0.709 JOD)
  // AED = 0.19  (1 AED is 0.19 JOD)

  const fromRate = CURRENCY_RATES[fromCurrency as keyof typeof CURRENCY_RATES] ?? 1; // Value of 1 FromUnit in JOD
  const toRate = CURRENCY_RATES[toCurrency as keyof typeof CURRENCY_RATES] ?? 1;     // Value of 1 ToUnit in JOD

  // Convert Source to Base (JOD)
  // Value * Rate = Value in JOD
  const valueInBase = value * fromRate;

  // Convert Base to Target
  // ValueInBase / ToRate = Value in Target
  const converted = valueInBase / toRate;

  return converted;
}

function formatCurrency(value?: number, currency = 'AED') {
  if (!value && value !== 0) return 'TBD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch (err) {
    return `${value?.toLocaleString() ?? 'TBD'} ${currency}`;
  }
}

function camelToTitle(value: string) {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (str) => str.toUpperCase());
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
