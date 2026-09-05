'use client';

import React, { useRef, useEffect, useState } from 'react';

interface OnboardingScreenProps {
  onContinueWithGoogle?: () => void;
  onContinueAsGuest: () => void;
  authBusy?: string;
  authError?: string;
  googleConfigured?: boolean;
  onGoogleToken?: (token: string, nonce: string) => void;
  onGoogleError?: (message: string) => void;
  backgroundImageUrl?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function OnboardingScreen({
  onContinueWithGoogle,
  onContinueAsGuest,
  authBusy = '',
  authError = '',
  googleConfigured = false,
  onGoogleToken,
  onGoogleError,
  backgroundImageUrl = '/onboarding-bg.webp',
  className = '',
  style = {},
}: OnboardingScreenProps) {
  const googleSlotRef = useRef<HTMLDivElement | null>(null);
  const [googleInitialized, setGoogleInitialized] = useState(false);

  // Mount Google GIS invisible overlay button if GIS is available and configured
  useEffect(() => {
    if (!googleConfigured || !googleSlotRef.current) return;
    let active = true;

    async function setupGIS() {
      try {
        const { mountGoogleButton } = await import('@/lib/google-auth');
        if (!active || !googleSlotRef.current) return;
        
        await mountGoogleButton(
          googleSlotRef.current,
          (token, nonce) => {
            if (onGoogleToken) onGoogleToken(token, nonce);
            else if (onContinueWithGoogle) onContinueWithGoogle();
          },
          (err) => {
            if (onGoogleError) onGoogleError(err);
          }
        );
        if (active) setGoogleInitialized(true);
      } catch {
        // Fallback to custom click handler
      }
    }

    setupGIS();
    return () => {
      active = false;
    };
  }, [googleConfigured, onGoogleToken, onGoogleError, onContinueWithGoogle]);

  const handleGoogleClick = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(10); } catch {}
    }
    // Google's own button sits invisibly on top and takes the click when it loads.
    // Reaching this handler with GIS configured means it never did, so say so
    // instead of showing a spinner for a popup that will not open.
    if (googleConfigured && !googleInitialized) {
      onGoogleError?.('Google sign-in did not load. Check your connection, or continue as guest.');
      return;
    }
    if (onContinueWithGoogle) onContinueWithGoogle();
  };

  const handleGuestClick = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(12); } catch {}
    }
    onContinueAsGuest();
  };

  return (
    <div
      className={`onboarding-viewport ${className}`}
      style={style}
      role="region"
      aria-label="Kamayuu Onboarding"
    >
      <div
        className="onboarding-canvas"
        style={{
          backgroundImage: `url('${backgroundImageUrl}')`,
        }}
      >
        {/* Subtle vignette and texture overlay for depth */}
        <div className="onboarding-ambient-overlay" aria-hidden="true" />

        {/* Status / Error Toast if any */}
        {(authError || authBusy) && (
          <div className="onboarding-toast" role="alert" aria-live="assertive">
            {authBusy ? (
              <div className="onboarding-toast-busy">
                <span className="onboarding-spinner" aria-hidden="true" />
                <span>{authBusy}</span>
              </div>
            ) : (
              <div className="onboarding-toast-error">
                <span>{authError}</span>
              </div>
            )}
          </div>
        )}

        {/* Buttons Layer: Positioned precisely according to the 576x1024 mockup */}
        <div className="onboarding-controls">
          {/* 1. Continue with Google Button */}
          <div className="onboarding-btn-wrapper google-wrapper">
            <button
              type="button"
              id="btn-continue-google"
              className="onboarding-btn btn-google"
              onClick={handleGoogleClick}
              disabled={!!authBusy}
              aria-label="Continue with Google"
            >
              {/* Ornate Frame & Chamfered Polygon Borders */}
              <div className="btn-bg-layer" aria-hidden="true" />
              <div className="btn-inner-border" aria-hidden="true" />

              {/* Button Content */}
              <div className="btn-content">
                <span className="btn-icon google-icon-badge" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="google-svg" width="22" height="22">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.27 21.37 7.35 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.94 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.27 2.63 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                </span>

                <span className="btn-text">Continue with Google</span>

                <span className="btn-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="12" x2="19" y2="12" />
                    <polyline points="13 6 19 12 13 18" />
                  </svg>
                </span>
              </div>
            </button>

            {/* Invisible Google GIS host iframe over the button for 1-click native popup */}
            {googleConfigured && (
              <div
                ref={googleSlotRef}
                className={`gis-overlay ${googleInitialized ? 'active' : ''}`}
                aria-hidden="true"
              />
            )}
          </div>

          {/* 2. Continue as Guest Button */}
          <div className="onboarding-btn-wrapper guest-wrapper">
            <button
              type="button"
              id="btn-continue-guest"
              className="onboarding-btn btn-guest"
              onClick={handleGuestClick}
              disabled={!!authBusy}
              aria-label="Continue as Guest"
            >
              {/* Ornate Frame & Chamfered Polygon Borders */}
              <div className="btn-bg-layer" aria-hidden="true" />
              <div className="btn-inner-border" aria-hidden="true" />

              {/* Button Content */}
              <div className="btn-content">
                <span className="btn-icon guest-icon-badge" aria-hidden="true">
                  {/* Detective / Incognito Hat and Glasses matching mockup */}
                  <svg viewBox="0 0 32 24" className="guest-svg" width="26" height="20" fill="currentColor">
                    {/* Fedora Hat Crown & Crease */}
                    <path d="M10 9.5 C10 6 12 2.5 16 2.5 C20 2.5 22 6 22 9.5 Z" opacity="0.95" />
                    <path d="M13 2.5 C15 4 17 4 19 2.5" stroke="#0d1319" strokeWidth="1" fill="none" />
                    {/* Hat Ribbon */}
                    <path d="M9.8 9.5 C12 9.8 20 9.8 22.2 9.5 L22.5 11 C19.5 11.3 12.5 11.3 9.5 11 Z" opacity="0.4" />
                    {/* Hat Brim */}
                    <path d="M4.5 11.5 C9 10 23 10 27.5 11.5 C28.5 11.9 28 13 26.5 12.8 C21 12 11 12 5.5 12.8 C4 13 3.5 11.9 4.5 11.5 Z" />
                    {/* Glasses: Left Lens, Right Lens & Bridge */}
                    <circle cx="11" cy="17.5" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    <circle cx="21" cy="17.5" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M14.2 16.8 C15.4 16.2 16.6 16.2 17.8 16.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </span>

                <span className="btn-text">Continue as Guest</span>

                <span className="btn-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="12" x2="19" y2="12" />
                    <polyline points="13 6 19 12 13 18" />
                  </svg>
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
