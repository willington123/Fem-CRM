import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Fem CRM',
    template: '%s · Fem CRM',
  },
  description: 'CRM de Fem — bandeja omnicanal, pedidos, flujos automáticos y retención.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#FF9DA3',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans">{children}</body>
    </html>
  );
}
