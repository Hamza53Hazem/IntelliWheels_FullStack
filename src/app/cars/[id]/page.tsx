import { CarDetailView } from '@/components/CarDetailView';
import { AuthProvider } from '@/context/AuthContext';

interface CarDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CarDetailPage({ params }: CarDetailPageProps) {
  const { id } = await params;

  return (
    <AuthProvider>
      <CarDetailView carId={id} />
    </AuthProvider>
  );
}
