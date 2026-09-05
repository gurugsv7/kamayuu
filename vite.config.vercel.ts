// Standalone Vite SPA build used ONLY for Vercel deployment.
//
// Why this exists: the app (app/page.tsx) is 100% client-rendered ('use
// client', no server components, no API routes, no server actions — all
// backend logic lives in Supabase and is called over HTTPS from the
// browser). The default `npm run build` (vinext build) targets Cloudflare
// Workers via @cloudflare/vite-plugin + wrangler, which Vercel cannot run.
// Rather than fight that adapter, we build the same client entry as a plain
// static SPA with vanilla Vite/React — the least churn path that actually
// works on Vercel's static/SPA hosting, and it keeps `npm run dev` (vinext
// dev) completely untouched for local development.
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Vite only exposes env vars prefixed with VITE_ via import.meta.env by
  // default. This app reads process.env.NEXT_PUBLIC_* (Next.js convention),
  // so we explicitly load and inline those two public/non-secret vars via
  // `define`, matching what vinext/Next does at build time.
  const env = loadEnv(mode, process.cwd(), 'NEXT_PUBLIC_');

  return {
    root: '.',
    css: { postcss: { plugins: [tailwindcss()] } },
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') },
    },
    define: {
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(
        env.NEXT_PUBLIC_SUPABASE_URL || '',
      ),
      'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
        env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
      ),
      // Public hCaptcha sitekey. The SECRET lives only in the Supabase dashboard.
      'process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY': JSON.stringify(
        env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || '',
      ),
      // Google OAuth client id is public by design (it ships in the GSI button).
      'process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID': JSON.stringify(
        env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
      ),
    },
    build: {
      outDir: 'dist-vercel',
      emptyOutDir: true,
    },
  };
});
