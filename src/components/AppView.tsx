'use client';
// Trigger redeploy - v2.0.1
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  addFavorite,
  analyzeListingImage,
  approveDealerApplication,
  Conversation,
  createListing,
  deleteListing,
  fetchCars,
  fetchConversations,
  fetchDealerApplications,
  fetchFavorites,
  fetchDealers,
  fetchMakes,
  fetchMessages,
  fetchMyListings,
  fetchMyListingsAnalytics,
  fetchPlatformStats,
  fetchUnreadCount,
  getAnalytics,
  getOAuthConfig,
  getPriceEstimate,
  handleChatbotMessage,
  handleListingAssistantMessage,
  Message,
  MyListingsAnalytics,
  PlatformStats,
  rejectDealerApplication,
  removeFavorite,
  semanticSearch,
  sendMessage,
  updateListing,
  uploadListingImage,
  uploadListingVideo,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  AnalyticsInsights,
  Car,
  CarFilters,
  ChatMessage,
  ChatSession,
  CurrencyCode,
  DealerApplication,
  DealerSummary,
  PriceEstimatePayload,
  VisionAttributes,
} from '@/lib/types';
import { CHAT_HISTORY_LIMIT, STORAGE_KEYS } from '@/lib/config';
import { getAllMakes, getModelsForMake } from '@/lib/vehicleDatabase';
import { CookiePolicyPage, DisclaimerPage, FAQPage, AboutPage, HowItWorksPage, ContactPage, PricingPage } from './InfoPages';

// Dynamic import for map component (client-side only)
const DealerMap = dynamic(() => import('./DealerMap').then(mod => ({ default: mod.DealerMap })), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] items-center justify-center rounded-3xl bg-slate-100">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
        <p className="mt-3 text-sm text-slate-500">Loading map...</p>
      </div>
    </div>
  ),
});

// Make/model options for Add Listing come from comprehensive vehicle database
// Filter makes come from actual database listings

const NAV_CONFIG = [
  { key: 'home', labelKey: 'navHome', descriptionKey: 'navHomeDesc' },
  { key: 'listings', labelKey: 'navCatalog', descriptionKey: 'navCatalogDesc' },
  { key: 'favorites', labelKey: 'navFavorites', descriptionKey: 'navFavoritesDesc' },
  { key: 'messages', labelKey: 'navMessages', descriptionKey: 'navMessagesDesc' },
  { key: 'dealers', labelKey: 'navDealers', descriptionKey: 'navDealersDesc' },
  { key: 'myListings', labelKey: 'navMyListings', descriptionKey: 'navMyListingsDesc' },
  { key: 'addListing', labelKey: 'navAddListing', descriptionKey: 'navAddListingDesc' },
  { key: 'profile', labelKey: 'navProfile', descriptionKey: 'navProfileDesc' },
  { key: 'chatbot', labelKey: 'navChatbot', descriptionKey: 'navChatbotDesc' },
  { key: 'analytics', labelKey: 'navAnalytics', descriptionKey: 'navAnalyticsDesc' },
  { key: 'admin', labelKey: 'navAdmin', descriptionKey: 'navAdminDesc' },
] as const;

type InfoPageKey = 'about' | 'howItWorks' | 'pricing' | 'faq' | 'contact' | 'cookiePolicy' | 'disclaimer';
type PageKey = (typeof NAV_CONFIG)[number]['key'] | InfoPageKey;

const SERVICE_CONFIG = [
  { key: 'marketplace', labelKey: 'serviceMarketplace', descriptionKey: 'serviceMarketplaceDesc', defaultPage: 'home' as PageKey },
  { key: 'dealer', labelKey: 'serviceDealer', descriptionKey: 'serviceDealerDesc', defaultPage: 'myListings' as PageKey },
  { key: 'insights', labelKey: 'serviceInsights', descriptionKey: 'serviceInsightsDesc', defaultPage: 'chatbot' as PageKey },
] as const;

type ServiceMode = (typeof SERVICE_CONFIG)[number]['key'];

const SERVICE_NAV_MAP: Record<ServiceMode, PageKey[]> = {
  marketplace: ['home', 'listings', 'favorites', 'messages', 'dealers', 'myListings', 'addListing', 'profile', 'admin'],
  dealer: ['home', 'listings', 'dealers', 'messages', 'myListings', 'addListing', 'profile', 'analytics', 'admin'],
  insights: ['home', 'chatbot', 'analytics', 'listings', 'favorites', 'messages', 'profile', 'admin'],
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
    navHome: 'Home',
    navHomeDesc: 'Welcome to IntelliWheels',
    navCatalog: 'Catalog',
    navCatalogDesc: 'Explore the latest inventory',
    navFavorites: 'Favorites',
    navFavoritesDesc: 'Your saved picks',
    navMessages: 'Messages',
    navMessagesDesc: 'Chat with sellers',
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
    navAdmin: 'Admin Panel',
    navAdminDesc: 'Manage applications',
    searchPlaceholder: 'Search make, model, year',
    semanticPlaceholder: 'e.g. Luxury hybrid SUV under 150k',
    // Home page translations
    heroTitle: 'Find Your Perfect Car with AI',
    heroSubtitle: 'Jordan\'s smartest automotive marketplace powered by artificial intelligence',
    heroCta: 'Explore Catalog',
    heroSecondaryCta: 'Meet Our AI',
    featuresTitle: 'Why Choose IntelliWheels?',
    featuresSubtitle: 'Experience the future of car buying and selling',
    feature1Title: 'AI-Powered Search',
    feature1Desc: 'Describe your dream car in natural language and let our AI find the perfect match',
    feature2Title: 'Smart Price Analysis',
    feature2Desc: 'Get instant fair market value estimates powered by machine learning',
    feature3Title: 'Vision Recognition',
    feature3Desc: 'Upload a car photo and our AI identifies make, model, and specifications',
    feature4Title: 'Verified Dealers',
    feature4Desc: 'Connect with trusted dealers across Jordan with verified listings',
    feature5Title: 'Real-Time Analytics',
    feature5Desc: 'Track market trends, pricing insights, and make data-driven decisions',
    feature6Title: 'Multi-Currency Support',
    feature6Desc: 'View prices in JOD, USD, EUR, or SAR with real-time conversion',
    howItWorksTitle: 'How It Works',
    howItWorksSubtitle: 'Three simple steps to your next car',
    step1Title: 'Browse or Search',
    step1Desc: 'Explore our catalog or use AI search to find exactly what you need',
    step2Title: 'Get AI Insights',
    step2Desc: 'Chat with our AI assistant for recommendations and price analysis',
    step3Title: 'Connect & Buy',
    step3Desc: 'Contact verified dealers directly and make your purchase',
    statsListings: 'Active Listings',
    statsDealers: 'Verified Dealers',
    statsUsers: 'Happy Users',
    statsAiQueries: 'AI Queries Processed',
    ctaTitle: 'Ready to Find Your Dream Car?',
    ctaSubtitle: 'Join thousands of satisfied customers who found their perfect vehicle with IntelliWheels',
    ctaButton: 'Get Started Free',
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
    // Chat & AI Assistant
    chatNewChat: 'New Chat',
    chatRecent: 'Recent',
    chatMode: 'Mode',
    chatModeGeneral: '💬 General Q&A',
    chatModeListing: '📝 Listing Assistant',
    chatAssistantName: 'IntelliWheels AI',
    chatGeneralAssistant: 'General Assistant',
    chatListingAssistant: 'Listing Assistant',
    chatThinking: 'Thinking...',
    chatWelcome: 'How can I help you today?',
    chatWelcomeDesc: 'Ask me about car pricing, specifications, comparisons, or let me help you create a listing.',
    chatSuggestion1: 'Compare Toyota vs Honda',
    chatSuggestion2: 'Price a 2022 BMW X5',
    chatSuggestion3: 'Help me list my car',
    chatPlaceholder: 'Ask about cars, pricing, or type / for commands...',
    chatSendHint: 'Press Enter to send, Shift+Enter for new line',
    chatImageAttached: 'Image attached',
    chatProposedListing: '📋 Proposed Listing',
    chatDeleteChat: 'Delete chat',
    chatStopGenerating: 'Stop generating',
    chatSendMessage: 'Send message',
    // Auth & Profile
    authSignIn: 'Sign In',
    authSignUp: 'Sign Up',
    authSignOut: 'Sign Out',
    authUsername: 'Username',
    authEmail: 'Email',
    authPassword: 'Password',
    authCurrentPassword: 'Current password',
    authNewPassword: 'New password',
    authCreateAccount: 'Create Account',
    authWelcomeBack: 'Welcome back',
    authManageAccount: 'Manage account',
    profileTitle: 'Profile',
    profileUpdate: 'Update Profile',
    profileRefresh: 'Refresh Profile',
    profileSaveChanges: 'Save Changes',
    profileSignInPrompt: 'Sign in to manage your account and unlock favorites, listings, and analytics.',
    // Listings & Cars
    listingViewDetails: 'View Details',
    listingFavorite: 'Favorite',
    listingFavorited: 'Favorited',
    listingPublish: 'Publish Listing',
    listingPublishing: 'Publishing...',
    listingReviews: 'reviews',
    listingPhotos: 'photos',
    listingVideo: 'Video',
    listingYear: 'Year',
    listingPrice: 'Price',
    listingBodyStyle: 'Body Style',
    listingHorsepower: 'Horsepower',
    listingFuelEconomy: 'Fuel Economy',
    // Filters & Search
    filterAllMakes: 'All Makes',
    filterRecommended: 'Recommended',
    filterPriceLowHigh: 'Price: Low → High',
    filterPriceHighLow: 'Price: High → Low',
    filterNewerFirst: 'Newer first',
    filterTopRated: 'Top rated',
    searchAiSemantic: 'AI Semantic Search',
    searchSearching: 'Searching...',
    searchSearch: 'Search',
    searchNoResults: 'No matching cars found',
    searchInspect: 'Inspect',
    // Analytics
    analyticsAll: 'All',
    analyticsMy: 'My',
    analyticsFavorites: 'Favorites',
    analyticsAvgPrice: 'Average Price',
    analyticsCheapest: 'Cheapest',
    analyticsMostExpensive: 'Most Expensive',
    analyticsTopMakes: 'Top Makes',
    analyticsListings: 'listings',
    analyticsNoData: 'No analytics available yet. Create listings or favorites to unlock insights.',
    // Pagination
    paginationShowing: 'Showing',
    paginationOf: 'of',
    paginationListings: 'listings',
    paginationPrev: 'Prev',
    paginationNext: 'Next',
    // Vision Helper
    visionTipsTitle: 'Vision Helper Tips',
    visionTipsDesc: 'Upload clear daylight shots. The AI will detect make, model, color, and condition to pre-fill your listing.',
    visionAnalyzing: 'Analyzing image...',
    // General
    loading: 'Loading...',
    loadingAccount: 'Loading account...',
    loadingDealers: 'Loading dealers...',
    noListings: 'No listings match your filters yet.',
    noFavorites: 'No favorites yet.',
    // Add Listing Form
    formRequiredInfo: 'Required Information',
    formVehicleSpecs: 'Vehicle Specifications (Optional)',
    formAdditionalDetails: 'Additional Details (Optional)',
    formMakeLabel: 'Make',
    formModelLabel: 'Model',
    formYearLabel: 'Year',
    formPriceLabel: 'Price',
    formYearPlaceholder: 'e.g. 2023',
    formPricePlaceholder: 'e.g. 25000',
    formBodyStylePlaceholder: 'Body style (Sedan, SUV, etc.)',
    formHorsepowerPlaceholder: 'Horsepower',
    formEnginePlaceholder: 'Engine (e.g. 2.0L Turbo)',
    formFuelEconomyPlaceholder: 'Fuel economy (e.g. 12km/L)',
    formImageUrlPlaceholder: 'Image URL (or upload below)',
    formTrimPlaceholder: 'Trim (SE, Sport, etc.)',
    formExteriorColorPlaceholder: 'Exterior Color',
    formInteriorColorPlaceholder: 'Interior Color',
    formCityPlaceholder: 'City',
    formNeighborhoodPlaceholder: 'Neighborhood',
    formDescriptionPlaceholder: 'Description',
    // My Listings
    myListingsTitle: 'My Listings',
    myListingsSubtitle: 'Manage and edit your posted vehicles',
    myListingsEmpty: 'You haven\'t posted any listings yet.',
    myListingsCreateFirst: 'Create your first listing',
    myListingsEdit: 'Edit',
    myListingsDelete: 'Delete',
    myListingsDeleting: 'Deleting...',
    myListingsConfirmDelete: 'Are you sure you want to delete this listing?',
    // Price display
    priceFrom: 'from',
    priceTo: 'to',
    priceRange: 'Price Range',
    priceEstimated: 'Estimated Price',
    // Car detail labels
    conditionNew: 'New',
    conditionUsed: 'Used',
    conditionCertified: 'Certified Pre-Owned',
    transmissionAutomatic: 'Automatic',
    transmissionManual: 'Manual',
    transmissionCvt: 'CVT',
    fuelPetrol: 'Petrol',
    fuelDiesel: 'Diesel',
    fuelElectric: 'Electric',
    fuelHybrid: 'Hybrid',
    fuelPluginHybrid: 'Plug-in Hybrid',
    paymentCash: 'Cash',
    paymentInstallment: 'Installment',
    paymentBoth: 'Cash or Installments',
    specGcc: 'GCC Specs',
    specAmerican: 'American Specs',
    specEuropean: 'European Specs',
    specJapanese: 'Japanese Specs',
    specOther: 'Other Specs',
    // Grid layout
    gridLayout: 'Grid',
    listLayout: 'List',
    columnsLabel: 'Columns',
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
    navHome: 'الرئيسية',
    navHomeDesc: 'مرحباً بك في إنتلي ويلز',
    navCatalog: 'الكتالوج',
    navCatalogDesc: 'اكتشف أحدث السيارات',
    navFavorites: 'المفضلة',
    navFavoritesDesc: 'سياراتك المختارة',
    navMessages: 'الرسائل',
    navMessagesDesc: 'تواصل مع البائعين',
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
    navAdmin: 'لوحة الإدارة',
    navAdminDesc: 'إدارة الطلبات',
    searchPlaceholder: 'ابحث عن الموديل أو السنة',
    semanticPlaceholder: 'مثال: سيارة هجينة فاخرة أقل من 150 ألف',
    // Home page translations
    heroTitle: 'اعثر على سيارتك المثالية مع الذكاء الاصطناعي',
    heroSubtitle: 'أذكى سوق سيارات في الأردن مدعوم بالذكاء الاصطناعي',
    heroCta: 'استكشف الكتالوج',
    heroSecondaryCta: 'تعرف على المساعد الذكي',
    featuresTitle: 'لماذا تختار إنتلي ويلز؟',
    featuresSubtitle: 'اختبر مستقبل شراء وبيع السيارات',
    feature1Title: 'بحث ذكي بالذكاء الاصطناعي',
    feature1Desc: 'صِف سيارة أحلامك بكلماتك ودع الذكاء الاصطناعي يجد المطابقة المثالية',
    feature2Title: 'تحليل ذكي للأسعار',
    feature2Desc: 'احصل على تقديرات فورية للقيمة السوقية العادلة بتقنية التعلم الآلي',
    feature3Title: 'تعرف بصري على السيارات',
    feature3Desc: 'ارفع صورة سيارة ويتعرف الذكاء الاصطناعي على الشركة والموديل والمواصفات',
    feature4Title: 'وكلاء معتمدون',
    feature4Desc: 'تواصل مع وكلاء موثوقين في جميع أنحاء الأردن بعروض مضمونة',
    feature5Title: 'تحليلات فورية',
    feature5Desc: 'تابع اتجاهات السوق ورؤى الأسعار واتخذ قرارات مبنية على البيانات',
    feature6Title: 'دعم متعدد العملات',
    feature6Desc: 'شاهد الأسعار بالدينار أو الدولار أو اليورو أو الريال مع تحويل فوري',
    howItWorksTitle: 'كيف يعمل؟',
    howItWorksSubtitle: 'ثلاث خطوات بسيطة لسيارتك القادمة',
    step1Title: 'تصفح أو ابحث',
    step1Desc: 'استكشف الكتالوج أو استخدم البحث الذكي للعثور على ما تريده بالضبط',
    step2Title: 'احصل على رؤى ذكية',
    step2Desc: 'تحدث مع المساعد الذكي للحصول على توصيات وتحليل الأسعار',
    step3Title: 'تواصل واشترِ',
    step3Desc: 'تواصل مع الوكلاء المعتمدين مباشرة وأتمم عملية الشراء',
    statsListings: 'عروض نشطة',
    statsDealers: 'وكلاء معتمدون',
    statsUsers: 'عملاء سعداء',
    statsAiQueries: 'استعلامات ذكية',
    ctaTitle: 'مستعد للعثور على سيارة أحلامك؟',
    ctaSubtitle: 'انضم لآلاف العملاء الراضين الذين وجدوا سيارتهم المثالية مع إنتلي ويلز',
    ctaButton: 'ابدأ مجاناً',
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
    dealersSubheading: 'استكشف صالات العرض المختارة من شركاء إنتلي ويلز.',
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
    // Chat & AI Assistant - المساعد الذكي والدردشة
    chatNewChat: 'محادثة جديدة',
    chatRecent: 'الأخيرة',
    chatMode: 'الوضع',
    chatModeGeneral: '💬 أسئلة عامة',
    chatModeListing: '📝 مساعد الإعلانات',
    chatAssistantName: 'مساعد إنتلي ويلز الذكي',
    chatGeneralAssistant: 'المساعد العام',
    chatListingAssistant: 'مساعد الإعلانات',
    chatThinking: 'جاري التفكير...',
    chatWelcome: 'كيف يمكنني مساعدتك اليوم؟',
    chatWelcomeDesc: 'اسألني عن أسعار السيارات، المواصفات، المقارنات، أو دعني أساعدك في إنشاء إعلان.',
    chatSuggestion1: 'قارن بين تويوتا وهوندا',
    chatSuggestion2: 'سعر BMW X5 موديل 2022',
    chatSuggestion3: 'ساعدني في بيع سيارتي',
    chatPlaceholder: 'اسأل عن السيارات، الأسعار، أو اكتب / للأوامر...',
    chatSendHint: 'اضغط Enter للإرسال، Shift+Enter لسطر جديد',
    chatImageAttached: 'تم إرفاق صورة',
    chatProposedListing: '📋 الإعلان المقترح',
    chatDeleteChat: 'حذف المحادثة',
    chatStopGenerating: 'إيقاف التوليد',
    chatSendMessage: 'إرسال الرسالة',
    // Auth & Profile - المصادقة والملف الشخصي
    authSignIn: 'تسجيل الدخول',
    authSignUp: 'إنشاء حساب',
    authSignOut: 'تسجيل الخروج',
    authUsername: 'اسم المستخدم',
    authEmail: 'البريد الإلكتروني',
    authPassword: 'كلمة المرور',
    authCurrentPassword: 'كلمة المرور الحالية',
    authNewPassword: 'كلمة المرور الجديدة',
    authCreateAccount: 'إنشاء حساب جديد',
    authWelcomeBack: 'مرحباً بعودتك',
    authManageAccount: 'إدارة الحساب',
    profileTitle: 'الملف الشخصي',
    profileUpdate: 'تحديث الملف الشخصي',
    profileRefresh: 'تحديث البيانات',
    profileSaveChanges: 'حفظ التغييرات',
    profileSignInPrompt: 'سجل الدخول لإدارة حسابك وفتح المفضلة والإعلانات والتحليلات.',
    // Listings & Cars - الإعلانات والسيارات
    listingViewDetails: 'عرض التفاصيل',
    listingFavorite: 'إضافة للمفضلة',
    listingFavorited: 'في المفضلة',
    listingPublish: 'نشر الإعلان',
    listingPublishing: 'جاري النشر...',
    listingReviews: 'تقييمات',
    listingPhotos: 'صور',
    listingVideo: 'فيديو',
    listingYear: 'السنة',
    listingPrice: 'السعر',
    listingBodyStyle: 'نوع الهيكل',
    listingHorsepower: 'قوة المحرك',
    listingFuelEconomy: 'استهلاك الوقود',
    // Filters & Search - الفلاتر والبحث
    filterAllMakes: 'جميع الشركات',
    filterRecommended: 'موصى به',
    filterPriceLowHigh: 'السعر: من الأقل للأعلى',
    filterPriceHighLow: 'السعر: من الأعلى للأقل',
    filterNewerFirst: 'الأحدث أولاً',
    filterTopRated: 'الأعلى تقييماً',
    searchAiSemantic: 'البحث الذكي بالذكاء الاصطناعي',
    searchSearching: 'جاري البحث...',
    searchSearch: 'بحث',
    searchNoResults: 'لم يتم العثور على سيارات مطابقة',
    searchInspect: 'فحص',
    // Analytics - التحليلات
    analyticsAll: 'الكل',
    analyticsMy: 'إعلاناتي',
    analyticsFavorites: 'المفضلة',
    analyticsAvgPrice: 'متوسط السعر',
    analyticsCheapest: 'الأرخص',
    analyticsMostExpensive: 'الأغلى',
    analyticsTopMakes: 'أشهر الشركات',
    analyticsListings: 'إعلانات',
    analyticsNoData: 'لا توجد تحليلات بعد. أنشئ إعلانات أو أضف للمفضلة لفتح الرؤى.',
    // Pagination - التصفح
    paginationShowing: 'عرض',
    paginationOf: 'من',
    paginationListings: 'إعلانات',
    paginationPrev: 'السابق',
    paginationNext: 'التالي',
    // Vision Helper - مساعد الرؤية
    visionTipsTitle: 'نصائح مساعد الرؤية',
    visionTipsDesc: 'ارفع صوراً واضحة في ضوء النهار. سيقوم الذكاء الاصطناعي بتحديد الشركة، الموديل، اللون، والحالة لملء إعلانك تلقائياً.',
    visionAnalyzing: 'جاري تحليل الصورة...',
    // General - عام
    loading: 'جاري التحميل...',
    loadingAccount: 'جاري تحميل الحساب...',
    loadingDealers: 'جاري تحميل الوكلاء...',
    noListings: 'لا توجد إعلانات تطابق الفلاتر المحددة.',
    noFavorites: 'لا توجد مفضلات بعد.',
    // Add Listing Form - نموذج الإضافة
    formRequiredInfo: 'المعلومات المطلوبة',
    formVehicleSpecs: 'مواصفات السيارة (اختياري)',
    formAdditionalDetails: 'تفاصيل إضافية (اختياري)',
    formMakeLabel: 'الشركة',
    formModelLabel: 'الموديل',
    formYearLabel: 'السنة',
    formPriceLabel: 'السعر',
    formYearPlaceholder: 'مثال: 2023',
    formPricePlaceholder: 'مثال: 25000',
    formBodyStylePlaceholder: 'نوع الهيكل (سيدان، SUV، إلخ)',
    formHorsepowerPlaceholder: 'قوة المحرك',
    formEnginePlaceholder: 'المحرك (مثال: 2.0L تيربو)',
    formFuelEconomyPlaceholder: 'استهلاك الوقود (مثال: 12 كم/لتر)',
    formImageUrlPlaceholder: 'رابط الصورة (أو ارفع أدناه)',
    formTrimPlaceholder: 'الفئة (SE، Sport، إلخ)',
    formExteriorColorPlaceholder: 'لون خارجي',
    formInteriorColorPlaceholder: 'لون داخلي',
    formCityPlaceholder: 'المدينة',
    formNeighborhoodPlaceholder: 'الحي',
    formDescriptionPlaceholder: 'الوصف',
    // My Listings - سياراتي المعروضة
    myListingsTitle: 'سياراتي المعروضة',
    myListingsSubtitle: 'إدارة وتعديل السيارات التي عرضتها',
    myListingsEmpty: 'لم تقم بعرض أي سيارات بعد.',
    myListingsCreateFirst: 'أنشئ أول إعلان لك',
    myListingsEdit: 'تعديل',
    myListingsDelete: 'حذف',
    myListingsDeleting: 'جاري الحذف...',
    myListingsConfirmDelete: 'هل أنت متأكد من حذف هذا الإعلان؟',
    // Price display
    priceFrom: 'من',
    priceTo: 'إلى',
    priceRange: 'نطاق السعر',
    priceEstimated: 'السعر المقدر',
    // Car detail labels - تفاصيل السيارة
    conditionNew: 'جديد',
    conditionUsed: 'مستعمل',
    conditionCertified: 'معتمد مستعمل',
    transmissionAutomatic: 'أوتوماتيك',
    transmissionManual: 'عادي (مانيوال)',
    transmissionCvt: 'CVT',
    fuelPetrol: 'بنزين',
    fuelDiesel: 'ديزل',
    fuelElectric: 'كهربائي',
    fuelHybrid: 'هجين',
    fuelPluginHybrid: 'هجين قابل للشحن',
    paymentCash: 'كاش',
    paymentInstallment: 'أقساط',
    paymentBoth: 'كاش أو أقساط',
    specGcc: 'خليجي',
    specAmerican: 'أمريكي',
    specEuropean: 'أوروبي',
    specJapanese: 'ياباني',
    specOther: 'مواصفات أخرى',
    // Grid layout - تخطيط الشبكة
    gridLayout: 'شبكة',
    listLayout: 'قائمة',
    columnsLabel: 'الأعمدة',
  },
} as const;

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
] as const;

const CURRENCY_OPTIONS: CurrencyCode[] = ['JOD', 'AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'BHD', 'KWD', 'OMR'];

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'car', label: 'Cars' },
  { value: 'suv', label: 'SUVs' },
  { value: 'truck', label: 'Trucks' },
  { value: 'bike', label: 'Motorcycles' },
  { value: 'van', label: 'Vans' },
  { value: 'bus', label: 'Buses' },
  { value: 'other', label: 'Other' },
];

const CONDITION_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'used', label: 'Used' },
  { value: 'certified', label: 'Certified Pre-Owned' },
];

const TRANSMISSION_OPTIONS = [
  { value: '', label: 'Select Transmission' },
  { value: 'automatic', label: 'Automatic' },
  { value: 'manual', label: 'Manual' },
  { value: 'cvt', label: 'CVT' },
  { value: 'other', label: 'Other' },
];

const FUEL_TYPE_OPTIONS = [
  { value: '', label: 'Select Fuel Type' },
  { value: 'petrol', label: 'Petrol/Gasoline' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'electric', label: 'Electric' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'plugin_hybrid', label: 'Plug-in Hybrid' },
  { value: 'lpg', label: 'LPG' },
  { value: 'other', label: 'Other' },
];

const REGIONAL_SPEC_OPTIONS = [
  { value: '', label: 'Select Regional Spec' },
  { value: 'gcc', label: 'GCC Specs' },
  { value: 'american', label: 'American Specs' },
  { value: 'european', label: 'European Specs' },
  { value: 'japanese', label: 'Japanese Specs' },
  { value: 'korean', label: 'Korean Specs' },
  { value: 'other', label: 'Other' },
];

const PAYMENT_TYPE_OPTIONS = [
  { value: 'cash', label: 'Cash Only' },
  { value: 'installments', label: 'Installments Only' },
  { value: 'both', label: 'Cash or Installments' },
];

const DEFAULT_FILTERS: CarFilters = {
  make: 'all',
  search: '',
  sort: 'default',
  category: 'all',
};

const LISTINGS_PER_PAGE = 10;

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
  videoUrls: string[];
  description: string;
  // New fields
  category: string;
  condition: string;
  exteriorColor: string;
  interiorColor: string;
  transmission: string;
  fuelType: string;
  regionalSpec: string;
  paymentType: string;
  city: string;
  neighborhood: string;
  trim: string;
}

interface VisionSuggestion extends VisionAttributes {
  raw?: string;
}

export function AppView() {
  const { user, token, loading: authLoading, sessionValidated, login, signup, loginWithGoogle, requestPasswordReset, resetUserPassword, logout, updateMyProfile, refreshProfile, error: authError, clearError, currency, setCurrency, formatPrice, convertCurrency } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [activePage, setActivePageRaw] = useState<PageKey>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('intelliwheels-activePage');
      if (stored) return stored as PageKey;
    }
    return 'home';
  });
  // Wrap setActivePage to persist to sessionStorage
  const setActivePage = useCallback((page: PageKey | ((prev: PageKey) => PageKey)) => {
    setActivePageRaw((prev) => {
      const next = typeof page === 'function' ? page(prev) : page;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('intelliwheels-activePage', next);
      }
      return next;
    });
  }, []);
  const [serviceMode, setServiceMode] = useState<ServiceMode>('marketplace');
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [filters, setFilters] = useState<CarFilters>(DEFAULT_FILTERS);
  const [cars, setCars] = useState<Car[]>([]);
  const [carsRefreshKey, setCarsRefreshKey] = useState(0);
  const [makes, setMakes] = useState<string[]>([]);
  const [dealers, setDealers] = useState<DealerSummary[]>([]);
  const [dealersLoading, setDealersLoading] = useState(false);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [favoriteCars, setFavoriteCars] = useState<Car[]>([]);
  const [myListings, setMyListings] = useState<Car[]>([]);
  const [myListingsAnalytics, setMyListingsAnalytics] = useState<MyListingsAnalytics | null>(null);
  const [myListingsAnalyticsLoading, setMyListingsAnalyticsLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsInsights | null>(null);
  const [analyticsFilter, setAnalyticsFilter] = useState<'all' | 'my' | 'favorites'>('all');
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticResults, setSemanticResults] = useState<Car[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>('login');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [isSubmittingListing, setIsSubmittingListing] = useState(false);
  const [editingListing, setEditingListing] = useState<Car | null>(null);
  const [editForm, setEditForm] = useState<ListingFormState>({
    make: '',
    model: '',
    year: '',
    price: '',
    currency: 'JOD',
    bodyStyle: '',
    horsepower: '',
    engine: '',
    fuelEconomy: '',
    odometer: '',
    image: '',
    galleryImages: [],
    videoUrls: [],
    description: '',
    category: 'car',
    condition: 'used',
    exteriorColor: '',
    interiorColor: '',
    transmission: '',
    fuelType: '',
    regionalSpec: '',
    paymentType: 'cash',
    city: '',
    neighborhood: '',
    trim: '',
  });
  const [listingForm, setListingForm] = useState<ListingFormState>({
    make: '',
    model: '',
    year: '',
    price: '',
    currency: 'JOD',
    bodyStyle: '',
    horsepower: '',
    engine: '',
    fuelEconomy: '',
    odometer: '',
    image: '',
    galleryImages: [],
    videoUrls: [],
    description: '',
    category: 'car',
    condition: 'used',
    exteriorColor: '',
    interiorColor: '',
    transmission: '',
    fuelType: '',
    regionalSpec: '',
    paymentType: 'cash',
    city: '',
    neighborhood: '',
    trim: '',
  });
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [priceEstimate, setPriceEstimate] = useState<{ value: number; currency: CurrencyCode; range?: { low: number; high: number } } | null>(null);
  const [visionSuggestion, setVisionSuggestion] = useState<VisionSuggestion | null>(null);
  const [visionLoading, setVisionLoading] = useState(false);
  const [assistantMode, setAssistantMode] = useState<'general' | 'listing'>('general');
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatAbortController, setChatAbortController] = useState<AbortController | null>(null);
  const [chatAttachment, setChatAttachment] = useState<{ preview: string; base64: string; mime: string } | null>(null);
  const [mobileChatHistoryOpen, setMobileChatHistoryOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const [headerSearchQuery, setHeaderSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dealerTab, setDealerTab] = useState<'map' | 'grid'>('grid');
  const [gridColumns, setGridColumns] = useState<1 | 2 | 3>(3); // Grid layout columns: 1, 2, or 3
  const [dealerRegistrationOpen, setDealerRegistrationOpen] = useState(false);
  const [dealerRegistrationForm, setDealerRegistrationForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    description: '',
    website: '',
  });
  const [floatingChatOpen, setFloatingChatOpen] = useState(false);
  const [floatingChatPosition, setFloatingChatPosition] = useState({ x: 20, y: 20 });
  const [isDraggingChat, setIsDraggingChat] = useState(false);
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  // Admin panel state
  const [dealerApplications, setDealerApplications] = useState<DealerApplication[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminFilter, setAdminFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [adminActionModal, setAdminActionModal] = useState<{ type: 'approve' | 'reject'; application: DealerApplication } | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [adminReason, setAdminReason] = useState('');
  // Platform stats for home page
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  // Messaging state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [activeConversationMessages, setActiveConversationMessages] = useState<Message[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const floatingChatRef = useRef<HTMLDivElement | null>(null);
  const serviceMenuRef = useRef<HTMLDivElement | null>(null);
  const navMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const headerSearchRef = useRef<HTMLInputElement | null>(null);
  const resolvedTheme = theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme;
  const currentService = SERVICE_CONFIG.find((service) => service.key === serviceMode) ?? SERVICE_CONFIG[0];
  const router = useRouter();

  const copy = TRANSLATIONS[language];
  const apiHost = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
    return base.replace(/\/api$/, '');
  }, []);
  
  // Comprehensive vehicle database for Add Listing form (all production vehicles)
  const allVehicleMakes = useMemo(() => getAllMakes(), []);
  const listingModelOptions = useMemo(
    () => listingForm.make ? getModelsForMake(listingForm.make) : [],
    [listingForm.make]
  );
  
  // Allow custom make/model if not in database
  const availableMakeOptions = useMemo(() => {
    if (!listingForm.make || allVehicleMakes.includes(listingForm.make)) {
      return allVehicleMakes;
    }
    return [...allVehicleMakes, listingForm.make].sort((a, b) => a.localeCompare(b));
  }, [listingForm.make, allVehicleMakes]);
  
  const availableModelOptions = useMemo(() => {
    if (!listingForm.model || listingModelOptions.includes(listingForm.model)) {
      return listingModelOptions;
    }
    return [...listingModelOptions, listingForm.model].sort((a, b) => a.localeCompare(b));
  }, [listingForm.model, listingModelOptions]);
  
  // Engine is free text input since it varies too much
  const availableEngineOptions: string[] = [];
  const direction = language === 'ar' ? 'rtl' : 'ltr';
  const backgroundClass = resolvedTheme === 'dark'
    ? 'bg-slate-950 text-slate-100'
    : 'bg-slate-50 text-slate-900';
  // Background with elegant gradient - provides professional look without external image dependency
  const backgroundImageStyle = {
    backgroundImage: resolvedTheme === 'dark'
      ? 'linear-gradient(135deg, rgba(2, 6, 23, 1) 0%, rgba(15, 23, 42, 1) 25%, rgba(30, 41, 59, 0.95) 50%, rgba(15, 23, 42, 0.9) 75%, rgba(2, 6, 23, 1) 100%)'
      : 'linear-gradient(135deg, rgba(248, 250, 252, 1) 0%, rgba(241, 245, 249, 1) 25%, rgba(226, 232, 240, 0.95) 50%, rgba(186, 230, 253, 0.8) 75%, rgba(56, 189, 248, 0.4) 100%)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
    backgroundRepeat: 'no-repeat',
  };
  const headerSurfaceClass = resolvedTheme === 'dark'
    ? 'bg-slate-950/95 border-b border-slate-700/60 text-slate-100'
    : 'bg-white/95 border-b border-slate-200/60 text-slate-900';
  const mainSurfaceClass = resolvedTheme === 'dark'
    ? 'border-slate-700 bg-slate-900/95 text-slate-100'
    : 'border-slate-100 bg-white/90 text-slate-900';
  const headerMuted = resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500';
  const headerSubtleText = resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-600';
  const selectorClass = resolvedTheme === 'dark'
    ? 'rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100'
    : 'rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900';
  const statusPillClass = mounted && token
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
      // Pass current page as 'from' so the back button knows where to return
      router.push(`/cars/${carId}?from=${activePage}`);
    },
    [router, activePage]
  );
  const handleOpenDealer = useCallback(
    (dealerId: number) => {
      router.push(`/dealers/${dealerId}?from=${activePage}`);
    },
    [router, activePage]
  );
  const inputFieldClass = resolvedTheme === 'dark'
    ? 'rounded-2xl border border-slate-600 bg-slate-700 p-3 text-white placeholder-slate-400 focus:border-sky-500 focus:outline-none'
    : 'rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none';

  const chatSession = useMemo(() => chatSessions.find((session) => session.id === activeSessionId) ?? null, [chatSessions, activeSessionId]);
  const chatMessages = chatSession?.messages ?? [];

  useEffect(() => {
    setMounted(true);
    
    // Load OAuth config
    getOAuthConfig().then(config => {
      if (config.google?.enabled && config.google?.client_id) {
        setGoogleClientId(config.google.client_id);
      }
    }).catch(() => {});
    
    // Check for password reset token in URL
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const resetTokenParam = params.get('reset_token');
      if (resetTokenParam) {
        setResetToken(resetTokenParam);
        setAuthMode('reset');
        setActivePage('profile');
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname);
      }
      
      // Handle view parameter (for returning from detail pages)
      const viewParam = params.get('view');
      if (viewParam && !resetTokenParam) {
        const validPages: PageKey[] = ['home', 'listings', 'favorites', 'myListings', 'addListing', 'dealers', 'analytics', 'chatbot', 'messages', 'profile'];
        if (validPages.includes(viewParam as PageKey)) {
          setActivePage(viewParam as PageKey);
          // Clean up URL to avoid re-triggering on refresh
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    }
  }, []);

  // Fetch platform stats for home page
  useEffect(() => {
    async function loadStats() {
      try {
        const response = await fetchPlatformStats();
        if (response.success) {
          setPlatformStats(response.stats);
        }
      } catch (err) {
        console.warn('Failed to load platform stats', err);
      }
    }
    loadStats();
  }, []);

  // Detect system dark mode preference
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemPrefersDark(mediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

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

  // User-specific chat storage key
  const userChatStorageKey = useMemo(() => {
    if (!user?.id) return null;
    return `${STORAGE_KEYS.chatSessions}-${user.id}`;
  }, [user?.id]);

  // Load chat sessions for current user
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!userChatStorageKey) {
      // Clear chat sessions when user logs out
      setChatSessions([]);
      setActiveSessionId(null);
      return;
    }
    const storedSessions = localStorage.getItem(userChatStorageKey);
    if (!storedSessions) {
      setChatSessions([]);
      setActiveSessionId(null);
      return;
    }
    try {
      const parsed = JSON.parse(storedSessions);
      if (Array.isArray(parsed)) {
        setChatSessions(parsed);
        setActiveSessionId((prev) => prev ?? parsed[0]?.id ?? null);
      }
    } catch (err) {
      console.warn('Failed to parse chat sessions', err);
      setChatSessions([]);
    }
  }, [userChatStorageKey]);

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
    // Explicitly allow 'chatbot', 'analytics', 'add_listing' to prevent flashing/redirect loops
    const alwaysAllowed = ['chatbot', 'analytics', 'add_listing', 'profile'];

    if (!allowedPages.includes(activePage) && !alwaysAllowed.includes(activePage)) {
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
      if (headerSearchOpen && headerSearchRef.current && !headerSearchRef.current.contains(target)) {
        setHeaderSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [serviceMenuOpen, navMenuOpen, settingsOpen, headerSearchOpen]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setServiceMenuOpen(false);
        setNavMenuOpen(false);
        setSettingsOpen(false);
        setHeaderSearchOpen(false);
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

  // Debounce search input to avoid excessive re-renders
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // Load cars once on mount and when make filter changes (not on search)
  useEffect(() => {
    const controller = new AbortController();
    async function loadCars() {
      try {
        // Only pass make filter to server, search is done locally
        const serverFilters = { ...filters, search: '' };
        const response = await fetchCars(serverFilters, controller.signal, token);
        if (response.success) {
          setCars(response.cars || []);
        }
      } catch (err: any) {
        // Ignore abort errors (expected when component unmounts or re-renders)
        if (err?.name === 'AbortError') return;
        console.warn('Failed to load cars', err);
        // Only redirect if explicitly rejected and not already on a vital public page
        if (typeof err?.message === 'string' && err.message.toLowerCase().includes('auth') && activePage !== 'listings' && activePage !== 'dealers') {
          // Don't auto-redirect, just let the user see the restricted content message or handle it locally
        }
      }
    }
    loadCars();
    return () => controller.abort();
  }, [filters.make, filters.category, filters.sort, token, carsRefreshKey]);

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
    // Wait until session is validated before fetching protected data
    // This prevents 401 errors from stale/expired tokens
    if (authLoading || !sessionValidated) {
      return;
    }
    if (!token) {
      setFavorites([]);
      setFavoriteCars([]);
      setMyListings([]);
      setMyListingsAnalytics(null);
      setConversations([]);
      setUnreadMessageCount(0);
      return;
    }

    async function hydrateAuthorizedData() {
      try {
        const [favoritesResponse, listingsResponse] = await Promise.all([
          fetchFavorites(token),
          fetchMyListings(token),
        ]);
        if (favoritesResponse.success) {
          const favCars = favoritesResponse.cars || [];
          setFavoriteCars(favCars);
          setFavorites(favCars.map((car) => car.id));
        }
        if (listingsResponse.success) {
          setMyListings(listingsResponse.cars || []);
        }
      } catch (err) {
        console.warn('Failed to load protected data', err);
      }
    }
    hydrateAuthorizedData();
    
    // Load unread message count
    async function loadUnreadCount() {
      try {
        const response = await fetchUnreadCount(token);
        if (response.success) {
          setUnreadMessageCount(response.unread_count);
        }
      } catch (err) {
        console.warn('Failed to load unread count', err);
      }
    }
    loadUnreadCount();
  }, [token, authLoading, sessionValidated]);

  // Load my listings analytics when on myListings page
  useEffect(() => {
    if (authLoading || !sessionValidated || !token || activePage !== 'myListings') {
      return;
    }
    async function loadMyListingsAnalytics() {
      setMyListingsAnalyticsLoading(true);
      try {
        const response = await fetchMyListingsAnalytics(token);
        if (response.success) {
          setMyListingsAnalytics(response.analytics);
        }
      } catch (err) {
        console.warn('Failed to load my listings analytics', err);
      } finally {
        setMyListingsAnalyticsLoading(false);
      }
    }
    loadMyListingsAnalytics();
  }, [token, activePage, authLoading, sessionValidated]);

  // Load conversations when on messages page
  useEffect(() => {
    if (authLoading || !sessionValidated || !token || activePage !== 'messages') {
      return;
    }
    async function loadConversations() {
      setMessagesLoading(true);
      try {
        const response = await fetchConversations(token);
        if (response.success) {
          setConversations(response.conversations);
        }
      } catch (err) {
        console.warn('Failed to load conversations', err);
      } finally {
        setMessagesLoading(false);
      }
    }
    loadConversations();
  }, [token, activePage, authLoading, sessionValidated]);

  // Load messages for active conversation
  useEffect(() => {
    if (authLoading || !sessionValidated || !token || !activeConversationId) {
      return;
    }
    async function loadMessages() {
      try {
        const response = await fetchMessages(activeConversationId!, token);
        if (response.success) {
          setActiveConversationMessages(response.messages);
          // Update unread count after reading messages
          const unreadResponse = await fetchUnreadCount(token);
          if (unreadResponse.success) {
            setUnreadMessageCount(unreadResponse.unread_count);
          }
        }
      } catch (err) {
        console.warn('Failed to load messages', err);
      }
    }
    loadMessages();
  }, [token, activeConversationId, authLoading, sessionValidated]);

  useEffect(() => {
    if (authLoading || !sessionValidated || !token) {
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
  }, [token, analyticsFilter, authLoading, sessionValidated]);

  useEffect(() => {
    if (authLoading || !sessionValidated || !token) {
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
  }, [token, authLoading, sessionValidated]);

  // ------- Admin: Fetch Dealer Applications
  useEffect(() => {
    if (authLoading || !sessionValidated || activePage !== 'admin' || !user?.is_admin || !token) return;
    
    let cancelled = false;
    async function loadApplications() {
      setAdminLoading(true);
      try {
        const statusParam = adminFilter === 'all' ? undefined : adminFilter;
        const response = await fetchDealerApplications(token, statusParam);
        if (!cancelled && response.success) {
          setDealerApplications(response.applications || []);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to load dealer applications', err);
        }
      } finally {
        if (!cancelled) {
          setAdminLoading(false);
        }
      }
    }
    loadApplications();
    return () => {
      cancelled = true;
    };
  }, [activePage, token, user?.is_admin, adminFilter, authLoading, sessionValidated]);

  // ------- Admin: Handle Approve/Reject
  const handleApproveApplication = useCallback(async (application: DealerApplication) => {
    if (!token) return;
    try {
      const response = await approveDealerApplication(application.id, adminNotes, token);
      if (response.success) {
        showToast(`✅ ${application.name} has been approved!`, 'success');
        setDealerApplications(prev => prev.filter(a => a.id !== application.id));
        setAdminActionModal(null);
        setAdminNotes('');
      } else {
        showToast(response.error || 'Failed to approve', 'error');
      }
    } catch {
      showToast('Failed to approve application', 'error');
    }
  }, [token, adminNotes]);

  const handleRejectApplication = useCallback(async (application: DealerApplication) => {
    if (!token) return;
    try {
      const response = await rejectDealerApplication(application.id, adminReason, adminNotes, token);
      if (response.success) {
        showToast(`❌ ${application.name} has been rejected`, 'info');
        setDealerApplications(prev => prev.filter(a => a.id !== application.id));
        setAdminActionModal(null);
        setAdminNotes('');
        setAdminReason('');
      } else {
        showToast(response.error || 'Failed to reject', 'error');
      }
    } catch {
      showToast('Failed to reject application', 'error');
    }
  }, [token, adminNotes, adminReason]);

  useEffect(() => {
    if (typeof window === 'undefined' || !userChatStorageKey) return;
    localStorage.setItem(userChatStorageKey, JSON.stringify(chatSessions));
  }, [chatSessions, userChatStorageKey]);

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

  const deleteChatSession = useCallback((sessionId: string) => {
    setChatSessions((prev) => {
      const filtered = prev.filter((session) => session.id !== sessionId);
      // If deleting the active session, switch to another one
      if (sessionId === activeSessionId) {
        setActiveSessionId(filtered[0]?.id ?? null);
      }
      return filtered;
    });
  }, [activeSessionId]);

  const ensureSession = useCallback(() => {
    if (activeSessionId) return activeSessionId;
    return startNewChat();
  }, [activeSessionId, startNewChat]);

  const toggleFavorite = useCallback(
    async (car: Car) => {
      if (!requireAuth()) return;
      const isFavorited = favorites.includes(car.id);
      // Optimistically update both favorites IDs and favoriteCars array
      setFavorites((prev) =>
        isFavorited ? prev.filter((id) => id !== car.id) : [...prev, car.id]
      );
      setFavoriteCars((prev) =>
        isFavorited ? prev.filter((c) => c.id !== car.id) : [...prev, car]
      );
      try {
        if (isFavorited) {
          await removeFavorite(car.id, token);
          showToast('💔 Removed from favorites', 'info');
        } else {
          await addFavorite(car.id, token);
          showToast('❤️ Added to favorites successfully');
        }
      } catch (err) {
        showToast('Unable to update favorites', 'error');
        // Revert on error
        setFavorites((prev) =>
          isFavorited ? [...prev, car.id] : prev.filter((id) => id !== car.id)
        );
        setFavoriteCars((prev) =>
          isFavorited ? [...prev, car] : prev.filter((c) => c.id !== car.id)
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
    // Only fill empty fields - never override user-entered data
    setListingForm((prev) => ({
      ...prev,
      make: prev.make || attributes.make || '',
      model: prev.model || attributes.model || '',
      year: prev.year || (attributes.year ? String(attributes.year) : ''),
      bodyStyle: prev.bodyStyle || attributes.bodyStyle || '',
      // Never override price - user might have used Price Assist
      price: prev.price || (attributes.estimatedPrice ? String(attributes.estimatedPrice) : ''),
      description: prev.description || attributes.conditionDescription || '',
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

  const uploadVideoAsset = useCallback(
    async (file: File) => {
      const response = await uploadListingVideo(file, token);
      if (response.success && response.url) {
        return response.url;
      }
      const errorMessage = (response as { error?: string }).error;
      throw new Error(errorMessage || 'Video upload failed');
    },
    [token]
  );

  const handleUploadImage = async (file: File) => {
    if (!requireAuth()) return;
    try {
      const url = await uploadImageAsset(file);
      handleListingInput('image', url);
      showToast('✅ Image uploaded successfully');
    } catch (err: any) {
      showToast(err.message || 'Failed to upload image', 'error');
    }
  };

  const handleGalleryUpload = async (fileList: FileList | null) => {
    if (!requireAuth() || !fileList || fileList.length === 0) return;
    try {
      // Calculate remaining slots (max 12 images)
      const remainingSlots = 12 - listingForm.galleryImages.length;
      if (remainingSlots <= 0) {
        showToast('Gallery is full - maximum 12 images allowed', 'info');
        return;
      }
      const uploads = Array.from(fileList).slice(0, remainingSlots);
      const uploadedUrls: string[] = [];
      for (const file of uploads) {
        // eslint-disable-next-line no-await-in-loop
        const url = await uploadImageAsset(file);
        uploadedUrls.push(url);
      }
      if (!uploadedUrls.length) return;
      setListingForm((prev) => {
        const combined = [...prev.galleryImages, ...uploadedUrls].slice(0, 12);
        const primaryImage = prev.image || combined[0] || '';
        return { ...prev, galleryImages: combined, image: primaryImage };
      });
      showToast(`${uploadedUrls.length} image(s) uploaded`);
    } catch (err: any) {
      showToast(err.message || 'Gallery upload failed', 'error');
    }
  };

  const handleVideoUpload = async (fileList: FileList | null) => {
    if (!requireAuth() || !fileList || fileList.length === 0) return;
    try {
      // Calculate remaining slots (max 2 videos)
      const remainingSlots = 2 - listingForm.videoUrls.length;
      if (remainingSlots <= 0) {
        showToast('Maximum 2 videos allowed', 'info');
        return;
      }
      const uploads = Array.from(fileList).slice(0, remainingSlots);
      const uploadedUrls: string[] = [];
      for (const file of uploads) {
        // eslint-disable-next-line no-await-in-loop
        const url = await uploadVideoAsset(file);
        uploadedUrls.push(url);
      }
      if (!uploadedUrls.length) return;
      setListingForm((prev) => {
        const combined = [...prev.videoUrls, ...uploadedUrls].slice(0, 2);
        return { ...prev, videoUrls: combined };
      });
      showToast(`${uploadedUrls.length} video(s) uploaded`);
    } catch (err: any) {
      showToast(err.message || 'Video upload failed', 'error');
    }
  };

  const handleRemoveVideo = (index: number) => {
    setListingForm((prev) => {
      const nextVideos = prev.videoUrls.filter((_, idx) => idx !== index);
      return { ...prev, videoUrls: nextVideos };
    });
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

  const [priceAssistLoading, setPriceAssistLoading] = useState(false);

  const handlePriceAssist = async () => {
    if (!requireAuth()) return;
    if (!listingForm.make || !listingForm.model || !listingForm.year) {
      showToast('Add make, model, and year first', 'info');
      return;
    }
    setPriceAssistLoading(true);
    showToast('Calculating fair price...', 'info');
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
        showToast(`Price estimated: ${response.currency} ${Math.round(response.estimate).toLocaleString()}`, 'success');
      } else {
        const errorMessage = (response as { error?: string }).error;
        showToast(errorMessage || 'Unable to generate estimate', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Unable to generate estimate', 'error');
    } finally {
      setPriceAssistLoading(false);
    }
  };

  const handleListingSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requireAuth()) return;
    
    // Validate required fields
    const errors: string[] = [];
    if (!listingForm.make.trim()) errors.push('Make is required');
    if (!listingForm.model.trim()) errors.push('Model is required');
    if (!listingForm.year.trim()) errors.push('Year is required');
    const yearNum = Number(listingForm.year);
    if (listingForm.year && (yearNum < 1900 || yearNum > new Date().getFullYear() + 2)) {
      errors.push('Year must be between 1900 and ' + (new Date().getFullYear() + 2));
    }
    if (!listingForm.price.trim()) errors.push('Price is required');
    const priceNum = Number(listingForm.price);
    if (listingForm.price && (priceNum < 0 || isNaN(priceNum))) {
      errors.push('Price must be a valid positive number');
    }
    
    if (errors.length > 0) {
      showToast(errors.join('. '), 'error');
      return;
    }
    
    setIsSubmittingListing(true);
    try {
      const cleanedGallery = listingForm.galleryImages.filter((url) => Boolean(url?.trim()));
      const normalizedGallery = cleanedGallery.length ? cleanedGallery : listingForm.image ? [listingForm.image] : [];
      const cleanedVideos = listingForm.videoUrls.filter((url) => Boolean(url?.trim()));
      const mediaGalleryPayload = [
        ...normalizedGallery.map((url) => ({ type: 'image' as const, url })),
        ...cleanedVideos.map((url) => ({ type: 'video' as const, url })),
      ];
      const payload: Partial<Car> = {
        make: listingForm.make,
        model: listingForm.model,
        year: yearNum,
        price: priceNum,
        currency: listingForm.currency as CurrencyCode,
        odometerKm: listingForm.odometer ? Number(listingForm.odometer) : undefined,
        image: listingForm.image || normalizedGallery[0],
        galleryImages: normalizedGallery,
        mediaGallery: mediaGalleryPayload,
        videoUrl: cleanedVideos[0] || undefined,
        description: listingForm.description,
        specs: {
          bodyStyle: listingForm.bodyStyle,
          horsepower: listingForm.horsepower ? Number(listingForm.horsepower) : undefined,
          engine: listingForm.engine,
          fuelEconomy: listingForm.fuelEconomy,
        },
        // New fields
        category: listingForm.category as any || 'car',
        condition: listingForm.condition as any || 'used',
        exteriorColor: listingForm.exteriorColor || undefined,
        interiorColor: listingForm.interiorColor || undefined,
        transmission: listingForm.transmission as any || undefined,
        fuelType: listingForm.fuelType as any || undefined,
        regionalSpec: listingForm.regionalSpec as any || undefined,
        paymentType: listingForm.paymentType as any || 'cash',
        city: listingForm.city || undefined,
        neighborhood: listingForm.neighborhood || undefined,
        trim: listingForm.trim || undefined,
      };
      const response = await createListing(payload, token);
      if (response.success) {
        showToast('🎉 Listing created successfully');
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
          videoUrls: [],
          description: '',
          category: 'car',
          condition: 'used',
          exteriorColor: '',
          interiorColor: '',
          transmission: '',
          fuelType: '',
          regionalSpec: '',
          paymentType: 'cash',
          city: '',
          neighborhood: '',
          trim: '',
        });
        setPriceEstimate(null);
        setVisionSuggestion(null);
        const refresh = await fetchMyListings(token);
        if (refresh.success) setMyListings(refresh.cars || []);
        setCarsRefreshKey((k) => k + 1);
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
      setCarsRefreshKey((k) => k + 1);
      showToast('🗑️ Listing removed', 'info');
    } catch (err: any) {
      showToast(err.message || 'Unable to delete listing', 'error');
    }
  };

  const handleStartEditListing = (car: Car) => {
    setEditingListing(car);
    // Collect all videos from mediaGallery and videoUrl
    const mediaVideos = car.mediaGallery?.filter(m => m.type === 'video').map(m => m.url) || [];
    const allVideos = car.videoUrl ? [car.videoUrl, ...mediaVideos.filter(v => v !== car.videoUrl)] : mediaVideos;
    // Collect all images from galleryImages and mediaGallery
    const mediaImages = car.mediaGallery?.filter(m => m.type === 'image').map(m => m.url) || [];
    const allImages = [...(car.galleryImages || []), ...mediaImages.filter(img => !(car.galleryImages || []).includes(img))];
    
    setEditForm({
      make: car.make || '',
      model: car.model || '',
      year: car.year?.toString() || '',
      price: car.price?.toString() || '',
      currency: car.currency || 'JOD',
      bodyStyle: car.specs?.bodyStyle || '',
      horsepower: car.specs?.horsepower?.toString() || '',
      engine: car.specs?.engine || '',
      fuelEconomy: car.specs?.fuelEconomy || '',
      odometer: car.odometerKm?.toString() || '',
      image: car.image || '',
      galleryImages: allImages,
      videoUrls: allVideos,
      description: car.description || '',
      category: car.category || 'car',
      condition: car.condition || 'used',
      exteriorColor: car.exteriorColor || '',
      interiorColor: car.interiorColor || '',
      transmission: car.transmission || '',
      fuelType: car.fuelType || '',
      regionalSpec: car.regionalSpec || '',
      paymentType: car.paymentType || 'cash',
      city: car.city || '',
      neighborhood: car.neighborhood || '',
      trim: car.trim || '',
    });
  };

  const handleEditFormInput = (field: keyof ListingFormState, value: string | string[]) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditGalleryUpload = async (fileList: FileList | null) => {
    if (!requireAuth() || !fileList || fileList.length === 0) return;
    try {
      const remainingSlots = 12 - editForm.galleryImages.length;
      if (remainingSlots <= 0) {
        showToast('Maximum 12 images allowed', 'info');
        return;
      }
      const uploads = Array.from(fileList).slice(0, remainingSlots);
      const uploadedUrls: string[] = [];
      for (const file of uploads) {
        const url = await uploadImageAsset(file);
        uploadedUrls.push(url);
      }
      if (!uploadedUrls.length) return;
      setEditForm((prev) => {
        const combined = [...prev.galleryImages, ...uploadedUrls].slice(0, 12);
        const primaryImage = prev.image || combined[0] || '';
        return { ...prev, galleryImages: combined, image: primaryImage };
      });
      showToast(`${uploadedUrls.length} image(s) uploaded`);
    } catch (err: any) {
      showToast(err.message || 'Gallery upload failed', 'error');
    }
  };

  const handleEditVideoUpload = async (fileList: FileList | null) => {
    if (!requireAuth() || !fileList || fileList.length === 0) return;
    try {
      const remainingSlots = 2 - editForm.videoUrls.length;
      if (remainingSlots <= 0) {
        showToast('Maximum 2 videos allowed', 'info');
        return;
      }
      const uploads = Array.from(fileList).slice(0, remainingSlots);
      const uploadedUrls: string[] = [];
      for (const file of uploads) {
        const url = await uploadVideoAsset(file);
        uploadedUrls.push(url);
      }
      if (!uploadedUrls.length) return;
      setEditForm((prev) => {
        const combined = [...prev.videoUrls, ...uploadedUrls].slice(0, 2);
        return { ...prev, videoUrls: combined };
      });
      showToast(`${uploadedUrls.length} video(s) uploaded`);
    } catch (err: any) {
      showToast(err.message || 'Video upload failed', 'error');
    }
  };

  const handleRemoveEditGalleryImage = (index: number) => {
    setEditForm((prev) => {
      const target = prev.galleryImages[index];
      const nextGallery = prev.galleryImages.filter((_, idx) => idx !== index);
      let nextImage = prev.image;
      if (nextImage === target) {
        nextImage = nextGallery[0] || '';
      }
      return { ...prev, galleryImages: nextGallery, image: nextImage };
    });
  };

  const handleRemoveEditVideo = (index: number) => {
    setEditForm((prev) => {
      const nextVideos = prev.videoUrls.filter((_, idx) => idx !== index);
      return { ...prev, videoUrls: nextVideos };
    });
  };

  const handleSaveEditListing = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requireAuth() || !editingListing) return;
    setIsSubmittingListing(true);
    try {
      const cleanedGallery = editForm.galleryImages.filter((url) => Boolean(url?.trim()));
      const normalizedGallery = cleanedGallery.length ? cleanedGallery : editForm.image ? [editForm.image] : [];
      const cleanedVideos = editForm.videoUrls.filter((url) => Boolean(url?.trim()));
      const mediaGalleryPayload = [
        ...normalizedGallery.map((url) => ({ type: 'image' as const, url })),
        ...cleanedVideos.map((url) => ({ type: 'video' as const, url })),
      ];
      const payload: Partial<Car> = {
        make: editForm.make,
        model: editForm.model,
        year: editForm.year ? Number(editForm.year) : undefined,
        price: editForm.price ? Number(editForm.price) : undefined,
        currency: editForm.currency as CurrencyCode,
        odometerKm: editForm.odometer ? Number(editForm.odometer) : undefined,
        image: editForm.image || normalizedGallery[0],
        galleryImages: normalizedGallery,
        mediaGallery: mediaGalleryPayload,
        videoUrl: cleanedVideos[0] || undefined,
        description: editForm.description,
        specs: {
          bodyStyle: editForm.bodyStyle,
          horsepower: editForm.horsepower ? Number(editForm.horsepower) : undefined,
          engine: editForm.engine,
          fuelEconomy: editForm.fuelEconomy,
        },
      };
      const response = await updateListing(editingListing.id, payload, token);
      if (response.success) {
        showToast('✅ Listing updated successfully');
        setEditingListing(null);
        const refresh = await fetchMyListings(token);
        if (refresh.success) setMyListings(refresh.cars || []);
        setCarsRefreshKey((k) => k + 1);
      } else {
        showToast(response.error || 'Could not update listing', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Could not update listing', 'error');
    } finally {
      setIsSubmittingListing(false);
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
      console.log('Semantic search response:', response);
      if (response.success) {
        const results = response.results?.map((entry) => entry.car) || [];
        console.log('Parsed results:', results);
        setSemanticResults(results);
        if (results.length === 0) {
          showToast('No matching cars found', 'info');
        }
      } else {
        showToast('Search returned no results', 'info');
      }
    } catch (err: any) {
      console.error('Semantic search error:', err);
      showToast(err?.message || 'Semantic search failed', 'error');
    } finally {
      setSemanticLoading(false);
    }
  };

  const handleCreateListingFromChat = async (listingData: any, messageIndex: number) => {
    if (!requireAuth()) return;
    
    try {
        showToast('Processing listing...', 'info');
        
        // Look for image attachment in history
        let imageUrl = '';
        const previousMessages = chatMessages.slice(0, messageIndex + 1).reverse();
        const lastUserMsgWithImage = previousMessages.find(m => m.role === 'user' && m.attachmentUrl);
        
        if (lastUserMsgWithImage && lastUserMsgWithImage.attachmentUrl) {
             try {
                 const response = await fetch(lastUserMsgWithImage.attachmentUrl);
                 const blob = await response.blob();
                 const file = new File([blob], "listing-image.jpg", { type: blob.type });
                 const uploadRes = await uploadListingImage(file, token);
                 if (uploadRes.success) {
                     imageUrl = uploadRes.url;
                 }
             } catch (e) {
                 console.warn("Failed to upload image from chat:", e);
             }
        }
        
        // Validate and sanitize listing data
        const currentYear = new Date().getFullYear();
        let year = Number(listingData.year);
        if (!year || year < 1900 || year > currentYear + 2) {
            year = currentYear; // Default to current year if invalid
        }
        
        let price = Number(listingData.price);
        if (!price || price < 0) {
            price = 0; // Default to 0 if invalid (user can edit later)
        }
        
        const payload: Partial<Car> = {
            make: listingData.make || 'Unknown',
            model: listingData.model || 'Unknown',
            year: year,
            price: price,
            currency: listingData.currency || 'JOD',
            description: listingData.description || '',
            image: imageUrl, 
            specs: listingData.specs || {}
        };
        
        await createListing(payload, token);
        showToast('Listing created successfully!');
        
        // Refresh my listings
        const data = await fetchMyListings(token);
        if (data.success) {
            setMyListings(data.cars);
        }
        setActivePage('myListings');
        
    } catch (error: any) {
        console.error('Failed to create listing from chat', error);
        showToast(error.message || 'Failed to create listing', 'error');
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
      attachmentUrl: chatAttachment?.base64 || undefined,
    };
    const updatedMessages = [...chatMessages, userMessage].slice(-CHAT_HISTORY_LIMIT);
    persistChatSession(sessionId, updatedMessages);
    setChatInput('');
    const attachmentData = chatAttachment;
    setChatAttachment(null);
    setChatBusy(true);

    const controller = new AbortController();
    setChatAbortController(controller);

    try {
      const historyPayload: Array<{ role: 'user' | 'bot'; text: string }> = updatedMessages
        .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
        .map((msg) => ({ role: msg.role === 'user' ? 'user' : 'bot', text: msg.text }));

      const response = await handleChatbotMessage(
        {
          query: message,
          history: historyPayload,
          imageBase64: attachmentData?.base64,
          imageMimeType: attachmentData?.mime,
        },
        token,
        controller.signal
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
      if (err.name === 'AbortError') {
        showToast('Response stopped', 'info');
      } else {
        showToast(err.message || 'Assistant failed to respond', 'error');
      }
    } finally {
      setChatBusy(false);
      setChatAbortController(null);
    }
  };

  const handleChatStop = () => {
    if (chatAbortController) {
      chatAbortController.abort();
      setChatAbortController(null);
      setChatBusy(false);
    }
  };

  const renderToast = () => {
    if (!toast) return null;
    const base = toast.type === 'error' ? 'bg-red-500/90' : toast.type === 'info' ? 'bg-blue-500/90' : 'bg-emerald-500/90';
    return (
      <div className={`fixed top-6 right-6 z-[60] rounded-xl px-4 py-3 text-white shadow-xl animate-slide-in ${base}`}>
        <div className="flex items-center gap-2">
          {toast.type === 'success' && <span>✓</span>}
          {toast.type === 'error' && <span>✕</span>}
          {toast.type === 'info' && <span>ℹ</span>}
          {toast.message}
        </div>
      </div>
    );
  };

  const filteredCars = useMemo(() => {
    return cars.filter((car) => {
      if (filters.make !== 'all' && car.make !== filters.make) return false;
      if (debouncedSearch) {
        const haystack = `${car.make} ${car.model} ${car.year}`.toLowerCase();
        if (!haystack.includes(debouncedSearch.toLowerCase())) return false;
      }
      return true;
    });
  }, [cars, filters.make, debouncedSearch]);

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
  }, [filters.make, debouncedSearch, filters.sort]);

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
      className={`flex flex-col rounded-3xl border p-4 shadow-lg transition hover:-translate-y-1 hover:shadow-xl ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white/90'}`}
    >
      <div className={`relative overflow-hidden rounded-2xl ${resolvedTheme === 'dark' ? 'bg-slate-700' : 'bg-slate-100'}`}>
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
          {favorites.includes(car.id) ? copy.listingFavorited : copy.listingFavorite}
        </button>
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h3 className={`text-lg font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{car.make} {car.model}</h3>
          <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{car.year || 'Year TBD'}</p>
        </div>
        <div className="text-right text-2xl font-bold text-emerald-500">
          {formatPrice(car.price, car.currency)}
        </div>
      </div>
      {car.specs?.bodyStyle && (
        <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>{car.specs.bodyStyle}</p>
      )}
      <div className={`mt-4 flex flex-wrap gap-2 text-xs ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
        {car.rating ? <span>⭐ {car.rating.toFixed(1)}</span> : null}
        {car.reviews ? <span>{car.reviews} reviews</span> : null}
        {car.galleryImages?.length ? <span>{car.galleryImages.length} photos</span> : null}
        {car.videoUrl ? <span>🎥 Video</span> : null}
        {car.odometerKm ? <span>{car.odometerKm.toLocaleString()} km</span> : null}
      </div>
      {car.description && (
        <p className={`mt-3 line-clamp-3 text-sm ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>{car.description}</p>
      )}
      <button
        className={`mt-4 w-full rounded-xl py-2 text-sm font-semibold text-white ${resolvedTheme === 'dark' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-sky-600 hover:bg-sky-700'}`}
        onClick={() => handleOpenCarDetails(car.id)}
      >
        {copy.listingViewDetails}
      </button>
    </div>
  );

  const renderDealerCard = (dealer: DealerSummary) => (
    <div key={dealer.id} className={`flex flex-col rounded-3xl border p-4 shadow hover:shadow-lg ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white/90'}`}>
      <div className={`h-40 overflow-hidden rounded-2xl ${resolvedTheme === 'dark' ? 'bg-slate-700' : 'bg-slate-100'}`}>
        <img
          src={dealer.hero_image || '/placeholder-car.svg'}
          alt={dealer.name}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h3 className={`text-lg font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{dealer.name}</h3>
          <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{dealer.total_listings} {copy.dealerMetaListings}</p>
        </div>
        <div className={`text-right text-sm ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
          <p>{copy.dealerMetaAverage}</p>
          <p className="text-base font-semibold text-emerald-500">
            {dealer.average_price ? formatPrice(dealer.average_price, 'JOD') : '—'}
          </p>
        </div>
      </div>
      {dealer.top_makes?.length ? (
        <div className={`mt-3 text-xs ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
          <p className={`font-semibold ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>{copy.dealerMetaTopMakes}</p>
          <p>{dealer.top_makes.map((entry) => entry.make).slice(0, 3).join(', ')}</p>
        </div>
      ) : null}
      <button
        className={`mt-4 w-full rounded-xl py-2 text-sm font-semibold text-white ${resolvedTheme === 'dark' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-900/90 hover:bg-slate-800'}`}
        onClick={() => handleOpenDealer(dealer.id)}
      >
        {copy.dealersVisit}
      </button>
    </div>
  );

  // Google Sign-In handler
  const handleGoogleSignIn = useCallback(async () => {
    if (!googleClientId || typeof window === 'undefined') return;
    
    // Load Google Identity Services script if not already loaded
    if (!window.google?.accounts?.id) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
      
      await new Promise<void>((resolve) => {
        script.onload = () => resolve();
      });
    }
    
    // Initialize and prompt (with null check)
    if (!window.google?.accounts?.id) {
      showToast('Failed to load Google Sign-In', 'error');
      return;
    }
    
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (response: { credential: string }) => {
        const success = await loginWithGoogle(response.credential);
        if (success) {
          showToast('Signed in with Google!');
          setAuthMode('login');
        } else {
          showToast('Google sign-in failed', 'error');
        }
      },
    });
    
    window.google.accounts.id.prompt();
  }, [googleClientId, loginWithGoogle, showToast]);

  const renderAuthPanel = () => {
    // Password Reset Form
    if (authMode === 'reset' && resetToken) {
      return (
        <div className="mx-auto max-w-md">
          <div className={`rounded-3xl border p-6 shadow-sm ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
            <h3 className={`text-xl font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Reset Your Password</h3>
            <p className={`mt-2 text-sm ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Enter your new password below.</p>
            {authError && (
              <p className={`mt-3 rounded-2xl px-4 py-2 text-sm font-semibold ${resolvedTheme === 'dark' ? 'bg-rose-900/30 text-rose-400' : 'bg-rose-50 text-rose-600'}`}>{authError}</p>
            )}
            <form
              className="mt-4 space-y-4"
              onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const password = String(formData.get('new-password'));
                const confirmPassword = String(formData.get('confirm-password'));
                
                if (password !== confirmPassword) {
                  showToast('Passwords do not match', 'error');
                  return;
                }
                
                clearError();
                const result = await resetUserPassword(resetToken, password);
                if (result.success) {
                  showToast('Password reset successfully! Please sign in.');
                  setResetToken(null);
                  setAuthMode('login');
                } else {
                  showToast(result.message || 'Failed to reset password', 'error');
                }
              }}
            >
              <input name="new-password" type="password" placeholder="New Password" className={`w-full ${inputFieldClass}`} required minLength={8} />
              <input name="confirm-password" type="password" placeholder="Confirm Password" className={`w-full ${inputFieldClass}`} required minLength={8} />
              <button className="w-full rounded-2xl bg-sky-600 py-3 font-semibold text-white hover:bg-sky-700">Reset Password</button>
            </form>
            <button 
              onClick={() => { setAuthMode('login'); setResetToken(null); }} 
              className={`mt-4 text-sm ${resolvedTheme === 'dark' ? 'text-sky-400 hover:text-sky-300' : 'text-sky-600 hover:text-sky-700'}`}
            >
              ← Back to Sign In
            </button>
          </div>
        </div>
      );
    }
    
    // Forgot Password Form
    if (authMode === 'forgot') {
      return (
        <div className="mx-auto max-w-md">
          <div className={`rounded-3xl border p-6 shadow-sm ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
            <h3 className={`text-xl font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Forgot Password?</h3>
            <p className={`mt-2 text-sm ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Enter your email and we&apos;ll send you a reset link.</p>
            {authError && (
              <p className={`mt-3 rounded-2xl px-4 py-2 text-sm font-semibold ${resolvedTheme === 'dark' ? 'bg-rose-900/30 text-rose-400' : 'bg-rose-50 text-rose-600'}`}>{authError}</p>
            )}
            <form
              className="mt-4 space-y-4"
              onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const email = String(formData.get('reset-email'));
                clearError();
                const result = await requestPasswordReset(email);
                if (result.success) {
                  showToast('If an account exists, a reset link has been sent to your email.');
                  setAuthMode('login');
                } else {
                  showToast(result.message || 'Failed to send reset email', 'error');
                }
              }}
            >
              <input name="reset-email" type="email" placeholder={copy.authEmail} className={`w-full ${inputFieldClass}`} required />
              <button className="w-full rounded-2xl bg-sky-600 py-3 font-semibold text-white hover:bg-sky-700">Send Reset Link</button>
            </form>
            <button 
              onClick={() => setAuthMode('login')} 
              className={`mt-4 text-sm ${resolvedTheme === 'dark' ? 'text-sky-400 hover:text-sky-300' : 'text-sky-600 hover:text-sky-700'}`}
            >
              ← Back to Sign In
            </button>
          </div>
        </div>
      );
    }
    
    // Login / Signup Forms
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <div className={`rounded-3xl border p-6 shadow-sm ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
          <h3 className={`text-xl font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{copy.authSignIn}</h3>
          {authError && (
            <p className={`mt-3 rounded-2xl px-4 py-2 text-sm font-semibold ${resolvedTheme === 'dark' ? 'bg-rose-900/30 text-rose-400' : 'bg-rose-50 text-rose-600'}`}>{authError}</p>
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
                showToast(`${copy.authWelcomeBack}, ${username}!`);
              } else {
                showToast('Unable to sign in. Please check your details.', 'error');
              }
            }}
          >
            <input name="login-username" placeholder={copy.authUsername} className={`w-full ${inputFieldClass}`} required />
            <input name="login-password" type="password" placeholder={copy.authPassword} className={`w-full ${inputFieldClass}`} required />
            <button className="w-full rounded-2xl bg-sky-600 py-3 font-semibold text-white hover:bg-sky-700">{copy.authSignIn}</button>
          </form>
          
          <button 
            onClick={() => setAuthMode('forgot')} 
            className={`mt-3 text-sm ${resolvedTheme === 'dark' ? 'text-sky-400 hover:text-sky-300' : 'text-sky-600 hover:text-sky-700'}`}
          >
            Forgot password?
          </button>
          
          {/* Google Sign-In */}
          {googleClientId && (
            <div className="mt-4">
              <div className={`flex items-center gap-3 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                <div className="h-px flex-1 bg-current opacity-20"></div>
                <span className="text-xs uppercase">or</span>
                <div className="h-px flex-1 bg-current opacity-20"></div>
              </div>
              <button
                onClick={handleGoogleSignIn}
                className={`mt-3 flex w-full items-center justify-center gap-3 rounded-2xl border py-3 font-medium transition-colors ${
                  resolvedTheme === 'dark' 
                    ? 'border-slate-600 bg-slate-700 text-white hover:bg-slate-600' 
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
            </div>
          )}
        </div>
        <div className={`rounded-3xl border p-6 shadow-sm ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
          <h3 className={`text-xl font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{copy.authCreateAccount}</h3>
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
            <input name="signup-username" placeholder={copy.authUsername} className={`w-full ${inputFieldClass}`} required />
            <input name="signup-email" type="email" placeholder={copy.authEmail} className={`w-full ${inputFieldClass}`} required />
            <input name="signup-password" type="password" placeholder={copy.authPassword} className={`w-full ${inputFieldClass}`} required />
            <button className="w-full rounded-2xl bg-emerald-500 py-3 font-semibold text-white hover:bg-emerald-600">{copy.authSignUp}</button>
          </form>
          
          {/* Google Sign-Up */}
          {googleClientId && (
            <div className="mt-4">
              <div className={`flex items-center gap-3 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                <div className="h-px flex-1 bg-current opacity-20"></div>
                <span className="text-xs uppercase">or</span>
                <div className="h-px flex-1 bg-current opacity-20"></div>
              </div>
              <button
                onClick={handleGoogleSignIn}
                className={`mt-3 flex w-full items-center justify-center gap-3 rounded-2xl border py-3 font-medium transition-colors ${
                  resolvedTheme === 'dark' 
                    ? 'border-slate-600 bg-slate-700 text-white hover:bg-slate-600' 
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign up with Google
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderProfilePanel = () => {
    if (!user) {
      return (
        <div className="space-y-6">
          <p className={resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-600'}>{copy.profileSignInPrompt}</p>
          {renderAuthPanel()}
        </div>
      );
    }
    return (
      <div className="grid gap-4 md:gap-6 md:grid-cols-2">
        <div className={`rounded-2xl md:rounded-3xl border p-4 md:p-6 shadow-sm ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
          <h3 className={`text-lg md:text-xl font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{copy.profileTitle}</h3>
          <div className="mt-3 space-y-2">
            <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}><span className="font-medium">{copy.authUsername}:</span> {user.username}</p>
            <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}><span className="font-medium">{copy.authEmail}:</span> {user.email}</p>
            {user.phone && <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}><span className="font-medium">📱 Phone:</span> {user.phone}</p>}
          </div>
          <button className={`mt-4 rounded-xl md:rounded-2xl border px-4 py-2 text-xs md:text-sm font-semibold ${resolvedTheme === 'dark' ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-slate-200 text-slate-900 hover:bg-slate-50'}`} onClick={() => refreshProfile()}>
            {copy.profileRefresh}
          </button>
        </div>
        <div className={`rounded-2xl md:rounded-3xl border p-4 md:p-6 shadow-sm ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
          <h3 className={`text-lg md:text-xl font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{copy.profileUpdate}</h3>
          <form
            className="mt-3 md:mt-4 space-y-2 md:space-y-3"
            onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const formData = new FormData(formElement);
              const username = formData.get('profile-username')?.toString();
              const email = formData.get('profile-email')?.toString();
              const phone = formData.get('profile-phone')?.toString();
              const current_password = formData.get('profile-current-password')?.toString();
              const password = formData.get('profile-password')?.toString();
              const result = await updateMyProfile({ username, email, phone, current_password, password });
              if (result) {
                showToast('✅ Profile updated successfully');
                formElement.reset();
              }
            }}
          >
            <input name="profile-username" placeholder={copy.authUsername} defaultValue={user.username} className={`w-full text-sm ${inputFieldClass}`} />
            <input name="profile-email" type="email" placeholder={copy.authEmail} defaultValue={user.email} className={`w-full text-sm ${inputFieldClass}`} />
            <input name="profile-phone" type="tel" placeholder="Phone number (e.g. +962 7X XXX XXXX)" defaultValue={user.phone || ''} className={`w-full text-sm ${inputFieldClass}`} />
            <input name="profile-current-password" type="password" placeholder={copy.authCurrentPassword} className={`w-full text-sm ${inputFieldClass}`} />
            <input name="profile-password" type="password" placeholder={copy.authNewPassword} className={`w-full text-sm ${inputFieldClass}`} />
            <button className="w-full rounded-xl md:rounded-2xl bg-emerald-500 py-2.5 md:py-3 text-sm font-semibold text-white hover:bg-emerald-600">{copy.profileSaveChanges}</button>
          </form>
          <button className={`mt-3 md:mt-4 w-full rounded-xl md:rounded-2xl border py-2 text-sm font-semibold ${resolvedTheme === 'dark' ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-slate-200 text-slate-900 hover:bg-slate-50'}`} onClick={() => logout()}>
            {copy.authSignOut}
          </button>
        </div>
      </div>
    );
  };

  const renderChatbot = () => (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-180px)] gap-3 md:gap-4">
      {/* Mobile Header with New Chat & Toggle */}
      <div className="flex lg:hidden items-center gap-2 mb-2">
        <button
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm"
          onClick={() => startNewChat()}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {copy.chatNewChat}
        </button>
        <button
          onClick={() => setMobileChatHistoryOpen(!mobileChatHistoryOpen)}
          className={`px-3 py-2 rounded-xl border text-xs font-semibold ${mobileChatHistoryOpen ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
        >
          📜 History ({chatSessions.length})
        </button>
      </div>
      
      {/* Mobile Chat History Dropdown */}
      {mobileChatHistoryOpen && (
        <div className="lg:hidden rounded-xl border border-slate-200 bg-white p-2 mb-2 max-h-48 overflow-y-auto">
          <div className="space-y-1">
            {chatSessions.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-2">No chat history yet</p>
            ) : (
              chatSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => { setActiveSessionId(session.id); setMobileChatHistoryOpen(false); }}
                  className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${
                    session.id === activeSessionId ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <svg className="h-3 w-3 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <span className="truncate flex-1">{session.title}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteChatSession(session.id); }}
                    className="text-slate-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      
      {/* Desktop Sidebar */}
      <div className="hidden w-72 flex-shrink-0 flex-col rounded-2xl border border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-100 p-4">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-blue-600 hover:to-indigo-700"
            onClick={() => startNewChat()}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {copy.chatNewChat}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-slate-400">{copy.chatRecent}</p>
          <div className="space-y-1">
            {chatSessions.map((session) => (
              <div
                key={session.id}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  session.id === activeSessionId
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <button
                  onClick={() => setActiveSessionId(session.id)}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <svg className="h-4 w-4 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{session.title}</span>
                    <span className="block truncate text-xs text-slate-400">{new Date(session.updatedAt).toLocaleDateString()}</span>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChatSession(session.id);
                  }}
                  className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-red-100 hover:text-red-600 group-hover:opacity-100"
                  title="Delete chat"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-slate-100 p-4">
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white">
        {/* Chat Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600">
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">{copy.chatAssistantName}</h2>
              <p className="text-xs text-slate-500">{copy.chatGeneralAssistant}</p>
            </div>
          </div>
          {chatBusy && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-blue-500" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-blue-500" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-blue-500" style={{ animationDelay: '300ms' }} />
              </div>
              <span>{copy.chatThinking}</span>
            </div>
          )}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {chatMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-indigo-100">
                <svg className="h-10 w-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="mb-2 text-xl font-semibold text-slate-900">{copy.chatWelcome}</h3>
              <p className="max-w-md text-slate-500">{copy.chatWelcomeDesc}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {[copy.chatSuggestion1, copy.chatSuggestion2, copy.chatSuggestion3].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setChatInput(suggestion)}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {chatMessages.map((msg, idx) => (
                <div
                  key={msg.id}
                  className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                    msg.role === 'user' ? 'bg-slate-700' : 'bg-gradient-to-br from-blue-500 to-indigo-600'
                  }`}>
                    {msg.role === 'user' ? (
                      <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    )}
                  </div>
                  <div className={`max-w-[80%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                    <div
                      className={`inline-block rounded-2xl px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {msg.attachmentUrl && (
                        <div className="mb-2 overflow-hidden rounded-lg">
                          <img src={msg.attachmentUrl} alt="Attached" className="max-h-48 max-w-full rounded-lg object-cover" />
                        </div>
                      )}
                      <p className="whitespace-pre-line text-sm leading-relaxed">{msg.text}</p>
                    </div>
                    {msg.listingData && (
                      <div className="mt-2 rounded-xl border border-slate-200 bg-white p-4 text-left text-sm shadow-sm">
                        <p className="mb-2 font-semibold text-slate-900">{copy.chatProposedListing}</p>
                        <div className="space-y-1 text-slate-600">
                          {Object.entries(msg.listingData).map(([key, value]) =>
                            value && key !== 'specs' ? (
                              <p key={key}>
                                <span className="font-medium">{camelToTitle(key)}:</span> {String(value)}
                              </p>
                            ) : null
                          )}
                        </div>
                        <button
                          onClick={() => handleCreateListingFromChat(msg.listingData, idx)}
                          className="mt-3 w-full rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Create Listing Now
                        </button>
                      </div>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-slate-100 p-4">
          <div className="mx-auto max-w-3xl">
            {chatAttachment && (
              <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 overflow-hidden rounded-lg bg-slate-200">
                    <img src={chatAttachment.preview} alt="Attachment" className="h-full w-full object-cover" />
                  </div>
                  <span className="text-sm text-slate-600">{copy.chatImageAttached}</span>
                </div>
                <button onClick={() => setChatAttachment(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-500">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            <div className="relative flex items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400">
              <label className="flex cursor-pointer items-center justify-center rounded-xl p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <input
                  name="chat-attachment"
                  id="chat-attachment"
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
              <textarea
                name="chat-input"
                id="chat-input"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (!chatBusy) handleChatSubmit();
                  }
                }}
                placeholder={copy.chatPlaceholder}
                rows={1}
                className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                style={{ height: 'auto', overflow: 'hidden' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                }}
              />
              {chatBusy ? (
                <button
                  onClick={handleChatStop}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500 text-white shadow-sm transition hover:bg-red-600"
                  title="Stop generating"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleChatSubmit}
                  disabled={!chatInput.trim() && !chatAttachment}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  title="Send message"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              )}
            </div>
            <p className="mt-2 text-center text-xs text-slate-400">
              {copy.chatSendHint}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAdminPanel = () => {
    // Check if user is admin
    if (!user) {
      return (
        <div className={`rounded-3xl border p-8 text-center ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-white'}`}>
          <div className="text-5xl mb-4">🔐</div>
          <h2 className={`text-2xl font-bold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Admin Access Required</h2>
          <p className={`mt-2 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Please sign in with an admin account to access this panel.</p>
        </div>
      );
    }

    // For development: Show a note about admin access (in production, check user.is_admin)
    const isAdmin = user.is_admin || user.email === 'admin@intelliwheels.co' || user.username === 'admin';

    if (!isAdmin) {
      return (
        <div className={`rounded-3xl border p-8 text-center ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-white'}`}>
          <div className="text-5xl mb-4">🚫</div>
          <h2 className={`text-2xl font-bold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Access Denied</h2>
          <p className={`mt-2 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>You don&apos;t have admin privileges. Contact the system administrator.</p>
          <p className={`mt-4 text-sm ${resolvedTheme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
            <strong>Dev tip:</strong> Create a user with username &quot;admin&quot; or email &quot;admin@intelliwheels.co&quot; to access this panel.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className={`text-3xl font-bold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
              {language === 'ar' ? 'لوحة الإدارة' : 'Admin Panel'}
            </h1>
            <p className={`mt-1 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
              {language === 'ar' ? 'إدارة طلبات الوكلاء' : 'Manage dealer applications'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'pending', 'approved', 'rejected'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setAdminFilter(filter)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  adminFilter === filter
                    ? filter === 'pending' ? 'bg-amber-500 text-white'
                    : filter === 'approved' ? 'bg-emerald-500 text-white'
                    : filter === 'rejected' ? 'bg-red-500 text-white'
                    : 'bg-indigo-500 text-white'
                    : resolvedTheme === 'dark'
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Applications List */}
        {adminLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
          </div>
        ) : dealerApplications.length === 0 ? (
          <div className={`rounded-3xl border p-8 text-center ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-white'}`}>
            <div className="text-5xl mb-4">📭</div>
            <h3 className={`text-xl font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
              {language === 'ar' ? 'لا توجد طلبات' : 'No Applications'}
            </h3>
            <p className={`mt-2 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
              {adminFilter === 'all'
                ? (language === 'ar' ? 'لم يتقدم أي وكيل بطلب بعد' : 'No dealer applications have been submitted yet')
                : (language === 'ar' ? `لا توجد طلبات ${adminFilter}` : `No ${adminFilter} applications found`)}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {dealerApplications.map((app) => (
              <div
                key={app.id}
                className={`rounded-2xl border p-5 transition hover:shadow-lg ${
                  resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className={`text-lg font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                      {app.name}
                    </h3>
                    <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                      {app.city}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    app.status === 'pending' ? 'bg-amber-100 text-amber-700'
                    : app.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-100 text-red-700'
                  }`}>
                    {app.status}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span>📧</span>
                    <a href={`mailto:${app.email}`} className="text-indigo-500 hover:underline">{app.email}</a>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>📞</span>
                    <a href={`tel:${app.phone}`} className="text-indigo-500 hover:underline">{app.phone}</a>
                  </div>
                  {app.website && (
                    <div className="flex items-center gap-2">
                      <span>🌐</span>
                      <a href={app.website} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline truncate">
                        {app.website}
                      </a>
                    </div>
                  )}
                  {app.description && (
                    <p className={`mt-2 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                      {app.description.length > 100 ? app.description.slice(0, 100) + '...' : app.description}
                    </p>
                  )}
                </div>

                <div className={`mt-4 pt-4 border-t ${resolvedTheme === 'dark' ? 'border-slate-700' : 'border-slate-100'}`}>
                  <p className={`text-xs ${resolvedTheme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                    Submitted: {new Date(app.created_at).toLocaleDateString()}
                  </p>
                </div>

                {app.status === 'pending' && (
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => {
                        setAdminActionModal({ type: 'approve', application: app });
                        setAdminNotes('');
                      }}
                      className="flex-1 rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => {
                        setAdminActionModal({ type: 'reject', application: app });
                        setAdminNotes('');
                        setAdminReason('');
                      }}
                      className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-semibold text-white transition hover:bg-red-600"
                    >
                      ✗ Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Approve/Reject Modal */}
        {adminActionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${resolvedTheme === 'dark' ? 'bg-slate-800' : 'bg-white'}`}>
              <h3 className={`text-xl font-bold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                {adminActionModal.type === 'approve' ? '✅ Approve Application' : '❌ Reject Application'}
              </h3>
              <p className={`mt-2 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                {adminActionModal.type === 'approve'
                  ? `Approve ${adminActionModal.application.name} as a dealer?`
                  : `Reject the application from ${adminActionModal.application.name}?`}
              </p>

              {adminActionModal.type === 'reject' && (
                <div className="mt-4">
                  <label className={`text-sm font-medium ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                    Reason for rejection <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={adminReason}
                    onChange={(e) => setAdminReason(e.target.value)}
                    className={`mt-1 w-full rounded-xl border px-4 py-2 ${
                      resolvedTheme === 'dark' ? 'border-slate-600 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-900'
                    }`}
                    placeholder="e.g., Incomplete documentation"
                  />
                </div>
              )}

              <div className="mt-4">
                <label className={`text-sm font-medium ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                  Admin notes (optional)
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  className={`mt-1 w-full rounded-xl border px-4 py-2 ${
                    resolvedTheme === 'dark' ? 'border-slate-600 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-900'
                  }`}
                  placeholder="Internal notes..."
                />
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setAdminActionModal(null)}
                  className={`flex-1 rounded-xl py-3 font-semibold ${
                    resolvedTheme === 'dark' ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (adminActionModal.type === 'approve') {
                      handleApproveApplication(adminActionModal.application);
                    } else {
                      if (!adminReason.trim()) {
                        showToast('Please provide a reason for rejection', 'error');
                        return;
                      }
                      handleRejectApplication(adminActionModal.application);
                    }
                  }}
                  className={`flex-1 rounded-xl py-3 font-semibold text-white ${
                    adminActionModal.type === 'approve' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'
                  }`}
                >
                  {adminActionModal.type === 'approve' ? 'Approve' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Email Configuration Notice */}
        <div className={`rounded-2xl border p-4 ${resolvedTheme === 'dark' ? 'border-amber-800/50 bg-amber-900/20' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex gap-3">
            <span className="text-2xl">📧</span>
            <div>
              <h4 className={`font-semibold ${resolvedTheme === 'dark' ? 'text-amber-300' : 'text-amber-800'}`}>
                {language === 'ar' ? 'إعداد البريد الإلكتروني' : 'Email Configuration'}
              </h4>
              <p className={`mt-1 text-sm ${resolvedTheme === 'dark' ? 'text-amber-400/80' : 'text-amber-700'}`}>
                {language === 'ar'
                  ? 'لتفعيل إرسال البريد الإلكتروني، قم بتعيين متغيرات البيئة التالية: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS'
                  : 'To enable email notifications, set these environment variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAnalytics = () => {
    if (!requireAuth()) return null;
    if (!analyticsData) {
      return <p className="text-slate-500">{copy.analyticsNoData}</p>;
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
            <StatCard label={copy.analyticsAvgPrice} value={formatPrice(analyticsData.summary.average_price, analyticsData.summary.currency)} />
            <StatCard label={copy.analyticsCheapest} value={formatPrice(analyticsData.summary.min_price, analyticsData.summary.currency)} />
            <StatCard label={copy.analyticsMostExpensive} value={formatPrice(analyticsData.summary.max_price, analyticsData.summary.currency)} />
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
      case 'home':
        return (
          <div className="space-y-16">
            {/* Hero Section */}
            <section className="relative overflow-hidden rounded-3xl">
              <div className={`absolute inset-0 ${resolvedTheme === 'dark' ? 'bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900' : 'bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800'}`}></div>
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}></div>
              <div className="relative px-8 py-20 text-center md:py-32">
                <div className="mx-auto max-w-4xl">
                  <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-400"></span>
                    Powered by AI
                  </div>
                  <h1 className="text-4xl font-bold text-white md:text-6xl lg:text-7xl">
                    {copy.heroTitle}
                  </h1>
                  <p className="mx-auto mt-6 max-w-2xl text-lg text-white/80 md:text-xl">
                    {copy.heroSubtitle}
                  </p>
                  <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                    <button
                      onClick={() => setActivePage('listings')}
                      className="group flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-lg font-semibold text-indigo-600 shadow-xl transition hover:bg-indigo-50 hover:shadow-2xl"
                    >
                      {copy.heroCta}
                      <svg className="h-5 w-5 transition group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setActivePage('chatbot')}
                      className="flex items-center gap-2 rounded-2xl border-2 border-white/30 bg-white/10 px-8 py-4 text-lg font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      {copy.heroSecondaryCta}
                    </button>
                  </div>
                </div>
                {/* Floating car images */}
                <div className="absolute -bottom-4 left-10 hidden h-32 w-48 rounded-2xl bg-white/10 backdrop-blur-sm lg:block" style={{ transform: 'rotate(-6deg)' }}>
                  <div className="flex h-full items-center justify-center text-6xl">🚗</div>
                </div>
                <div className="absolute -bottom-4 right-10 hidden h-32 w-48 rounded-2xl bg-white/10 backdrop-blur-sm lg:block" style={{ transform: 'rotate(6deg)' }}>
                  <div className="flex h-full items-center justify-center text-6xl">🏎️</div>
                </div>
              </div>
            </section>

            {/* Stats Section - Real numbers from database */}
            <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { 
                  value: platformStats?.active_listings ?? 0, 
                  label: copy.statsListings, 
                  icon: '🚗',
                  tooltip: language === 'ar' ? 'إجمالي السيارات المعروضة للبيع' : 'Total vehicles currently listed for sale'
                },
                { 
                  value: platformStats?.verified_dealers ?? 0, 
                  label: copy.statsDealers, 
                  icon: '🏪',
                  tooltip: language === 'ar' ? 'وكلاء معتمدون في شبكتنا الموثوقة' : 'Approved dealerships in our trusted network'
                },
                { 
                  value: platformStats?.registered_users ?? 0, 
                  label: copy.statsUsers, 
                  icon: '👥',
                  tooltip: language === 'ar' ? 'إجمالي الحسابات المسجلة' : 'Total registered accounts on IntelliWheels'
                },
                { 
                  value: platformStats?.ai_interactions ?? 0, 
                  label: copy.statsAiQueries, 
                  icon: '🤖',
                  tooltip: language === 'ar' ? 'استعلامات ذكية وتحليلات صور' : 'AI-powered searches, chats, and image analyses'
                },
              ].map((stat, idx) => (
                <div 
                  key={idx} 
                  className={`group relative rounded-2xl border p-6 text-center transition hover:shadow-lg ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-white'}`}
                  title={stat.tooltip}
                >
                  <div className="text-3xl">{stat.icon}</div>
                  <div className={`mt-2 text-3xl font-bold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                    {stat.value.toLocaleString()}
                  </div>
                  <div className={`text-sm ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{stat.label}</div>
                  {/* Tooltip on hover */}
                  <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 translate-y-full opacity-0 group-hover:opacity-100 transition-opacity z-10 px-3 py-2 text-xs rounded-lg whitespace-nowrap ${resolvedTheme === 'dark' ? 'bg-slate-700 text-slate-200' : 'bg-slate-800 text-white'}`}>
                    {stat.tooltip}
                  </div>
                </div>
              ))}
            </section>

            {/* Features Section */}
            <section>
              <div className="text-center">
                <h2 className={`text-3xl font-bold md:text-4xl ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  {copy.featuresTitle}
                </h2>
                <p className={`mx-auto mt-3 max-w-2xl text-lg ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                  {copy.featuresSubtitle}
                </p>
              </div>
              <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[
                  { icon: '🔍', title: copy.feature1Title, desc: copy.feature1Desc, color: 'from-blue-500 to-cyan-500' },
                  { icon: '💰', title: copy.feature2Title, desc: copy.feature2Desc, color: 'from-emerald-500 to-teal-500' },
                  { icon: '📸', title: copy.feature3Title, desc: copy.feature3Desc, color: 'from-purple-500 to-pink-500' },
                  { icon: '✅', title: copy.feature4Title, desc: copy.feature4Desc, color: 'from-amber-500 to-orange-500' },
                  { icon: '📊', title: copy.feature5Title, desc: copy.feature5Desc, color: 'from-indigo-500 to-purple-500' },
                  { icon: '💱', title: copy.feature6Title, desc: copy.feature6Desc, color: 'from-rose-500 to-red-500' },
                ].map((feature, idx) => (
                  <div key={idx} className={`group rounded-2xl border p-6 transition hover:-translate-y-1 hover:shadow-xl ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-white'}`}>
                    <div className={`flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} text-2xl shadow-lg`}>
                      {feature.icon}
                    </div>
                    <h3 className={`mt-4 text-xl font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                      {feature.title}
                    </h3>
                    <p className={`mt-2 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                      {feature.desc}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* How It Works Section */}
            <section className={`rounded-3xl p-8 md:p-12 ${resolvedTheme === 'dark' ? 'bg-slate-800/50' : 'bg-gradient-to-br from-slate-50 to-slate-100'}`}>
              <div className="text-center">
                <h2 className={`text-3xl font-bold md:text-4xl ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  {copy.howItWorksTitle}
                </h2>
                <p className={`mx-auto mt-3 max-w-2xl text-lg ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                  {copy.howItWorksSubtitle}
                </p>
              </div>
              <div className="mt-12 grid gap-8 md:grid-cols-3">
                {[
                  { step: 1, icon: '🔎', title: copy.step1Title, desc: copy.step1Desc },
                  { step: 2, icon: '🤖', title: copy.step2Title, desc: copy.step2Desc },
                  { step: 3, icon: '🤝', title: copy.step3Title, desc: copy.step3Desc },
                ].map((item, idx) => (
                  <div key={idx} className="relative text-center">
                    {idx < 2 && (
                      <div className="absolute left-1/2 top-10 hidden h-0.5 w-full bg-gradient-to-r from-indigo-500 to-transparent md:block" />
                    )}
                    <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-3xl shadow-lg">
                      {item.icon}
                      <div className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-indigo-600 shadow">
                        {item.step}
                      </div>
                    </div>
                    <h3 className={`mt-6 text-xl font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                      {item.title}
                    </h3>
                    <p className={`mt-2 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Featured Cars Preview */}
            <section>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={`text-2xl font-bold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                    Featured Vehicles
                  </h2>
                  <p className={`mt-1 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                    Explore our latest inventory
                  </p>
                </div>
                <button
                  onClick={() => setActivePage('listings')}
                  className="flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
                >
                  View All
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {cars.slice(0, 4).map((car) => renderCarCard(car))}
                {cars.length === 0 && (
                  <div className={`col-span-full rounded-2xl border p-8 text-center ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50'}`}>
                    <p className={resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}>Loading featured vehicles...</p>
                  </div>
                )}
              </div>
            </section>

            {/* CTA Section */}
            <section className="relative overflow-hidden rounded-3xl">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600"></div>
              <div className="absolute inset-0" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z\' fill=\'%23ffffff\' fill-opacity=\'0.1\' fill-rule=\'evenodd\'/%3E%3C/svg%3E")' }}></div>
              <div className="relative px-8 py-16 text-center md:py-20">
                <h2 className="text-3xl font-bold text-white md:text-4xl">
                  {copy.ctaTitle}
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-lg text-white/80">
                  {copy.ctaSubtitle}
                </p>
                <button
                  onClick={() => user ? setActivePage('listings') : setActivePage('profile')}
                  className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-lg font-semibold text-indigo-600 shadow-xl transition hover:bg-indigo-50"
                >
                  {copy.ctaButton}
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </section>
          </div>
        );
      case 'listings':
        return (
          <div className="space-y-4 md:space-y-6">
            <div className="grid gap-3 md:gap-4 lg:grid-cols-[2fr,1fr]">
              <div className={`rounded-2xl md:rounded-3xl border p-3 md:p-4 shadow-sm ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
                <div className="grid grid-cols-2 gap-2 md:gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <select value={filters.category || 'all'} name="filter-category" id="filter-category" onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value as any }))} className={`text-xs md:text-sm ${inputFieldClass}`}>
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <select value={filters.make} name="filter-make" id="filter-make" onChange={(event) => setFilters((prev) => ({ ...prev, make: event.target.value }))} className={`text-xs md:text-sm ${inputFieldClass}`}>
                    <option value="all">All Makes</option>
                    {allVehicleMakes.map((make) => (
                      <option key={make} value={make}>{make}</option>
                    ))}
                  </select>
                  <input
                    name="filter-search"
                    id="filter-search"
                    value={filters.search}
                    onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                    placeholder="Search..."
                    className={`text-xs md:text-sm col-span-2 md:col-span-1 ${inputFieldClass}`}
                  />
                  <select value={filters.sort} name="filter-sort" id="filter-sort" onChange={(event) => setFilters((prev) => ({ ...prev, sort: event.target.value as CarFilters['sort'] }))} className={`text-xs md:text-sm col-span-2 md:col-span-1 ${inputFieldClass}`}>
                    <option value="default">Recommended</option>
                    <option value="price-asc">Price: Low → High</option>
                    <option value="price-desc">Price: High → Low</option>
                    <option value="year-desc">Newer first</option>
                    <option value="rating-desc">Top rated</option>
                  </select>
                </div>
              </div>
              <form onSubmit={handleSemanticSearch} className={`rounded-2xl md:rounded-3xl border p-3 md:p-4 shadow-sm ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
                <p className={`text-xs md:text-sm font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>AI Semantic Search</p>
                <div className="mt-2 md:mt-3 flex gap-2 md:gap-3">
                  <input
                    name="semantic-query"
                    id="semantic-query"
                    value={semanticQuery}
                    onChange={(event) => setSemanticQuery(event.target.value)}
                    placeholder="e.g. Hybrid SUV under 150k"
                    className={`flex-1 text-xs md:text-sm ${inputFieldClass}`}
                  />
                  <button type="submit" className="rounded-xl md:rounded-2xl bg-sky-600 px-3 md:px-4 py-2 text-xs md:text-sm font-semibold text-white hover:bg-sky-700">
                    {semanticLoading ? 'Searching...' : 'Search'}
                  </button>
                </div>
                {semanticResults.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {semanticResults.map((car) => (
                      <div key={car.id} className={`flex items-center gap-3 rounded-2xl border p-3 text-sm ${resolvedTheme === 'dark' ? 'border-slate-600 bg-slate-700 text-slate-300' : 'border-slate-100 bg-slate-50 text-slate-600'}`}>
                        <img src={getCarImage(car)} alt={car.model} className="h-14 w-20 rounded-xl object-cover" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className={`font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{car.make} {car.model}</span>
                            <button className="text-xs text-sky-500 hover:text-sky-400" onClick={() => handleOpenCarDetails(car.id)}>Inspect</button>
                          </div>
                          <p>{formatPrice(car.price, car.currency)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </form>
            </div>
            
            {/* Grid Layout Toggle */}
            <div className={`flex items-center justify-between md:justify-end gap-2 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
              <span className="text-xs md:text-sm font-medium">{copy.columnsLabel}:</span>
              <div className="flex rounded-lg md:rounded-xl border overflow-hidden">
                {[1, 2, 3].map((cols) => (
                  <button
                    key={cols}
                    onClick={() => setGridColumns(cols as 1 | 2 | 3)}
                    className={`px-2 md:px-3 py-1 md:py-1.5 text-xs md:text-sm font-medium transition ${
                      gridColumns === cols
                        ? resolvedTheme === 'dark' ? 'bg-indigo-600 text-white' : 'bg-sky-600 text-white'
                        : resolvedTheme === 'dark' ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cols}
                  </button>
                ))}
              </div>
            </div>
            
            <div className={`grid gap-3 md:gap-4 ${
              gridColumns === 1 
                ? 'grid-cols-1' 
                : gridColumns === 2 
                  ? 'grid-cols-2' 
                  : 'grid-cols-2 lg:grid-cols-3'
            }`}>
              {paginatedCars.length === 0 ? (
                <p className="col-span-full text-center text-slate-500">No listings match your filters yet.</p>
              ) : (
                paginatedCars.map((car) => renderCarCard(car))
              )}
            </div>
            {sortedCars.length > 0 && (
              <div className={`flex flex-wrap items-center justify-between gap-4 rounded-3xl border px-4 py-3 text-sm shadow-sm ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-100 bg-white text-slate-600'}`}>
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
                      className={`rounded-2xl border px-3 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${resolvedTheme === 'dark' ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                    >
                      Prev
                    </button>
                    {paginationWindow[0] > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => goToPage(1)}
                          className={`rounded-2xl border px-3 py-1 font-semibold ${resolvedTheme === 'dark' ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                        >
                          1
                        </button>
                        {paginationWindow[0] > 2 && <span className={resolvedTheme === 'dark' ? 'text-slate-500' : 'text-slate-400'}>…</span>}
                      </>
                    )}
                    {paginationWindow.map((page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => goToPage(page)}
                        className={`rounded-2xl px-3 py-1 font-semibold ${currentPage === page ? 'bg-sky-600 text-white' : resolvedTheme === 'dark' ? 'border border-slate-600 text-slate-300 hover:bg-slate-700' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                      >
                        {page}
                      </button>
                    ))}
                    {paginationWindow[paginationWindow.length - 1] < totalPages && (
                      <>
                        {paginationWindow[paginationWindow.length - 1] < totalPages - 1 && (
                          <span className={resolvedTheme === 'dark' ? 'text-slate-500' : 'text-slate-400'}>…</span>
                        )}
                        <button
                          type="button"
                          onClick={() => goToPage(totalPages)}
                          className={`rounded-2xl border px-3 py-1 font-semibold ${resolvedTheme === 'dark' ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className={`rounded-2xl border px-3 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${resolvedTheme === 'dark' ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
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
            {favoriteCars.map((car) => renderCarCard(car))}
            {favoriteCars.length === 0 && <p className="text-slate-500">{copy.noFavorites}</p>}
          </div>
        );
      case 'messages':
        // Messaging page
        if (!user) {
          return (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">💬</div>
              <h2 className={`text-2xl font-bold mb-2 ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                {language === 'ar' ? 'تسجيل الدخول مطلوب' : 'Sign In Required'}
              </h2>
              <p className={`mb-6 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                {language === 'ar' ? 'يرجى تسجيل الدخول للوصول إلى رسائلك' : 'Please sign in to access your messages'}
              </p>
              <button
                onClick={() => setActivePage('profile')}
                className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 transition"
              >
                {language === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
              </button>
            </div>
          );
        }
        
        const activeConversation = conversations.find(c => c.id === activeConversationId);
        
        const handleSendMessage = async () => {
          if (!newMessageText.trim() || !activeConversationId || sendingMessage) return;
          
          setSendingMessage(true);
          try {
            const response = await sendMessage(
              activeConversation!.other_user_id,
              newMessageText.trim(),
              activeConversation!.listing_id,
              token
            );
            if (response.success) {
              setNewMessageText('');
              // Reload messages
              const messagesResponse = await fetchMessages(activeConversationId, token);
              if (messagesResponse.success) {
                setActiveConversationMessages(messagesResponse.messages);
              }
            }
          } catch (err) {
            console.error('Failed to send message', err);
            showToast(language === 'ar' ? 'فشل إرسال الرسالة' : 'Failed to send message', 'error');
          } finally {
            setSendingMessage(false);
          }
        };
        
        return (
          <div className="flex flex-col md:flex-row gap-4 h-[600px]">
            {/* Conversation List */}
            <div className={`w-full md:w-1/3 rounded-2xl border overflow-hidden flex flex-col ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-white'}`}>
              <div className={`p-4 border-b ${resolvedTheme === 'dark' ? 'border-slate-700' : 'border-slate-200'}`}>
                <h2 className={`text-lg font-bold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  {language === 'ar' ? 'المحادثات' : 'Conversations'}
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className={`${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                      {language === 'ar' ? 'لا توجد محادثات بعد' : 'No conversations yet'}
                    </p>
                    <p className={`text-sm mt-2 ${resolvedTheme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                      {language === 'ar' ? 'راسل بائعاً من صفحة السيارة' : 'Message a seller from a car listing'}
                    </p>
                  </div>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => setActiveConversationId(conv.id)}
                      className={`w-full p-4 text-left border-b transition ${
                        activeConversationId === conv.id
                          ? resolvedTheme === 'dark' ? 'bg-indigo-900/30 border-slate-700' : 'bg-indigo-50 border-slate-200'
                          : resolvedTheme === 'dark' ? 'hover:bg-slate-700/50 border-slate-700' : 'hover:bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                          {conv.other_username}
                        </span>
                        {conv.unread_count > 0 && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-xs text-white">
                            {conv.unread_count > 9 ? '9+' : conv.unread_count}
                          </span>
                        )}
                      </div>
                      {conv.listing_title && (
                        <p className={`text-xs mb-1 ${resolvedTheme === 'dark' ? 'text-indigo-400' : 'text-indigo-600'}`}>
                          Re: {conv.listing_title}
                        </p>
                      )}
                      <p className={`text-sm truncate ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                        {conv.last_message || (language === 'ar' ? 'ابدأ المحادثة' : 'Start the conversation')}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
            
            {/* Messages Panel */}
            <div className={`flex-1 rounded-2xl border overflow-hidden flex flex-col ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-white'}`}>
              {activeConversationId && activeConversation ? (
                <>
                  {/* Header */}
                  <div className={`p-4 border-b flex items-center gap-3 ${resolvedTheme === 'dark' ? 'border-slate-700' : 'border-slate-200'}`}>
                    <button
                      onClick={() => setActiveConversationId(null)}
                      className="md:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      ←
                    </button>
                    <div>
                      <h3 className={`font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                        {activeConversation.other_username}
                      </h3>
                      {activeConversation.listing_title && (
                        <p className={`text-xs ${resolvedTheme === 'dark' ? 'text-indigo-400' : 'text-indigo-600'}`}>
                          Re: {activeConversation.listing_title}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {activeConversationMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.is_mine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                            msg.is_mine
                              ? 'bg-indigo-600 text-white'
                              : resolvedTheme === 'dark' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-900'
                          }`}
                        >
                          <p className="text-sm">{msg.content}</p>
                          <p className={`text-xs mt-1 ${msg.is_mine ? 'text-indigo-200' : resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                            {new Date(msg.created_at).toLocaleTimeString(language === 'ar' ? 'ar-JO' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                    {activeConversationMessages.length === 0 && (
                      <div className="flex items-center justify-center h-full">
                        <p className={`text-center ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                          {language === 'ar' ? 'ابدأ المحادثة بإرسال رسالة' : 'Start the conversation by sending a message'}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {/* Input */}
                  <div className={`p-4 border-t ${resolvedTheme === 'dark' ? 'border-slate-700' : 'border-slate-200'}`}>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMessageText}
                        onChange={(e) => setNewMessageText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                        placeholder={language === 'ar' ? 'اكتب رسالتك...' : 'Type a message...'}
                        className={`flex-1 rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          resolvedTheme === 'dark'
                            ? 'border-slate-600 bg-slate-700 text-white placeholder-slate-400'
                            : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400'
                        }`}
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!newMessageText.trim() || sendingMessage}
                        className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sendingMessage ? '...' : language === 'ar' ? 'إرسال' : 'Send'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-6xl mb-4">💬</div>
                    <p className={`${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                      {language === 'ar' ? 'اختر محادثة للبدء' : 'Select a conversation to start'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      case 'dealers':
        // Sample dealers across Jordan with real coordinates
        const sampleDealers: DealerSummary[] = [
          {
            id: 1001,
            name: 'Premium Motors Amman',
            total_listings: 45,
            average_price: 35000,
            top_makes: [{ make: 'BMW', count: 15 }, { make: 'Mercedes', count: 12 }],
            hero_image: '/placeholder-car.svg',
            location: { lat: 31.9539, lng: 35.9106, city: 'Amman', address: 'Abdoun, Amman' },
          },
          {
            id: 1002,
            name: 'Elite Auto Gallery',
            total_listings: 32,
            average_price: 42000,
            top_makes: [{ make: 'Porsche', count: 10 }, { make: 'Audi', count: 8 }],
            hero_image: '/placeholder-car.svg',
            location: { lat: 31.9772, lng: 35.8468, city: 'Amman', address: 'Khalda, Amman' },
          },
          {
            id: 1003,
            name: 'Jordan Car Hub',
            total_listings: 67,
            average_price: 22000,
            top_makes: [{ make: 'Toyota', count: 25 }, { make: 'Honda', count: 18 }],
            hero_image: '/placeholder-car.svg',
            location: { lat: 32.5568, lng: 35.8469, city: 'Irbid', address: 'University Street, Irbid' },
          },
          {
            id: 1004,
            name: 'Luxury Wheels Jordan',
            total_listings: 28,
            average_price: 55000,
            top_makes: [{ make: 'Range Rover', count: 12 }, { make: 'Bentley', count: 5 }],
            hero_image: '/placeholder-car.svg',
            location: { lat: 32.0392, lng: 36.0879, city: 'Zarqa', address: 'King Hussein Street, Zarqa' },
          },
          {
            id: 1005,
            name: 'Aqaba Motors',
            total_listings: 38,
            average_price: 28000,
            top_makes: [{ make: 'Nissan', count: 14 }, { make: 'Hyundai', count: 12 }],
            hero_image: '/placeholder-car.svg',
            location: { lat: 29.5321, lng: 35.0063, city: 'Aqaba', address: 'City Center, Aqaba' },
          },
          {
            id: 1006,
            name: 'Salt Premium Cars',
            total_listings: 22,
            average_price: 31000,
            top_makes: [{ make: 'Kia', count: 8 }, { make: 'Mazda', count: 7 }],
            hero_image: '/placeholder-car.svg',
            location: { lat: 32.0392, lng: 35.7272, city: 'Salt', address: 'Main Street, Salt' },
          },
          {
            id: 1007,
            name: 'Madaba Auto Center',
            total_listings: 19,
            average_price: 24000,
            top_makes: [{ make: 'Chevrolet', count: 6 }, { make: 'Ford', count: 5 }],
            hero_image: '/placeholder-car.svg',
            location: { lat: 31.7160, lng: 35.7939, city: 'Madaba', address: 'King Talal Street, Madaba' },
          },
          {
            id: 1008,
            name: 'Petra Luxury Motors',
            total_listings: 15,
            average_price: 48000,
            top_makes: [{ make: 'Lexus', count: 6 }, { make: 'Infiniti', count: 4 }],
            hero_image: '/placeholder-car.svg',
            location: { lat: 30.3285, lng: 35.4444, city: 'Petra/Wadi Musa', address: 'Tourism Street, Wadi Musa' },
          },
        ];
        const displayDealers = dealers.length > 0 ? dealers : sampleDealers;
        
        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className={`text-2xl font-bold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{copy.dealersHeading}</h2>
                <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>{copy.dealersSubheading}</p>
              </div>
              <div className="flex items-center gap-3">
                {/* View Toggle */}
                <div className={`flex rounded-xl p-1 ${resolvedTheme === 'dark' ? 'bg-slate-800' : 'bg-slate-100'}`}>
                  <button
                    onClick={() => setDealerTab('grid')}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${dealerTab === 'grid' ? 'bg-white text-slate-900 shadow' : resolvedTheme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                      Grid
                    </span>
                  </button>
                  <button
                    onClick={() => setDealerTab('map')}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${dealerTab === 'map' ? 'bg-white text-slate-900 shadow' : resolvedTheme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Map
                    </span>
                  </button>
                </div>
                {/* Become a Dealer Button */}
                <button
                  onClick={() => setDealerRegistrationOpen(true)}
                  className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:from-indigo-600 hover:to-purple-700"
                >
                  Become a Dealer
                </button>
              </div>
            </div>

            {dealersLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
                <span className={`ml-3 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Loading dealers...</span>
              </div>
            ) : dealerTab === 'map' ? (
              /* Map View - Real Interactive Map */
              <div className="space-y-4">
                <DealerMap 
                  dealers={displayDealers} 
                  onDealerClick={handleOpenDealer}
                  isDark={resolvedTheme === 'dark'}
                />
                {/* Dealer chips below map */}
                <div className={`rounded-2xl p-4 ${resolvedTheme === 'dark' ? 'bg-slate-800' : 'bg-slate-50'}`}>
                  <p className={`mb-3 text-sm font-medium ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                    {displayDealers.length} dealers across Jordan
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {displayDealers.map((dealer, idx) => (
                      <button
                        key={dealer.id}
                        onClick={() => handleOpenDealer(dealer.id)}
                        className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition ${resolvedTheme === 'dark' ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-white text-slate-700 shadow-sm hover:bg-slate-100'}`}
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-[10px] font-bold text-white">
                          {idx + 1}
                        </span>
                        <span className="max-w-[120px] truncate">{dealer.name}</span>
                        <span className={`text-xs ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                          {(dealer as any).location?.city}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Grid View */
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {displayDealers.map((dealer) => renderDealerCard(dealer))}
              </div>
            )}

            {dealers.length === 0 && (
              <div className={`text-center rounded-2xl p-4 ${resolvedTheme === 'dark' ? 'bg-amber-900/20 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
                <p className="text-sm">🏪 Showing sample dealers. Live dealer network coming soon!</p>
              </div>
            )}

            {/* Dealer Registration Modal */}
            {dealerRegistrationOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className={`w-full max-w-lg rounded-3xl p-6 shadow-2xl ${resolvedTheme === 'dark' ? 'bg-slate-800' : 'bg-white'}`}>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className={`text-xl font-bold ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Become a Dealer</h3>
                      <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Submit your application to join our dealer network</p>
                    </div>
                    <button
                      onClick={() => setDealerRegistrationOpen(false)}
                      className={`rounded-full p-2 ${resolvedTheme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                    >
                      ✕
                    </button>
                  </div>
                  <form
                    className="space-y-4"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      // Validate required fields
                      if (!dealerRegistrationForm.name || !dealerRegistrationForm.email || !dealerRegistrationForm.phone || !dealerRegistrationForm.city) {
                        showToast('Please fill in all required fields', 'error');
                        return;
                      }
                      
                      try {
                        const response = await fetch(`${apiHost}/api/dealers/applications`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify(dealerRegistrationForm)
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                          showToast('Application submitted! We will review and contact you within 48 hours.', 'success');
                          setDealerRegistrationOpen(false);
                          setDealerRegistrationForm({
                            name: '', email: '', phone: '', address: '', city: '', description: '', website: ''
                          });
                        } else {
                          showToast(data.error || 'Failed to submit application', 'error');
                        }
                      } catch {
                        showToast('Application submitted! We will review and contact you within 48 hours.', 'success');
                        setDealerRegistrationOpen(false);
                        setDealerRegistrationForm({
                          name: '', email: '', phone: '', address: '', city: '', description: '', website: ''
                        });
                      }
                    }}
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={`text-sm font-medium ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                          Dealership Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={dealerRegistrationForm.name}
                          onChange={(e) => setDealerRegistrationForm(prev => ({ ...prev, name: e.target.value }))}
                          className={inputFieldClass}
                          placeholder="Your dealership name"
                          required
                        />
                      </div>
                      <div>
                        <label className={`text-sm font-medium ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                          Email <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          value={dealerRegistrationForm.email}
                          onChange={(e) => setDealerRegistrationForm(prev => ({ ...prev, email: e.target.value }))}
                          className={inputFieldClass}
                          placeholder="contact@dealer.com"
                          required
                        />
                      </div>
                      <div>
                        <label className={`text-sm font-medium ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                          Phone <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="tel"
                          value={dealerRegistrationForm.phone}
                          onChange={(e) => setDealerRegistrationForm(prev => ({ ...prev, phone: e.target.value }))}
                          className={inputFieldClass}
                          placeholder="+962 7X XXX XXXX"
                          required
                        />
                      </div>
                      <div>
                        <label className={`text-sm font-medium ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                          City <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={dealerRegistrationForm.city}
                          onChange={(e) => setDealerRegistrationForm(prev => ({ ...prev, city: e.target.value }))}
                          className={inputFieldClass}
                          placeholder="Amman"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className={`text-sm font-medium ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                        Address
                      </label>
                      <input
                        type="text"
                        value={dealerRegistrationForm.address}
                        onChange={(e) => setDealerRegistrationForm(prev => ({ ...prev, address: e.target.value }))}
                        className={inputFieldClass}
                        placeholder="Full showroom address"
                      />
                    </div>
                    <div>
                      <label className={`text-sm font-medium ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                        Website
                      </label>
                      <input
                        type="url"
                        value={dealerRegistrationForm.website}
                        onChange={(e) => setDealerRegistrationForm(prev => ({ ...prev, website: e.target.value }))}
                        className={inputFieldClass}
                        placeholder="https://yourdealer.com"
                      />
                    </div>
                    <div>
                      <label className={`text-sm font-medium ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                        Description
                      </label>
                      <textarea
                        value={dealerRegistrationForm.description}
                        onChange={(e) => setDealerRegistrationForm(prev => ({ ...prev, description: e.target.value }))}
                        className={`h-24 w-full ${inputFieldClass}`}
                        placeholder="Tell us about your dealership, specializations, and inventory..."
                      />
                    </div>
                    <div className={`rounded-xl p-3 ${resolvedTheme === 'dark' ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                      <p className="text-sm">
                        <strong>Note:</strong> Applications are reviewed within 48 hours. You will receive a verification email once approved.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setDealerRegistrationOpen(false)}
                        className={`flex-1 rounded-xl py-3 font-semibold ${resolvedTheme === 'dark' ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 py-3 font-semibold text-white hover:from-indigo-600 hover:to-purple-700"
                      >
                        Submit Application
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        );
      case 'myListings':
        if (!requireAuth()) return null;
        return (
          <div className="space-y-6">
            {/* Analytics Summary Cards */}
            {myListingsAnalytics && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-3xl border border-slate-100 bg-gradient-to-br from-emerald-50 to-emerald-100 p-5 shadow-sm">
                  <p className="text-xs uppercase text-emerald-700">Total Listings</p>
                  <p className="mt-1 text-3xl font-bold text-emerald-900">{myListingsAnalytics.total_listings}</p>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-gradient-to-br from-blue-50 to-blue-100 p-5 shadow-sm">
                  <p className="text-xs uppercase text-blue-700">Total Value</p>
                  <p className="mt-1 text-2xl font-bold text-blue-900">{formatPrice(myListingsAnalytics.total_value, 'JOD')}</p>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-gradient-to-br from-amber-50 to-amber-100 p-5 shadow-sm">
                  <p className="text-xs uppercase text-amber-700">Avg Price</p>
                  <p className="mt-1 text-2xl font-bold text-amber-900">{formatPrice(myListingsAnalytics.average_price, 'JOD')}</p>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-gradient-to-br from-purple-50 to-purple-100 p-5 shadow-sm">
                  <p className="text-xs uppercase text-purple-700">Favorites</p>
                  <p className="mt-1 text-3xl font-bold text-purple-900">{myListingsAnalytics.performance.total_favorites}</p>
                  {myListingsAnalytics.performance.avg_rating > 0 && (
                    <p className="text-sm text-purple-700">★ {myListingsAnalytics.performance.avg_rating} avg rating</p>
                  )}
                </div>
              </div>
            )}

            {/* Analytics Charts Row */}
            {myListingsAnalytics && myListingsAnalytics.total_listings > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Listings by Make */}
                {myListingsAnalytics.listings_by_make.length > 0 && (
                  <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 text-sm font-semibold uppercase text-slate-500">Listings by Make</h3>
                    <div className="space-y-2">
                      {myListingsAnalytics.listings_by_make.slice(0, 5).map((item) => (
                        <div key={item.make} className="flex items-center gap-3">
                          <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${(item.count / myListingsAnalytics.total_listings) * 100}%` }}
                            />
                          </div>
                          <span className="min-w-[80px] text-sm text-slate-700">{item.make}</span>
                          <span className="text-sm font-semibold text-slate-900">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Price Range */}
                <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold uppercase text-slate-500">Price Range</h3>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500">Lowest</p>
                      <p className="text-xl font-bold text-slate-900">{formatPrice(myListingsAnalytics.price_range.min, 'JOD')}</p>
                    </div>
                    <div className="flex-1 h-1 bg-gradient-to-r from-emerald-300 via-amber-300 to-rose-300 rounded-full" />
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Highest</p>
                      <p className="text-xl font-bold text-slate-900">{formatPrice(myListingsAnalytics.price_range.max, 'JOD')}</p>
                    </div>
                  </div>
                  {myListingsAnalytics.listings_by_body_style.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <p className="text-xs text-slate-500 mb-2">Body Styles</p>
                      <div className="flex flex-wrap gap-2">
                        {myListingsAnalytics.listings_by_body_style.map((item) => (
                          <span key={item.bodyStyle} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {item.bodyStyle} ({item.count})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Loading state for analytics */}
            {myListingsAnalyticsLoading && !myListingsAnalytics && (
              <div className="rounded-3xl border border-slate-100 bg-white p-6 text-center text-slate-500">
                Loading your listings analytics...
              </div>
            )}

            {/* Listings Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Your Listings ({myListings.length})</h2>
              <button
                onClick={() => setActivePage('addListing')}
                className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                + Add New
              </button>
            </div>

            {/* Listings Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {myListings.map((car) => (
                <div key={car.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
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
                  <div className="mt-4 flex gap-2">
                    <button className="flex-1 rounded-2xl bg-slate-900/5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900/10" onClick={() => handleOpenCarDetails(car.id)}>
                      View
                    </button>
                    <button className="flex-1 rounded-2xl bg-sky-500 py-2 text-sm font-semibold text-white hover:bg-sky-600" onClick={() => handleStartEditListing(car)}>
                      Edit
                    </button>
                    <button className="flex-1 rounded-2xl bg-rose-500 py-2 text-sm font-semibold text-white hover:bg-rose-600" onClick={() => handleDeleteListing(car.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Edit Listing Modal */}
            {editingListing && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
                  <button
                    onClick={() => setEditingListing(null)}
                    className="absolute right-4 top-4 rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"
                  >
                    ✕
                  </button>
                  <h2 className="mb-6 text-xl font-bold text-slate-900">Edit Listing</h2>
                  <form onSubmit={handleSaveEditListing} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="text-xs uppercase tracking-wide text-slate-500">Make</label>
                        <input
                          type="text"
                          value={editForm.make}
                          onChange={(e) => handleEditFormInput('make', e.target.value)}
                          className={`mt-1 w-full ${inputFieldClass}`}
                          required
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-wide text-slate-500">Model</label>
                        <input
                          type="text"
                          value={editForm.model}
                          onChange={(e) => handleEditFormInput('model', e.target.value)}
                          className={`mt-1 w-full ${inputFieldClass}`}
                          required
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-wide text-slate-500">Year</label>
                        <input
                          type="number"
                          value={editForm.year}
                          onChange={(e) => handleEditFormInput('year', e.target.value)}
                          className={`mt-1 w-full ${inputFieldClass}`}
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-wide text-slate-500">Price</label>
                        <input
                          type="number"
                          value={editForm.price}
                          onChange={(e) => handleEditFormInput('price', e.target.value)}
                          className={`mt-1 w-full ${inputFieldClass}`}
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-wide text-slate-500">Body Style</label>
                        <input
                          type="text"
                          value={editForm.bodyStyle}
                          onChange={(e) => handleEditFormInput('bodyStyle', e.target.value)}
                          className={`mt-1 w-full ${inputFieldClass}`}
                          placeholder="SUV, Sedan, Coupe..."
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-wide text-slate-500">Odometer (km)</label>
                        <input
                          type="number"
                          value={editForm.odometer}
                          onChange={(e) => handleEditFormInput('odometer', e.target.value)}
                          className={`mt-1 w-full ${inputFieldClass}`}
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-wide text-slate-500">Engine</label>
                        <input
                          type="text"
                          value={editForm.engine}
                          onChange={(e) => handleEditFormInput('engine', e.target.value)}
                          className={`mt-1 w-full ${inputFieldClass}`}
                          placeholder="2.0L Turbo, V8..."
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-wide text-slate-500">Horsepower</label>
                        <input
                          type="number"
                          value={editForm.horsepower}
                          onChange={(e) => handleEditFormInput('horsepower', e.target.value)}
                          className={`mt-1 w-full ${inputFieldClass}`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-slate-500">Description</label>
                      <textarea
                        value={editForm.description}
                        onChange={(e) => handleEditFormInput('description', e.target.value)}
                        className={`mt-1 h-24 w-full ${inputFieldClass}`}
                      />
                    </div>

                    {/* Image Gallery */}
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Images ({editForm.galleryImages.length}/12)</p>
                        </div>
                        <label className="cursor-pointer rounded-2xl bg-slate-900/10 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-900/20">
                          + Add Images
                          <input
                            type="file"
                            accept=".png,.jpg,.jpeg,.gif,.webp"
                            multiple
                            className="hidden"
                            onChange={(e) => handleEditGalleryUpload(e.target.files)}
                          />
                        </label>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {editForm.galleryImages.map((url, index) => (
                          <div key={`${url}-${index}`} className="relative">
                            <img src={url} alt={`Gallery ${index + 1}`} className="h-20 w-full rounded-xl object-cover" />
                            <button
                              type="button"
                              onClick={() => handleRemoveEditGalleryImage(index)}
                              className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-xs text-white"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Video Gallery */}
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Videos ({editForm.videoUrls.length}/2)</p>
                        </div>
                        <label className="cursor-pointer rounded-2xl bg-slate-900/10 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-900/20">
                          + Add Video
                          <input
                            type="file"
                            accept=".mp4,.mov,.avi,.mkv,.webm"
                            className="hidden"
                            onChange={(e) => handleEditVideoUpload(e.target.files)}
                          />
                        </label>
                      </div>
                      {editForm.videoUrls.length > 0 && (
                        <div className="space-y-2">
                          {editForm.videoUrls.map((url, index) => (
                            <div key={`video-${index}`} className="flex items-center gap-2 rounded-xl bg-white p-2">
                              <span className="flex-1 truncate text-sm text-slate-600">🎥 Video {index + 1}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveEditVideo(index)}
                                className="rounded-full bg-rose-500 px-2 py-1 text-xs text-white"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => setEditingListing(null)}
                        className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingListing}
                        className="flex-1 rounded-2xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {isSubmittingListing ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {myListings.length === 0 && (
              <div className={`rounded-3xl border border-dashed p-8 text-center ${resolvedTheme === 'dark' ? 'border-slate-600 bg-slate-800' : 'border-slate-200 bg-slate-50'}`}>
                <p className={`mb-4 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{copy.myListingsEmpty}</p>
                <button
                  onClick={() => setActivePage('addListing')}
                  className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  {copy.myListingsCreateFirst}
                </button>
              </div>
            )}
          </div>
        );
      case 'addListing':
        if (!requireAuth()) return null;
        return (
          <div className="grid gap-4 md:gap-6 lg:grid-cols-[1.2fr,0.8fr]">
            <form className={`space-y-3 md:space-y-4 rounded-2xl md:rounded-3xl border p-4 md:p-6 shadow-sm ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`} onSubmit={handleListingSubmit}>
              {/* Required Fields Section */}
              <div className={`rounded-xl md:rounded-2xl border p-3 md:p-4 ${resolvedTheme === 'dark' ? 'border-indigo-500/30 bg-indigo-900/20' : 'border-indigo-200 bg-indigo-50/50'}`}>
                <div className="flex items-center gap-2 mb-2 md:mb-3">
                  <span className="text-indigo-500">★</span>
                  <p className={`text-xs md:text-sm font-semibold ${resolvedTheme === 'dark' ? 'text-indigo-300' : 'text-indigo-700'}`}>{copy.formRequiredInfo}</p>
                </div>
                <div className="grid gap-2 md:gap-4 grid-cols-2 md:grid-cols-2">
                  <div>
                    <label className={`text-[10px] md:text-xs font-medium ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>{copy.formMakeLabel} <span className="text-red-500">*</span></label>
                    <select
                      name="listing-make"
                      id="listing-make"
                      value={listingForm.make}
                      onChange={(event) => handleMakeSelect(event.target.value)}
                      className={`text-xs md:text-sm ${inputFieldClass}`}
                      required
                    >
                      <option value="">{copy.makeSelectLabel}</option>
                      {availableMakeOptions.map((makeOption) => (
                        <option key={makeOption} value={makeOption}>{makeOption}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`text-[10px] md:text-xs font-medium ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>{copy.formModelLabel} <span className="text-red-500">*</span></label>
                    <select
                      name="listing-model"
                      id="listing-model"
                      value={listingForm.model}
                      onChange={(event) => handleModelSelect(event.target.value)}
                      className={`text-xs md:text-sm ${inputFieldClass}`}
                      required
                      disabled={!listingForm.make}
                    >
                      <option value="">{copy.modelSelectLabel}</option>
                      {availableModelOptions.map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`text-[10px] md:text-xs font-medium ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>{copy.formYearLabel} <span className="text-red-500">*</span></label>
                    <input name="listing-year" id="listing-year" value={listingForm.year} onChange={(event) => handleListingInput('year', event.target.value)} placeholder={copy.formYearPlaceholder} className={`text-xs md:text-sm ${inputFieldClass}`} required type="number" min="1900" max={new Date().getFullYear() + 2} />
                  </div>
                  <div>
                    <label className={`text-[10px] md:text-xs font-medium ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>{copy.formPriceLabel} <span className="text-red-500">*</span></label>
                    <div className="flex gap-1 md:gap-2">
                      <input name="listing-price" id="listing-price" value={listingForm.price} onChange={(event) => handleListingInput('price', event.target.value)} placeholder={copy.formPricePlaceholder} className={`flex-1 text-xs md:text-sm ${inputFieldClass}`} required type="number" min="0" />
                      <select name="listing-currency" id="listing-currency" value={listingForm.currency} onChange={(event) => handleListingInput('currency', event.target.value)} className={`w-16 md:w-24 text-xs md:text-sm ${inputFieldClass}`}>
                        {CURRENCY_OPTIONS.map((currency) => (
                          <option key={currency} value={currency}>{currency}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Optional Basic Details */}
              <div className={`rounded-xl md:rounded-2xl border p-3 md:p-4 ${resolvedTheme === 'dark' ? 'border-slate-600 bg-slate-800/50' : 'border-slate-200 bg-slate-50/50'}`}>
                <p className={`mb-2 md:mb-3 text-xs md:text-sm font-semibold ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>{copy.formVehicleSpecs}</p>
                <div className="grid gap-2 md:gap-4 grid-cols-2 md:grid-cols-2">
                  <input name="listing-bodystyle" id="listing-bodystyle" value={listingForm.bodyStyle} onChange={(event) => handleListingInput('bodyStyle', event.target.value)} placeholder={copy.formBodyStylePlaceholder} className={`text-xs md:text-sm ${inputFieldClass}`} />
                  <input name="listing-horsepower" id="listing-horsepower" value={listingForm.horsepower} onChange={(event) => handleListingInput('horsepower', event.target.value)} placeholder={copy.formHorsepowerPlaceholder} className={`text-xs md:text-sm ${inputFieldClass}`} type="number" min="0" />
                  {availableEngineOptions.length > 0 ? (
                    <select
                      name="listing-engine"
                      id="listing-engine"
                      value={listingForm.engine}
                      onChange={(event) => handleListingInput('engine', event.target.value)}
                      className={`text-xs md:text-sm ${inputFieldClass}`}
                      disabled={!listingForm.model}
                    >
                      <option value="">{copy.engineSelectLabel}</option>
                      {availableEngineOptions.map((engine) => (
                        <option key={engine} value={engine}>{engine}</option>
                      ))}
                    </select>
                  ) : (
                    <input name="listing-engine" id="listing-engine" value={listingForm.engine} onChange={(event) => handleListingInput('engine', event.target.value)} placeholder={copy.formEnginePlaceholder} className={`text-xs md:text-sm ${inputFieldClass}`} />
                  )}
                  <input name="listing-fueleconomy" id="listing-fueleconomy" value={listingForm.fuelEconomy} onChange={(event) => handleListingInput('fuelEconomy', event.target.value)} placeholder={copy.formFuelEconomyPlaceholder} className={`text-xs md:text-sm ${inputFieldClass}`} />
                  <input
                    name="listing-odometer"
                    id="listing-odometer"
                    value={listingForm.odometer}
                    onChange={(event) => handleListingInput('odometer', event.target.value)}
                    placeholder={copy.odometerLabel}
                    className={`text-xs md:text-sm ${inputFieldClass}`}
                    type="number"
                    min="0"
                  />
                  <input name="listing-image" id="listing-image" value={listingForm.image} onChange={(event) => handleListingInput('image', event.target.value)} placeholder={copy.formImageUrlPlaceholder} className={`text-xs md:text-sm ${inputFieldClass}`} />
                </div>
              </div>
              
              {/* Additional Vehicle Details */}
              <div className={`rounded-xl md:rounded-2xl border p-3 md:p-4 ${resolvedTheme === 'dark' ? 'border-slate-600 bg-slate-800/50' : 'border-slate-200 bg-slate-50/50'}`}>
                <p className={`mb-2 md:mb-3 text-xs md:text-sm font-semibold ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>{copy.formAdditionalDetails}</p>
                <div className="grid gap-2 md:gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-3">
                  <select name="listing-category" value={listingForm.category} onChange={(e) => handleListingInput('category', e.target.value)} className={`text-xs md:text-sm ${inputFieldClass}`}>
                    {CATEGORY_OPTIONS.filter(c => c.value !== 'all').map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <select name="listing-condition" value={listingForm.condition} onChange={(e) => handleListingInput('condition', e.target.value)} className={`text-xs md:text-sm ${inputFieldClass}`}>
                    {CONDITION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <select name="listing-transmission" value={listingForm.transmission} onChange={(e) => handleListingInput('transmission', e.target.value)} className={`text-xs md:text-sm ${inputFieldClass}`}>
                    {TRANSMISSION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <select name="listing-fueltype" value={listingForm.fuelType} onChange={(e) => handleListingInput('fuelType', e.target.value)} className={`text-xs md:text-sm ${inputFieldClass}`}>
                    {FUEL_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <select name="listing-regionalspec" value={listingForm.regionalSpec} onChange={(e) => handleListingInput('regionalSpec', e.target.value)} className={`text-xs md:text-sm ${inputFieldClass}`}>
                    {REGIONAL_SPEC_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <select name="listing-paymenttype" value={listingForm.paymentType} onChange={(e) => handleListingInput('paymentType', e.target.value)} className={`text-xs md:text-sm ${inputFieldClass}`}>
                    {PAYMENT_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <input name="listing-trim" value={listingForm.trim} onChange={(e) => handleListingInput('trim', e.target.value)} placeholder={copy.formTrimPlaceholder} className={`text-xs md:text-sm ${inputFieldClass}`} />
                  <input name="listing-exteriorcolor" value={listingForm.exteriorColor} onChange={(e) => handleListingInput('exteriorColor', e.target.value)} placeholder={copy.formExteriorColorPlaceholder} className={`text-xs md:text-sm ${inputFieldClass}`} />
                  <input name="listing-interiorcolor" value={listingForm.interiorColor} onChange={(e) => handleListingInput('interiorColor', e.target.value)} placeholder={copy.formInteriorColorPlaceholder} className={`text-xs md:text-sm ${inputFieldClass}`} />
                  <input name="listing-city" value={listingForm.city} onChange={(e) => handleListingInput('city', e.target.value)} placeholder={copy.formCityPlaceholder} className={`text-xs md:text-sm ${inputFieldClass}`} />
                  <input name="listing-neighborhood" value={listingForm.neighborhood} onChange={(e) => handleListingInput('neighborhood', e.target.value)} placeholder={copy.formNeighborhoodPlaceholder} className={`text-xs md:text-sm ${inputFieldClass}`} />
                </div>
              </div>
              
              <textarea name="listing-description" id="listing-description" value={listingForm.description} onChange={(event) => handleListingInput('description', event.target.value)} placeholder={copy.formDescriptionPlaceholder} className={`h-24 md:h-32 w-full text-xs md:text-sm ${inputFieldClass}`}
              />
              <div className="flex flex-wrap gap-2 md:gap-3">
                <button 
                  type="button" 
                  className={`rounded-xl md:rounded-2xl px-3 md:px-4 py-2 text-xs md:text-sm font-semibold text-white ${priceAssistLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-700'}`} 
                  onClick={handlePriceAssist}
                  disabled={priceAssistLoading}
                >
                  {priceAssistLoading ? '⏳...' : copy.priceAssistLabel}
                </button>
                <label htmlFor="upload-photo-input" className="cursor-pointer rounded-xl md:rounded-2xl border border-dashed border-slate-300 px-3 md:px-4 py-2 text-xs md:text-sm font-semibold text-slate-900">
                  {copy.uploadPhotoLabel}
                  <input type="file" name="upload-photo" id="upload-photo-input" accept="image/*" className="hidden" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleUploadImage(file);
                  }} />
                </label>
                <label htmlFor="vision-helper-input" className="cursor-pointer rounded-xl md:rounded-2xl border border-dashed border-slate-300 px-3 md:px-4 py-2 text-xs md:text-sm font-semibold text-slate-900">
                  {copy.visionHelperLabel}
                  <input type="file" name="vision-helper" id="vision-helper-input" accept="image/*" className="hidden" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleVisionAnalyze(file);
                  }} />
                </label>
              </div>
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{copy.galleryLabel}</p>
                    <p className="text-xs text-slate-500">Upload up to 12 images (PNG, JPG, JPEG, GIF, WEBP)</p>
                  </div>
                  <label className="cursor-pointer rounded-2xl border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100">
                    📷 {copy.galleryUploadLabel} ({listingForm.galleryImages.length}/12)
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.gif,.webp"
                      name="gallery-upload"
                      id="gallery-upload"
                      multiple
                      className="hidden"
                      onChange={(event) => handleGalleryUpload(event.target.files)}
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {listingForm.galleryImages.length === 0 && (
                    <p className="text-sm text-slate-500 sm:col-span-3 md:col-span-4">{copy.galleryEmpty}</p>
                  )}
                  {listingForm.galleryImages.map((url, index) => (
                    <div key={`${url}-${index}`} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <img src={url} alt={`Gallery ${index + 1}`} className="h-32 w-full object-cover" />
                      <button type="button" className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-100" onClick={() => handleRemoveGalleryImage(index)}>
                        ✕
                      </button>
                      {index === 0 && (
                        <span className="absolute left-2 top-2 rounded-full bg-indigo-500 px-2 py-0.5 text-xs font-semibold text-white">Main</span>
                      )}
                    </div>
                  ))}
                </div>
                {/* Video Upload Section */}
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{copy.videoLabel}</p>
                      <p className="text-xs text-slate-500">Upload up to 2 videos (MP4, MOV, AVI, MKV, WEBM - Max 100MB each)</p>
                    </div>
                    <label className="cursor-pointer rounded-2xl border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100">
                      🎥 Upload Video ({listingForm.videoUrls.length}/2)
                      <input
                        type="file"
                        accept=".mp4,.mov,.avi,.mkv,.webm"
                        name="video-upload"
                        id="video-upload"
                        multiple
                        className="hidden"
                        onChange={(event) => handleVideoUpload(event.target.files)}
                      />
                    </label>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {listingForm.videoUrls.length === 0 && (
                      <p className="text-sm text-slate-500 sm:col-span-2">No videos uploaded yet</p>
                    )}
                    {listingForm.videoUrls.map((url, index) => (
                      <div key={`video-${url}-${index}`} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <video src={url} className="h-32 w-full object-cover" controls />
                        <button type="button" className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-100" onClick={() => handleRemoveVideo(index)}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
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
      case 'admin':
        return renderAdminPanel();
      case 'about':
        return <AboutPage theme={resolvedTheme} language={language} onNavigate={(p) => setActivePage(p as PageKey)} />;
      case 'howItWorks':
        return <HowItWorksPage theme={resolvedTheme} language={language} onNavigate={(p) => setActivePage(p as PageKey)} />;
      case 'pricing':
        return <PricingPage theme={resolvedTheme} language={language} onNavigate={(p) => setActivePage(p as PageKey)} />;
      case 'faq':
        return <FAQPage theme={resolvedTheme} language={language} onNavigate={(p) => setActivePage(p as PageKey)} />;
      case 'contact':
        return <ContactPage theme={resolvedTheme} language={language} onNavigate={(p) => setActivePage(p as PageKey)} />;
      case 'cookiePolicy':
        return <CookiePolicyPage theme={resolvedTheme} language={language} onNavigate={(p) => setActivePage(p as PageKey)} />;
      case 'disclaimer':
        return <DisclaimerPage theme={resolvedTheme} language={language} onNavigate={(p) => setActivePage(p as PageKey)} />;
      default:
        return null;
    }
  };

  const currentServiceLabel = copy[currentService.labelKey];
  const currentServiceDescription = copy[currentService.descriptionKey];
  const currentYear = new Date().getFullYear();

  return (
    <div className={`${backgroundClass} min-h-screen relative overflow-x-hidden`} dir={direction} style={backgroundImageStyle}>
      {/* Overlay for readability */}
      <div className={`absolute inset-0 ${resolvedTheme === 'dark' ? 'bg-slate-950/85' : 'bg-white/80'}`} />
      <div className="relative z-10 overflow-x-hidden">
      {renderToast()}
      <header className={`sticky top-0 z-50 border-b backdrop-blur-md transition-colors duration-300 ${headerSurfaceClass} ${subtleBorderClass}`}>
        <div className="mx-auto flex h-16 sm:h-20 md:h-40 max-w-7xl items-center justify-between px-2 sm:px-4 lg:px-8">
          <div className="flex items-center gap-8">
            {/* Logo */}
            <div
              className="group flex cursor-pointer items-center gap-3 h-auto bg-transparent"
              onClick={() => setActivePage('home')}
            >
              <img
                src={'/IntelliWheels_Logo_Dark.png'}
                alt="IntelliWheels"
                className="block h-auto max-h-16 md:max-h-[200px] md:max-w-[200px] w-auto object-contain object-center transition-transform group-hover:scale-105 bg-transparent"
              />
            </div>

            {/* Desktop Nav */}
            <nav className="hidden items-center gap-1 md:flex">
              {[
                { key: 'home', label: copy.navHome },
                { key: 'listings', label: copy.navCatalog },
                { key: 'dealers', label: copy.navDealers },
                { key: 'favorites', label: copy.navFavorites },
                { key: 'addListing', label: copy.navAddListing },
                { key: 'chatbot', label: copy.navChatbot },
                { key: 'myListings', label: copy.navMyListings },
                // Admin link - show only for admin users
                ...(user?.is_admin || user?.username === 'admin' || user?.email === 'admin@intelliwheels.co'
                  ? [{ key: 'admin', label: copy.navAdmin }]
                  : []),
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActivePage(item.key as PageKey)}
                  className={`relative rounded-xl px-4 py-2 text-xl font-semibold transition-all ${activePage === item.key
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
              {/* Messages Icon */}
              <button
                onClick={() => setActivePage('messages')}
                className={`relative rounded-full p-2 transition hover:bg-slate-100 dark:hover:bg-slate-800 ${activePage === 'messages' ? 'text-indigo-500' : 'text-slate-500'}`}
                title={copy.navMessages}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                </svg>
                {unreadMessageCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                    {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                  </span>
                )}
              </button>

              {/* Settings Toggle */}
              <div className="relative" ref={settingsMenuRef}>
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className={`flex items-center gap-2 rounded-full border p-1 pr-4 transition-all hover:shadow-md ${statusPillClass}`}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-white dark:text-slate-900">
                    {mounted && user?.username?.[0]?.toUpperCase() || 'G'}
                  </div>
                  <span className="text-xs font-bold">{mounted && user ? user.username : copy.statusGuest}</span>
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
                          <p className={`font-semibold text-sm ${resolvedTheme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>{mounted && user ? copy.settingsProfileCta : copy.settingsProfileGuest}</p>
                          <p className="text-xs text-slate-500">{mounted && user?.email ? user.email : 'Manage account'}</p>
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
                { key: 'home', label: copy.navHome },
                { key: 'listings', label: copy.navCatalog },
                { key: 'dealers', label: copy.navDealers },
                { key: 'favorites', label: copy.navFavorites },
                { key: 'messages', label: copy.navMessages },
                { key: 'addListing', label: copy.navAddListing },
                { key: 'chatbot', label: copy.navChatbot },
                { key: 'myListings', label: copy.navMyListings },
                { key: 'profile', label: copy.navProfile },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => { setActivePage(item.key as PageKey); setNavMenuOpen(false); }}
                  className={`relative block w-full rounded-xl px-4 py-3 text-left font-semibold ${activePage === item.key ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300'
                    }`}
                >
                  {item.label}
                  {item.key === 'messages' && unreadMessageCount > 0 && (
                    <span className="absolute top-2 right-4 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                      {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>
      <div className="mx-auto max-w-7xl space-y-4 sm:space-y-8 px-2 sm:px-4 py-4 sm:py-10">
        <main className={`rounded-xl sm:rounded-3xl ${mainSurfaceClass} p-3 sm:p-6 shadow-lg`}>
          {authLoading ? <p className="text-center text-slate-500">Loading account...</p> : renderContent()}
        </main>
      </div>
      <footer className={`${resolvedTheme === 'dark' ? 'bg-slate-950 text-slate-200' : 'bg-slate-800 text-slate-100'} border-t border-slate-700/50`}>
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="flex flex-wrap items-start justify-between gap-6 text-sm">
            <div>
              <p className="text-lg font-semibold text-white">IntelliWheels</p>
              <p className="text-sm text-slate-300">{copy.tagline}</p>
            </div>
            <div>
              <p className="font-semibold text-white">{copy.footerSupport}</p>
              <p className="text-sm text-slate-300">{copy.footerEmail}: intelliwheels03@gmail.com</p>
              <p className="text-sm text-slate-300">{copy.footerPhone}: +962 77 738 1408</p>
            </div>
            <div>
              <p className="font-semibold text-white">{copy.footerContact}</p>
              <p className="text-sm text-slate-300">Amman, Jordan</p>
              <p className="text-sm text-slate-300">intelliwheels03@gmail.com</p>
            </div>
            <div>
              <p className="font-semibold text-white">{copy.footerSocial}</p>
              <div className="flex flex-col gap-1 text-sky-400">
                <a href="https://www.instagram.com/intelli_wheels1/" target="_blank" rel="noreferrer" className="hover:text-sky-300">{copy.footerInstagram}</a>
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-700/50 pt-4">
            <button onClick={() => setActivePage('about')} className="text-xs text-slate-400 hover:text-white transition">{language === 'ar' ? 'من نحن' : 'About'}</button>
            <button onClick={() => setActivePage('howItWorks')} className="text-xs text-slate-400 hover:text-white transition">{language === 'ar' ? 'كيف يعمل' : 'How It Works'}</button>
            <button onClick={() => setActivePage('pricing')} className="text-xs text-slate-400 hover:text-white transition">{language === 'ar' ? 'الأسعار' : 'Pricing'}</button>
            <button onClick={() => setActivePage('faq')} className="text-xs text-slate-400 hover:text-white transition">{language === 'ar' ? 'الأسئلة الشائعة' : 'FAQ'}</button>
            <button onClick={() => setActivePage('contact')} className="text-xs text-slate-400 hover:text-white transition">{language === 'ar' ? 'تواصل معنا' : 'Contact'}</button>
            <button onClick={() => setActivePage('cookiePolicy')} className="text-xs text-slate-400 hover:text-white transition">{language === 'ar' ? 'سياسة الكوكيز' : 'Cookies'}</button>
            <button onClick={() => setActivePage('disclaimer')} className="text-xs text-slate-400 hover:text-white transition">{language === 'ar' ? 'إخلاء المسؤولية' : 'Disclaimer'}</button>
          </div>
          <p className="mt-3 text-xs text-slate-400">© {currentYear} IntelliWheels. {copy.footerRights}</p>
        </div>
      </footer>
      
      {/* Floating AI Chat Button */}
      {activePage !== 'chatbot' && (
        <div
          ref={floatingChatRef}
          className="fixed z-50 cursor-move"
          style={{
            bottom: floatingChatPosition.y,
            right: floatingChatPosition.x,
          }}
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            setIsDraggingChat(true);
            const startX = e.clientX;
            const startY = e.clientY;
            const startPosX = floatingChatPosition.x;
            const startPosY = floatingChatPosition.y;
            
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaX = startX - moveEvent.clientX;
              const deltaY = startY - moveEvent.clientY;
              setFloatingChatPosition({
                x: Math.max(0, Math.min(window.innerWidth - 60, startPosX + deltaX)),
                y: Math.max(0, Math.min(window.innerHeight - 60, startPosY + deltaY)),
              });
            };
            
            const handleMouseUp = () => {
              setIsDraggingChat(false);
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        >
          {floatingChatOpen ? (
            <div className={`w-80 sm:w-96 rounded-2xl shadow-2xl overflow-hidden ${resolvedTheme === 'dark' ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
              {/* Mini Chat Header */}
              <div className="flex items-center justify-between bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                    <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-white">{copy.chatAssistantName}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setActivePage('chatbot'); setFloatingChatOpen(false); }}
                    className="rounded-lg p-1.5 text-white/70 hover:bg-white/20 hover:text-white"
                    title="Open full chat"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setFloatingChatOpen(false)}
                    className="rounded-lg p-1.5 text-white/70 hover:bg-white/20 hover:text-white"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
              {/* Mini Chat Messages */}
              <div className={`h-64 overflow-y-auto p-3 ${resolvedTheme === 'dark' ? 'bg-slate-900' : 'bg-slate-50'}`}>
                {chatMessages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-center">
                    <div>
                      <p className={`text-sm font-medium ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{copy.chatWelcome}</p>
                      <p className={`mt-1 text-xs ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Ask me about cars, pricing, or listings</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {chatMessages.slice(-5).map((msg) => (
                      <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                          msg.role === 'user'
                            ? 'bg-indigo-500 text-white'
                            : resolvedTheme === 'dark' ? 'bg-slate-700 text-slate-200' : 'bg-white text-slate-800 shadow-sm'
                        }`}>
                          <p className="whitespace-pre-line">{msg.text.slice(0, 200)}{msg.text.length > 200 ? '...' : ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Mini Chat Input */}
              <div className={`border-t p-3 ${resolvedTheme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !chatBusy) {
                        e.preventDefault();
                        handleChatSubmit();
                      }
                    }}
                    placeholder="Type a message..."
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${resolvedTheme === 'dark' ? 'border-slate-600 bg-slate-700 text-white placeholder-slate-400' : 'border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400'}`}
                  />
                  <button
                    onClick={handleChatSubmit}
                    disabled={!chatInput.trim() || chatBusy}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50"
                  >
                    {chatBusy ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                if (!isDraggingChat) {
                  if (!token) {
                    showToast('Please sign in to use the AI assistant', 'info');
                    setActivePage('profile');
                  } else {
                    setFloatingChatOpen(true);
                  }
                }
              }}
              className="group flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg transition-all hover:scale-110 hover:shadow-xl"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              {/* Notification dot for new users */}
              {chatMessages.length === 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pink-400 opacity-75"></span>
                  <span className="relative inline-flex h-4 w-4 rounded-full bg-pink-500"></span>
                </span>
              )}
            </button>
          )}
        </div>
      )}
      </div>
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
