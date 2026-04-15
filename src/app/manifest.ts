import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'IntelliWheels',
    short_name: 'IntelliWheels',
    description:
      "Jordan's smartest AI-powered automotive marketplace for buying and selling cars.",
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#111827',
    lang: 'en',
    icons: [
      {
        src: '/IntelliWheels_Logo_Dark.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/IntelliWheels_Logo_Dark.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/IntelliWheels_Logo_Dark.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
