// SPA entry point for the plain Vite/Vercel build (see vite.config.vercel.ts).
// The vinext dev workflow (`npm run dev`) does not use this file — it still
// boots app/page.tsx directly through the Next-on-Vite router.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import Home from '../app/page';

const container = document.getElementById('root')!;
createRoot(container).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
