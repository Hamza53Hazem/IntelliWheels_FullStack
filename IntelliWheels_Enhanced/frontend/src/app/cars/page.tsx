'use client';

import { useEffect, useState } from 'react';
import { getCars } from '@/lib/api';

export default function CarsPage() {
  const [cars, setCars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getCars();
        setCars(data.cars || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div>Loading catalog...</div>;

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Car Catalog</h1>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          Add Listing
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cars.map((car) => (
          <div key={car.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <div className="h-48 bg-gray-200 relative">
               {/* Image placeholder */}
               {car.image_url && (
                 <img src={car.image_url} alt={car.model} className="w-full h-full object-cover" />
               )}
            </div>
            <div className="p-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg">{car.make} {car.model}</h3>
                <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">{car.year}</span>
              </div>
              <p className="text-blue-600 font-bold text-xl mb-4">
                {car.currency} {car.price?.toLocaleString()}
              </p>
              <div className="flex gap-2 text-sm text-gray-500">
                <span>{car.specs?.transmission || 'Auto'}</span>
                <span>•</span>
                <span>{car.specs?.fuel_type || 'Petrol'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
