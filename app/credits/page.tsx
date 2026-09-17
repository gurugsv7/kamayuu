'use client';
import { useEffect } from 'react';
import type { Metadata } from 'next';

const TITLE = 'Credits | Kamayuu';
const DESCRIPTION = 'Kamayuu is built and run by builtbygsv — design, engineering, and the table itself.';
const URL = 'https://kamayuu.builtbygsv.in/credits';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { type: 'website', siteName: 'Kamayuu', title: TITLE, description: DESCRIPTION, url: URL },
};

// The live site is deployed as a static SPA (see src/main.tsx) that serves
// the same index.html — with the homepage's canonical/meta tags baked in —
// for every path. Without correcting them here, Google reads /credits as
// a duplicate of the homepage (its own canonical) and never indexes it.
function useCreditsMetaTags() {
  useEffect(() => {
    document.title = TITLE;
    const setMeta = (selector: string, attr: string, value: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute(attr, value);
    };
    setMeta('link[rel="canonical"]', 'href', URL);
    setMeta('meta[name="description"]', 'content', DESCRIPTION);
    setMeta('meta[property="og:url"]', 'content', URL);
    setMeta('meta[property="og:title"]', 'content', TITLE);
    setMeta('meta[property="og:description"]', 'content', DESCRIPTION);
  }, []);
}

export default function CreditsPage() {
  useCreditsMetaTags();
  return (
    <div className="game-shell">
      <div className="welcome-card credits-content">
        <p className="eyebrow">CREDITS</p>
        <h1 style={{ fontSize: 32 }}>Who made this table</h1>
        <div className="rule">
          <b>✦</b>
          <p><strong>Kamayuu</strong> is built and run by <strong>builtbygsv</strong>.</p>
        </div>
        <p>
          Design, engineering, and the table itself —{' '}
          <a href="https://builtbygsv.in" target="_blank" rel="noopener noreferrer">builtbygsv.in</a>.
        </p>
        <a className="primary" href="/" style={{ display: 'inline-block', textDecoration: 'none', marginTop: 18 }}>
          Back to the table
        </a>
        <small className="rules-foot">© {new Date().getFullYear()} builtbygsv. All rights reserved.</small>
      </div>
    </div>
  );
}
