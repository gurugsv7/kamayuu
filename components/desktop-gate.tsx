'use client';
// What a desktop visitor sees instead of the table: an invitation, laid on
// the same lantern-lit surface as the game, to open Kamayuu on a phone. The
// QR is a static SVG printed in ink on parchment; the phone shows the real
// title art the player will meet there, not a mock-up.
import {useRef, useState} from 'react';
import {Check, Copy} from 'lucide-react';

const SITE = 'https://kamayuu.builtbygsv.in';

export default function DesktopGate({onContinue}: {onContinue: () => void}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<any>(null);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(SITE);
    } catch {
      const el = document.createElement('textarea');
      el.value = SITE;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(el);
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="desktop-gate" aria-label="Kamayuu is played on a phone">
      <div className="gate-wall" aria-hidden="true" />
      <section className="gate-stage">
        <article className="gate-sheet">
          <div className="ledger-seal" aria-hidden="true"><span>♛</span></div>
          <p className="lesson-eyebrow">Played in the hand</p>
          <h1 className="gate-title">Kamayuu is a phone game.</h1>
          <p className="gate-body">
            The table, the cards you hold, the buzzer under your thumb — all of it is built for a screen you can carry.
            Open this address on your phone and the table is waiting.
          </p>
          <div className="gate-scan">
            <img className="gate-qr" src="/qr-kamayuu.svg" alt="QR code that opens kamayuu.builtbygsv.in" width={132} height={132} />
            <div className="gate-address">
              <span>Scan, or type</span>
              <b>kamayuu.builtbygsv.in</b>
              <button className="ink-btn" onClick={copyLink} aria-label="Copy the link to Kamayuu">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? 'Copied' : 'Copy the link'}</span>
              </button>
            </div>
          </div>
          <p className="gate-foot">Works in any phone browser. Nothing to install.</p>
        </article>
        <figure className="gate-phone" aria-hidden="true">
          <div className="gate-phone-screen"><img src="/onboarding-bg.webp" alt="" draggable={false} /></div>
        </figure>
      </section>
      <footer className="gate-footer">
        <span>Remember. Observe. Outthink.</span>
        <a href="https://www.builtbygsv.com" target="_blank" rel="noopener noreferrer">Built by builtbygsv</a>
        <button className="text-action" onClick={onContinue}>Continue on this screen anyway</button>
      </footer>
    </main>
  );
}
