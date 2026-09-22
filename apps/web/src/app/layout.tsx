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
// UI-004 — styled-jsx SSR registry: flushes `<style jsx>` rules into the server HTML.
import { StyledJsxRegistry } from './registry';
import { SpaceBackdrop } from '../components/SpaceBackdrop';

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
  // UI-003 — brand icons (public/): one source of truth, no app/icon.* convention files.
  icons: {
    icon: [{ url: '/favicon.ico' }, { url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '512x512' }],
  },
};

const criticalCss = `
/* Non-space default: dashboard routes need a dark body on first paint in dark mode
   (.tn-shell is transparent there and DarkGradientBackground mounts after hydration).
   With no html background, this propagates to the canvas. */
body {
  background: #000;
  color: #eef1f7;
  margin: 0;
  font-family: var(--font-ibm-plex-sans), system-ui, sans-serif;
}
/* HUB-006 — pre-paint = the shared space backdrop's base colour, per theme, keyed on
   the classes the blocking script sets (starfield-page for SPACE_PATHS, dark). */
html.starfield-page,
html.starfield-page body { background: #1d3358; }
html.starfield-page.dark,
html.starfield-page.dark body { background: #000; }
.login-page {
  opacity: 0;
  animation: page-fade-in 0.4s ease-out 0.05s forwards;
}
.modulos-page-wrapper {
  opacity: 0;
  animation: page-fade-in 0.4s ease-out 0.05s forwards;
  min-height: 100vh;
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
        {/* Critical CSS — paints the space backdrop's base colour (per theme) and
            primes the login fade-in before the rest of the stylesheet bundle
            resolves, so a hard refresh on /login or /modulos shows no flash. */}
        <style dangerouslySetInnerHTML={{ __html: criticalCss }} />
      </head>
      <body
        className={`min-h-screen antialiased ${inter.variable} ${jetbrainsMono.variable} ${dmSerifDisplay.variable} ${outfit.variable} ${spaceGrotesk.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
      >
        <StyledJsxRegistry>
          <ThemeProvider>
            {/* HUB-006 — one shared backdrop for SPACE_PATHS; persists across client navigation. */}
            <SpaceBackdrop />
            {children}
          </ThemeProvider>
        </StyledJsxRegistry>
      </body>
    </html>
  );
}
