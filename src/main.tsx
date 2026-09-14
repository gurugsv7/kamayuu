// SPA entry point for the plain Vite/Vercel build (see vite.config.vercel.ts).
// The vinext dev workflow (`npm run dev`) does not use this file — it still
// boots app/page.tsx directly through the Next-on-Vite router.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import Home from '../app/page';
import CreditsPage from '../app/credits/page';

// This SPA build has no router — vercel.json rewrites every path to
// index.html, so the page to render is picked here from the real URL.
const path = window.location.pathname.replace(/\/+$/, '') || '/';
const Page = path === '/credits' ? CreditsPage : Home;
if (path === '/credits') document.title = 'Credits | Kamayuu';

const container = document.getElementById('root')!;
createRoot(container).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
