// SPA entry point for the plain Vite/Vercel build (see vite.config.vercel.ts).
// The vinext dev workflow (`npm run dev`) does not use this file — it still
// boots app/page.tsx directly through the Next-on-Vite router.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import Home from '../app/page';
import CreditsPage from '../app/credits/page';
import {initializeNative,hideNativeSplash,isNative} from '../lib/native';
import {OPENING_ART,MATCHMAKING_ART,warmArtwork} from '../lib/artwork-assets.mjs';
import '../app/mobile.css';

// This SPA build has no router — vercel.json rewrites every path to
// index.html, so the page to render is picked here from the real URL.
const path = window.location.pathname.replace(/\/+$/, '') || '/';
const Page = path === '/credits' ? CreditsPage : Home;

const container = document.getElementById('root')!;
void initializeNative().catch(()=>{});
const openingReady=warmArtwork(OPENING_ART);
createRoot(container).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
// Android serves these files from its installed bundle, including on the first
// offline launch. Paint decoded opening art before releasing the native splash.
void openingReady.then(()=>{requestAnimationFrame(hideNativeSplash);void warmArtwork(MATCHMAKING_ART);});
// A browser downloads artwork once per version. Native already owns the files;
// do not duplicate its bundle in Cache Storage or keep a worker across upgrades.
if(import.meta.env.PROD&&!isNative()&&'serviceWorker' in navigator){
 const register=()=>{void navigator.serviceWorker.register('/artwork-sw.js',{updateViaCache:'none'}).catch(()=>{});};
 if(document.readyState==='complete')register();else window.addEventListener('load',register,{once:true});
}
