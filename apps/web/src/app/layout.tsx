import './global.css';
import { DM_Serif_Display, Inter, JetBrains_Mono, Outfit } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const dmSerifDisplay = DM_Serif_Display({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-dm-serif',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-outfit',
  display: 'swap',
});

export const metadata = {
  title: 'Excelsia ERP',
  description: 'Plataforma financiera gerencial para empresas chilenas',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body
        className={`min-h-screen ${inter.variable} ${jetbrainsMono.variable} ${dmSerifDisplay.variable} ${outfit.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
