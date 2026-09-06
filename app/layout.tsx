import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL('https://kamayuu.builtbygsv.in'),
  title: 'Kamayuu — A Game of Memory & Nerve | Play Free Online',
  description:
    'Kamayuu is a card game of memory, tracking, and nerve. Play solo vs AI, quick match, or a private table with friends — free to play, no download needed.',
  alternates: { canonical: 'https://kamayuu.builtbygsv.in/' },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large' } },
  manifest: '/site.webmanifest',
  keywords: [
    'Kamayuu',
    'Kamayuu game',
    'Kamayuu card game',
    'Kamayuu online',
    'how to play Kamayuu',
    'Kamayuu memory game',
  ],
  openGraph: {
    type: 'website',
    siteName: 'Kamayuu',
    title: 'Kamayuu — A Game of Memory & Nerve',
    description:
      'A card game of memory, tracking, and nerve. Play solo vs AI, quick match, or a private table with friends — free, online, no download.',
    url: 'https://kamayuu.builtbygsv.in/',
    locale: 'en_US',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Kamayuu — A Game of Memory & Nerve',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kamayuu — A Game of Memory & Nerve',
    description: 'Remember the card. Follow the position. Know when to buzz. Play Kamayuu free, online.',
    images: ['/og-image.png'],
  },
};
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0b0e14" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
