import './global.css';
import {
  DM_Serif_Display,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Inter,
  JetBrains_Mono,
  Outfit,
  Space_Grotesk,
} from 'next/font/google';
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

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

export const metadata = {
  title: 'Excelsia ERP',
  description: 'Plataforma financiera gerencial para empresas chilenas',
};

const criticalCss = `
html { background: #000; }
body {
  background: #000;
  color: #eef1f7;
  margin: 0;
  font-family: var(--font-ibm-plex-sans), system-ui, sans-serif;
}
.login-page {
  opacity: 0;
  animation: page-fade-in 0.4s ease-out 0.05s forwards;
}
.modulos-page-wrapper {
  opacity: 0;
  animation: page-fade-in 0.4s ease-out 0.05s forwards;
  min-height: 100vh;
  background: #000;
}
@keyframes page-fade-in { to { opacity: 1; } }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Runs before hydration — applies the persisted theme class so the
            first paint matches the user's preference without a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeHydrationScript }} />
        {/* Critical CSS — paints a black backdrop and primes the login fade-in
            before the rest of the stylesheet bundle resolves, so a hard refresh
            on /login no longer shows a flash of unstyled content. */}
        <style dangerouslySetInnerHTML={{ __html: criticalCss }} />
      </head>
      <body
        className={`min-h-screen antialiased ${inter.variable} ${jetbrainsMono.variable} ${dmSerifDisplay.variable} ${outfit.variable} ${spaceGrotesk.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
