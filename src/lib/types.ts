export type CurrencyCode = 'JOD' | 'AED' | 'USD' | 'EUR' | 'GBP' | 'SAR' | 'QAR' | 'BHD' | 'KWD' | 'OMR' | 'EGP' | 'MAD' | string;

export type SortOption = 'default' | 'price-asc' | 'price-desc' | 'rating-desc' | 'year-desc';

export interface CarFilters {
  make: string;
  search: string;
  sort: SortOption;
}

export interface CarSpecs {
  bodyStyle?: string;
  horsepower?: number;
  engine?: string;
  fuelEconomy?: string;
  drivetrain?: string;
  seats?: number;
  torque?: string;
}

export interface CarMedia {
  type: 'image' | 'video';
  url: string;
  label?: string;
  thumbnail?: string;
}

export interface Car {
  id: number;
  make: string;
  model: string;
  year?: number;
  price?: number;
  currency?: CurrencyCode;
  rating?: number;
  reviews?: number;
  description?: string;
  snippet?: string;
  image?: string;
  imageUrls?: string[];
  galleryImages?: string[];
  mediaGallery?: CarMedia[];
  videoUrl?: string;
  odometerKm?: number;
  specs?: CarSpecs;
  owner_id?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  error?: string;
  message?: string;
  data?: T;
  [key: string]: unknown;
}

export interface AuthPayload {
  username: string;
  email: string;
}

export interface UserProfile extends AuthPayload {
  id: number;
  currency?: CurrencyCode;
  created_at?: string;
}

export interface ListingDraft {
  make?: string;
  model?: string;
  year?: number;
  price?: number;
  currency?: CurrencyCode;
  bodyStyle?: string;
  horsepower?: number;
  engine?: string;
  fuelEconomy?: string;
  image?: string;
  image_url?: string;
  galleryImages?: string[];
  mediaGallery?: CarMedia[];
  videoUrl?: string;
  description?: string;
  odometerKm?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  relevantCarIds?: number[];
  listingData?: ListingDraft | null;
  actionType?: string | null;
  attachmentUrl?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: string;
}

export interface AnalyticsSummary {
  currency: CurrencyCode;
  average_price?: number;
  min_price?: number;
  max_price?: number;
  total_listings?: number;
  favorites_count?: number;
}

export interface AnalyticsInsight {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'flat';
}

export interface AnalyticsInsights {
  summary?: AnalyticsSummary;
  market_top_makes?: Array<{ make: string; avg_price: number; listings: number }>;
  price_distribution?: Array<{ bucket: string; count: number }>;
  growth_trends?: Array<{ label: string; value: number }>;
  watchlist?: Array<{ id: number; make: string; model: string; price: number; currency: CurrencyCode }>;
}

export interface PriceEstimatePayload {
  make: string;
  model: string;
  year: number;
  rating?: number;
  reviews?: number;
  bodyStyle?: string;
  horsepower?: number;
  currency?: CurrencyCode;
}

export interface PriceEstimateResponse {
  estimate: number;
  currency: CurrencyCode;
  range?: { low: number; high: number };
}

export interface VisionAttributes {
  make?: string;
  model?: string;
  year?: string | number;
  bodyStyle?: string;
  color?: string;
  conditionDescription?: string;
  estimatedPrice?: number;
  confidence?: number;
  highlights?: string[];
}

export interface SemanticSearchResult {
  score: number;
  car: Car;
}

export interface DealerSummary {
  id: number;
  name: string;
  email?: string;
  member_since?: string;
  total_listings: number;
  average_price?: number | null;
  top_makes: Array<{ make: string; count: number; average_price?: number | null }>;
  hero_image?: string | null;
}

export interface DealerDetail extends DealerSummary {
  cars: Car[];
}
