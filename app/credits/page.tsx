import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Credits | Kamayuu',
  description: 'Kamayuu is built and run by builtbygsv — design, engineering, and the table itself.',
  alternates: { canonical: 'https://kamayuu.builtbygsv.in/credits' },
  openGraph: {
    type: 'website',
    siteName: 'Kamayuu',
    title: 'Credits | Kamayuu',
    description: 'Kamayuu is built and run by builtbygsv — design, engineering, and the table itself.',
    url: 'https://kamayuu.builtbygsv.in/credits',
  },
};

export default function CreditsPage() {
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
          <a href="https://www.builtbygsv.com" target="_blank" rel="noopener noreferrer">www.builtbygsv.com</a>.
        </p>
        <a className="primary" href="/" style={{ display: 'inline-block', textDecoration: 'none', marginTop: 18 }}>
          Back to the table
        </a>
        <small className="rules-foot">© {new Date().getFullYear()} builtbygsv. All rights reserved.</small>
      </div>
    </div>
  );
}
