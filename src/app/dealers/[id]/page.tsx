import { DealerDetailView } from '@/components/DealerDetailView';
import { AuthProvider } from '@/context/AuthContext';

interface DealerPageProps {
  params: Promise<{ id: string }>;
}

export default async function DealerPage({ params }: DealerPageProps) {
  const { id } = await params;
  return (
    <AuthProvider>
      <DealerDetailView dealerId={id} />
    </AuthProvider>
  );
}
