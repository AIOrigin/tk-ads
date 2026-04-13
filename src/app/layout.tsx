import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastContainer } from '@/components/ui/Toast';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export const metadata: Metadata = {
  title: 'Dance Like Me — Create Your Own Dance Video',
  description:
    'Upload a selfie and create your own AI dance video in 1 minute. Choose from trending dance styles. Only $2.99.',
  openGraph: {
    title: 'Dance Like Me — Create Your Own Dance Video',
    description: 'Upload a selfie. Pick a dance. Get your video in 1 minute.',
    type: 'website',
    images: ['/og-image.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-black text-gray-900 overscroll-none font-sans">
        <ErrorBoundary>
          <ToastContainer />
          <main className="min-h-screen">
            {children}
          </main>
        </ErrorBoundary>
      </body>
    </html>
  );
}
