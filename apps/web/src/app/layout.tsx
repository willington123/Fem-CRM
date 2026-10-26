import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Konnexa',
    template: '%s · Konnexa',
  },
  description: 'Konnexa — CRM conversacional: bandeja de WhatsApp, Instagram y Facebook, pedidos y flujos automáticos.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#015EF7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans">{children}</body>
    </html>
  );
}
