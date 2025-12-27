'use client';

import { useAuth } from '@/context/AuthContext';
import { fetchCarById } from '@/lib/api';
import { Car } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface CarDetailViewProps {
  carId: string;
}

export function CarDetailView({ carId }: CarDetailViewProps) {
  const numericId = Number(carId);
  const { token } = useAuth();
  const router = useRouter();
  const [car, setCar] = useState<Car | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const apiHost = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
    return base.replace(/\/api$/, '');
  }, []);

  const resolveImageUrl = useCallback(
    (src?: string | null) => {
      if (!src) {
        return '/placeholder-car.svg';
      }
      if (src.startsWith('http') || src.startsWith('data:')) {
        return src;
      }
      if (!apiHost) {
        return src;
      }
      return `${apiHost}${src.startsWith('/') ? src : `/${src}`}`;
    },
    [apiHost]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!Number.isFinite(numericId)) {
        setError('Invalid car identifier.');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const response = await fetchCarById(numericId, token);
        if (!response.success || !response.car) {
          throw new Error('Unable to load car');
        }
        if (!cancelled) {
          setCar(response.car);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unable to load car';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [numericId, token]);

  const heroImage = car ? resolveImageUrl(car.image) : '/placeholder-car.svg';

  const gallery = useMemo(() => {
    if (!car) {
      return heroImage ? [heroImage] : ['/placeholder-car.svg'];
    }
    const mediaImages = (car.mediaGallery || [])
      .filter((entry) => entry.type === 'image' && entry.url)
      .map((entry) => resolveImageUrl(entry.url));
    const galleryImages = (car.galleryImages || []).map((url) => resolveImageUrl(url));
    const fallbackImages = (car.imageUrls || []).map((url) => resolveImageUrl(url));
    const combined = [
      ...mediaImages,
      ...galleryImages,
      ...fallbackImages,
      heroImage,
    ].filter(Boolean) as string[];
    const deduped = Array.from(new Set(combined));
    if (car) {
      const synthetic = buildFallbackGallery(car, deduped);
      synthetic.forEach((url) => {
        if (!deduped.includes(url)) {
          deduped.push(url);
        }
      });
    }
    return deduped;
  }, [car, heroImage, resolveImageUrl]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  useEffect(() => {
    setActiveIndex(0);
    setFullscreenIndex(0);
  }, [gallery.length]);

  const activeImage = gallery[activeIndex] || heroImage;
  const hasMultipleImages = gallery.length > 1;
  const videoSource = useMemo(() => {
    if (!car) return null;
    return car.videoUrl || car.mediaGallery?.find((entry) => entry.type === 'video')?.url || null;
  }, [car]);

  const descriptionText = useMemo(() => buildDescriptionCopy(car), [car]);

  const openFullscreen = (index: number) => {
    setFullscreenIndex(index);
    setIsFullscreen(true);
  };

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFullscreen(false);
      } else if (event.key === 'ArrowRight') {
        setFullscreenIndex((prev) => (prev === gallery.length - 1 ? 0 : prev + 1));
      } else if (event.key === 'ArrowLeft') {
        setFullscreenIndex((prev) => (prev === 0 ? gallery.length - 1 : prev - 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gallery.length, isFullscreen]);

  const renderVideoEmbed = (url: string) => {
    if (!url) return null;
    const youtubeMatch = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]+)/i);
    if (youtubeMatch) {
      return (
        <iframe
          title="car-video"
          src={`https://www.youtube.com/embed/${youtubeMatch[1]}`}
          className="h-64 w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      );
    }
    if (/\.(mp4|webm|ogg)$/i.test(url)) {
      return <video controls src={url} className="h-64 w-full rounded-2xl object-cover" />;
    }
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-sky-500 underline">
        Watch video
      </a>
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        Loading car details...
      </div>
    );
  }

  if (error || !car) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow">
          <p className="text-lg font-semibold text-slate-900">Unable to load this car</p>
          <p className="mt-2 text-sm text-slate-600">{error || 'The requested listing could not be found.'}</p>
          <button
            type="button"
            className="mt-6 w-full rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => router.back()}
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <button
          type="button"
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
          onClick={() => router.back()}
        >
          ← Back to listings
        </button>
        <div className="mt-6 grid gap-6 lg:grid-cols-[2fr,1fr]">
          <div className="rounded-3xl border border-slate-100 bg-white shadow-sm">
            <div className="relative h-96 w-full overflow-hidden rounded-t-3xl">
              <img
                src={activeImage}
                alt={`${car.make} ${car.model}`}
                className="h-full w-full cursor-zoom-in object-cover"
                onClick={() => openFullscreen(activeIndex)}
              />
              <button
                type="button"
                className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-900 shadow"
                onClick={() => openFullscreen(activeIndex)}
              >
                Full screen
              </button>
              {hasMultipleImages && (
                <>
                  <button
                    type="button"
                    aria-label="Previous image"
                    className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-3 text-slate-800 shadow"
                    onClick={() => setActiveIndex((prev) => (prev === 0 ? gallery.length - 1 : prev - 1))}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label="Next image"
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-3 text-slate-800 shadow"
                    onClick={() => setActiveIndex((prev) => (prev === gallery.length - 1 ? 0 : prev + 1))}
                  >
                    ›
                  </button>
                </>
              )}
            </div>
            {hasMultipleImages && (
              <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4">
                {gallery.map((url, index) => (
                  <button
                    key={`${url}-${index}`}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`h-16 w-16 overflow-hidden rounded-xl border ${index === activeIndex ? 'border-sky-500' : 'border-slate-200'}`}
                  >
                    <img src={url} alt={`Thumbnail ${index + 1}`} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-6 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-wide text-slate-400">Listing</p>
                  <h1 className="text-3xl font-bold text-slate-900">{car.make} {car.model}</h1>
                  <p className="text-slate-500">{car.year ?? 'Model year TBD'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
                  <p className="text-xs uppercase text-slate-400">Price</p>
                  <p className="text-3xl font-bold text-emerald-600">{formatCurrency(car.price, car.currency)}</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs uppercase text-slate-400">Rating</p>
                  <p className="text-3xl font-semibold text-slate-900">{car.rating ? car.rating.toFixed(1) : '—'}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs uppercase text-slate-400">Reviews</p>
                  <p className="text-3xl font-semibold text-slate-900">{car.reviews ?? '—'}</p>
                </div>
                {car.odometerKm ? (
                  <div className="rounded-2xl border border-slate-100 p-4">
                    <p className="text-xs uppercase text-slate-400">Odometer</p>
                    <p className="text-3xl font-semibold text-slate-900">{car.odometerKm.toLocaleString()} km</p>
                  </div>
                ) : null}
              </div>
              {descriptionText && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
                  <p className="text-sm font-semibold text-slate-900">Description</p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{descriptionText}</p>
                </div>
              )}
              {car.specs && (
                <div className="grid gap-3 md:grid-cols-2">
                  {Object.entries(car.specs).map(([key, value]) =>
                    value ? (
                      <div key={key} className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">{camelToTitle(key)}:</span> {String(value)}
                      </div>
                    ) : null
                  )}
                </div>
              )}
              {videoSource && (
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-sm font-semibold text-slate-900">Video spotlight</p>
                  <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-black/80">
                    {renderVideoEmbed(videoSource)}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Seller actions</p>
              <p className="mt-2 text-sm text-slate-600">Ready to discuss this car? Reach out to the IntelliWheels concierge team.</p>
              <div className="mt-4 space-y-2">
                <button className="w-full rounded-2xl bg-sky-600 py-2 text-sm font-semibold text-white">Request callback</button>
                <button className="w-full rounded-2xl border border-slate-200 py-2 text-sm font-semibold text-slate-900">Add to watchlist</button>
                {car.owner_id ? (
                  <button
                    className="w-full rounded-2xl border border-slate-200 py-2 text-sm font-semibold text-slate-900"
                    onClick={() => router.push(`/dealers/${car.owner_id}`)}
                  >
                    Visit dealer page
                  </button>
                ) : null}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Listing metadata</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>Currency: {car.currency || 'AED'}</li>
                <li>Created: {car.created_at ? new Date(car.created_at).toLocaleDateString() : 'Recently added'}</li>
                {car.updated_at && <li>Updated: {new Date(car.updated_at).toLocaleDateString()}</li>}
                {car.owner_id && <li>Owner ID: {car.owner_id}</li>}
              </ul>
            </div>
          </div>
        </div>
      </div>
      {isFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-4 py-8">
          <button
            type="button"
            className="absolute right-6 top-6 rounded-full bg-white/20 px-3 py-1 text-sm font-semibold text-white backdrop-blur"
            onClick={() => setIsFullscreen(false)}
          >
            Close ✕
          </button>
          {gallery.length > 1 && (
            <button
              type="button"
              aria-label="Previous image"
              className="absolute left-6 top-1/2 -translate-y-1/2 rounded-full bg-white/20 p-3 text-2xl text-white"
              onClick={() => setFullscreenIndex((prev) => (prev === 0 ? gallery.length - 1 : prev - 1))}
            >
              ‹
            </button>
          )}
          <img
            src={gallery[fullscreenIndex]}
            alt={`Fullscreen ${fullscreenIndex + 1}`}
            className="max-h-[90vh] max-w-5xl rounded-3xl object-contain shadow-2xl"
          />
          {gallery.length > 1 && (
            <button
              type="button"
              aria-label="Next image"
              className="absolute right-6 top-1/2 -translate-y-1/2 rounded-full bg-white/20 p-3 text-2xl text-white"
              onClick={() => setFullscreenIndex((prev) => (prev === gallery.length - 1 ? 0 : prev + 1))}
            >
              ›
            </button>
          )}
          {gallery.length > 1 && (
            <div className="absolute bottom-8 flex max-w-4xl gap-3 overflow-x-auto rounded-2xl bg-white/10 p-3">
              {gallery.map((url, index) => (
                <button
                  key={`${url}-fullscreen-${index}`}
                  type="button"
                  onClick={() => setFullscreenIndex(index)}
                  className={`h-16 w-16 overflow-hidden rounded-xl border ${index === fullscreenIndex ? 'border-white' : 'border-transparent opacity-70'}`}
                >
                  <img src={url} alt={`Fullscreen thumbnail ${index + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatCurrency(value?: number, currency = 'AED') {
  if (value === undefined || value === null) {
    return 'TBD';
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch (err) {
    return `${value.toLocaleString()} ${currency}`;
  }
}

function camelToTitle(value: string) {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (str) => str.toUpperCase());
}

function buildDescriptionCopy(car: Car | null) {
  if (!car) return '';
  const explicit = car.description?.trim();
  if (explicit) {
    return explicit;
  }
  const segments: string[] = [];
  const displayYear = car.year ? `${car.year}` : 'recent';
  segments.push(`This ${displayYear} ${car.make} ${car.model} is fully profiled on IntelliWheels.`);
  if (car.specs) {
    const { bodyStyle, engine, horsepower, fuelEconomy } = car.specs;
    const specLines: string[] = [];
    if (bodyStyle) specLines.push(`${bodyStyle} body`);
    if (engine) specLines.push(engine);
    if (horsepower) specLines.push(`${horsepower} hp output`);
    if (fuelEconomy) specLines.push(`rated at ${fuelEconomy}`);
    if (specLines.length) {
      segments.push(`Highlights include ${specLines.join(', ')}.`);
    }
  }
  if (car.currency && car.price) {
    segments.push(`Priced at ${formatCurrency(car.price, car.currency)}, it is ready for viewing.`);
  }
  return segments.join(' ');
}

function buildFallbackGallery(car: Car | null, existing: string[]) {
  if (!car) return [];
  const MIN_GALLERY_SIZE = 3;
  if (existing.length >= MIN_GALLERY_SIZE) {
    return [];
  }
  const views = ['front', '45', 'rear'];
  const stockAngles: string[] = [];
  for (const angle of views) {
    if (existing.length + stockAngles.length >= MIN_GALLERY_SIZE) {
      break;
    }
    const url = buildStockImageUrl(car, angle);
    if (url && !existing.includes(url) && !stockAngles.includes(url)) {
      stockAngles.push(url);
    }
  }
  return stockAngles;
}

function buildStockImageUrl(car: Car, angle: string) {
  if (!car.make || !car.model) {
    return '';
  }
  const params = new URLSearchParams({
    customer: 'img',
    make: car.make,
    modelFamily: car.model,
    modelRange: car.model,
    modelYear: String(car.year ?? new Date().getFullYear()),
    angle,
    zoomType: 'fullscreen',
    width: '1600',
  });
  return `https://cdn.imagin.studio/getImage?${params.toString()}`;
}
