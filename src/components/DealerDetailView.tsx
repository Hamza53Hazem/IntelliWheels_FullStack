'use client';

import { useAuth } from '@/context/AuthContext';
import { fetchDealerById } from '@/lib/api';
import { DealerDetail } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

interface DealerDetailViewProps {
  dealerId: string;
}

export function DealerDetailView({ dealerId }: DealerDetailViewProps) {
  const numericId = Number(dealerId);
  const { token } = useAuth();
  const router = useRouter();
  const [dealer, setDealer] = useState<DealerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(numericId)) {
      setError('Invalid dealer identifier');
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function loadDealer() {
      try {
        setLoading(true);
        const response = await fetchDealerById(numericId, token || null);
        if (!cancelled) {
          if (response.success) {
            setDealer(response.dealer);
            setError(null);
          } else {
            setError('Dealer not found');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load dealer');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadDealer();
    return () => {
      cancelled = true;
    };
  }, [numericId, token]);

  const heroImage = useMemo(() => dealer?.hero_image || '/placeholder-car.svg', [dealer]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        Loading dealer profile...
      </div>
    );
  }

  if (error || !dealer) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow">
          <p className="text-lg font-semibold text-slate-900">{error || 'Dealer unavailable'}</p>
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
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <button
          type="button"
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
          onClick={() => router.back()}
        >
          ← Back
        </button>
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow">
          <div className="h-72 w-full bg-slate-100">
            <img src={heroImage} alt={dealer.name} className="h-full w-full object-cover" />
          </div>
          <div className="grid gap-6 p-6 lg:grid-cols-[1.5fr,1fr]">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{dealer.name}</h1>
              <p className="text-sm text-slate-500">Member since {dealer.member_since ? new Date(dealer.member_since).toLocaleDateString() : 'recently'}</p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
                <span>{dealer.total_listings} listings</span>
                {dealer.average_price ? <span>Avg price {formatCurrency(dealer.average_price)}</span> : null}
                {dealer.top_makes?.length ? <span>Top makes: {dealer.top_makes.slice(0, 3).map((entry) => entry.make).join(', ')}</span> : null}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Contact dealer</p>
              <p className="mt-2">{dealer.email || 'Contact details coming soon.'}</p>
              {dealer.email ? (
                <a
                  href={`mailto:${dealer.email}`}
                  className="mt-4 inline-flex w-full justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Email dealer
                </a>
              ) : null}
            </div>
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Inventory</h2>
          {dealer.cars.length === 0 ? (
            <p className="mt-2 text-slate-500">No active cars yet.</p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {dealer.cars.map((car) => (
                <div key={car.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow">
                  <div className="flex gap-4">
                    <img src={car.image || '/placeholder-car.svg'} alt={`${car.make} ${car.model}`} className="h-24 w-32 rounded-2xl object-cover" />
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-slate-900">{car.make} {car.model}</h3>
                      <p className="text-sm text-slate-500">{car.year || 'Year TBD'}</p>
                      <p className="font-semibold text-emerald-600">{formatCurrency(car.price, car.currency)}</p>
                      {car.odometerKm ? <p className="text-xs text-slate-500">{car.odometerKm.toLocaleString()} km</p> : null}
                    </div>
                  </div>
                  <div className="mt-4 flex gap-3">
                    <button
                      type="button"
                      className="flex-1 rounded-2xl bg-slate-900/10 py-2 text-sm font-semibold text-slate-900"
                      onClick={() => router.push(`/cars/${car.id}`)}
                    >
                      View car
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value?: number | null, currency = 'AED') {
  if (!value) return 'TBD';
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
