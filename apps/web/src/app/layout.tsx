import './global.css';
import { DM_Serif_Display, Inter, JetBrains_Mono, Outfit } from 'next/font/google';
import { ThemeProvider, themeHydrationScript } from '../lib/theme';

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
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Runs before hydration — applies the persisted theme class so the
            first paint matches the user's preference without a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeHydrationScript }} />
      </head>
      <body
        className={`min-h-screen ${inter.variable} ${jetbrainsMono.variable} ${dmSerifDisplay.variable} ${outfit.variable}`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
