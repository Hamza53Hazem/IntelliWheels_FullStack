import rawCars from '@/data/cars.json';
import { Car } from './types';

type RawCar = Partial<Car> & { id?: number };

export const MOCK_CARS: Car[] = (rawCars as RawCar[]).map((car, index) => ({
  id: car.id ?? index + 1,
  make: car.make ?? 'Unknown',
  model: car.model ?? 'Model',
  year: car.year,
  price: car.price,
  currency: car.currency ?? 'AED',
  rating: car.rating,
  reviews: car.reviews,
  description: car.description,
  image: car.image,
  specs: car.specs,
}));
