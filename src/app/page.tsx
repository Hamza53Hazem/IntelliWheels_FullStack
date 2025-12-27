'use client';

import { AppView } from '@/components/AppView';
import { AuthProvider } from '@/context/AuthContext';

export default function Home() {
  return (
    <AuthProvider>
      <AppView />
    </AuthProvider>
  );
}
