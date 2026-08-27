import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: 'Bharat Job - Online PDF Editor | Free & Secure',
  description: 'Free online PDF editor by Bharat Job Result. Edit PDF files directly in your browser. Add text, images, shapes, signatures, whiteout, and annotations with zero installations.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Dancing+Script:wght@600;700&family=Great+Vibes&family=Inter:wght@300;400;500;600;700;800&family=Sacramento&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-gray-50 text-gray-900 antialiased selection:bg-blue-200">
        {children}
      </body>
    </html>
  );
}
