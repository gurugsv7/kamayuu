'use client';

import React, { useState, useRef, useEffect } from 'react';
import { NAME_LIMIT } from '@/lib/account';

export interface PlayerIdentityData {
  name: string;
  country: string;
  badge: string;
  photo: string;
}

interface PlayerIdentityScreenProps {
  initialName?: string;
  initialCountry?: string;
  initialBadge?: string;
  initialPhoto?: string;
  onBack?: () => void;
  onContinue: (identity: PlayerIdentityData) => void;
  authBusy?: string;
  authError?: string;
  backgroundImageUrl?: string;
  className?: string;
  style?: React.CSSProperties;
}

// 6 Player Badges as seen in the mockup
export const PLAYER_BADGES = [
  { id: 'compass', name: 'Compass Rose' },
  { id: 'wolf', name: 'Dire Wolf' },
  { id: 'dragon', name: 'Sea Dragon' },
  { id: 'lotus', name: 'Sacred Lotus' },
  { id: 'mountain', name: 'Twin Peaks' },
  { id: 'tree', name: 'Tree of Life' },
];

// Popular countries list for the dropdown
const COUNTRIES = [
  'India',
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'Japan',
  'Singapore',
  'United Arab Emirates',
  'Brazil',
  'Netherlands',
  'Spain',
  'Italy',
  'South Korea',
  'New Zealand',
  'South Africa',
  'Sweden',
  'Switzerland',
  'Mexico',
  'Argentina',
  'Norway',
  'Denmark',
  'Finland',
  'Ireland',
];

export default function PlayerIdentityScreen({
  initialName = 'Guru',
  initialCountry = 'India',
  initialBadge = 'compass',
  initialPhoto = '',
  onBack,
  onContinue,
  authBusy = '',
  authError = '',
  backgroundImageUrl = '/onboarding-identity-bg.webp',
  className = '',
  style = {},
}: PlayerIdentityScreenProps) {
  const [name, setName] = useState(initialName);
  const [country, setCountry] = useState(initialCountry);
  const [selectedBadge, setSelectedBadge] = useState<string>(initialBadge);
  const [photo, setPhoto] = useState<string>(initialPhoto);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [countryFilter, setCountryFilter] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Close country dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCountryDropdownOpen(false);
      }
    }
    if (countryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [countryDropdownOpen]);

  // Handle photo file selection
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Photo must be smaller than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (!result) return;
      // The photo is kept in localStorage, so a full-size data URL would blow the
      // quota and be dropped silently. Square-crop it to a thumbnail first.
      const image = new Image();
      image.onload = () => {
        const side = Math.min(image.width, image.height);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (!ctx) return setPhoto(result);
        ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256);
        setPhoto(canvas.toDataURL('image/jpeg', 0.85));
      };
      image.onerror = () => setPhoto(result);
      image.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleContinue = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(12); } catch {}
    }
    onContinue({
      name: name.trim().slice(0, NAME_LIMIT) || 'Guru',
      country,
      badge: selectedBadge,
      photo,
    });
  };

  const filteredCountries = COUNTRIES.filter((c) =>
    c.toLowerCase().includes(countryFilter.toLowerCase())
  );

  return (
    <div
      className={`identity-viewport ${className}`}
      style={style}
      role="region"
      aria-label="Player Identity"
    >
      <div
        className="identity-canvas"
        style={{
          backgroundImage: `url('${backgroundImageUrl}')`,
        }}
      >
        {/* Subtle vignette overlay */}
        <div className="identity-ambient-overlay" aria-hidden="true" />

        {/* Top Left: Back Button */}
        {onBack && (
          <button
            type="button"
            className="identity-back-btn"
            onClick={onBack}
            aria-label="Go back"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back</span>
          </button>
        )}

        {/* Profile Photo / Avatar Frame */}
        <div className="identity-avatar-slot">
          <div
            className="identity-avatar-frame"
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
            aria-label="Upload profile photo"
          >
            {/* Ornate Gold Outer Ring with 4 Diamond Studs */}
            <div className="avatar-outer-ring" aria-hidden="true">
              <span className="stud stud-top">✦</span>
              <span className="stud stud-right">✦</span>
              <span className="stud stud-bottom">✦</span>
              <span className="stud stud-left">✦</span>
            </div>

            {/* Photo Display / Default Dusk Silhouette */}
            <div className="avatar-circle">
              {photo ? (
                <img src={photo} alt="Player Avatar" className="avatar-img" />
              ) : (
                <div className="avatar-placeholder" aria-label="Default silhouette">
                  <svg viewBox="0 0 120 120" width="100%" height="100%" className="silhouette-svg">
                    <defs>
                      <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#252f48" />
                        <stop offset="45%" stopColor="#513a5b" />
                        <stop offset="70%" stopColor="#ba6848" />
                        <stop offset="100%" stopColor="#f59c52" />
                      </linearGradient>
                      <linearGradient id="cloudGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#3d2a45" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#874345" stopOpacity="0.4" />
                      </linearGradient>
                    </defs>
                    <rect width="120" height="120" fill="url(#skyGrad)" />
                    <ellipse cx="75" cy="72" rx="48" ry="12" fill="url(#cloudGrad)" />
                    <ellipse cx="35" cy="82" rx="36" ry="9" fill="url(#cloudGrad)" />
                    <g fill="#0b0e14">
                      <path d="M12 120 C 18 100 32 94 48 94 C 54 94 58 92 60 88 C 62 82 60 76 56 73 L 56 65 C 57 65 62 65 66 68 C 70 71 72 78 74 85 C 76 90 84 96 108 120 Z" />
                      <path d="M54 75 C 52 70 51 64 52 58 C 48 55 46 51 46 45 C 46 32 54 22 66 22 C 77 22 83 29 84 41 C 84 44 83 48 80 52 C 77 56 73 59 71 66 C 70 70 69 75 66 77 Z" />
                      <path d="M47 38 C 42 35 44 28 50 26 C 53 22 60 19 68 19 C 75 19 82 22 86 27 C 89 31 89 37 87 43 C 90 40 92 34 88 29 C 85 24 79 20 70 20 C 62 20 54 23 50 27 C 46 31 46 36 47 38 Z" />
                      <path d="M49 42 C 45 40 43 45 44 48 C 47 47 50 45 49 42 Z" />
                      <path d="M85 35 C 88 36 91 42 88 47 C 86 45 85 40 85 35 Z" />
                      <path d="M60 18 C 63 15 67 16 68 19 C 64 19 61 18 60 18 Z" />
                    </g>
                  </svg>
                </div>
              )}
            </div>

            {/* Camera Icon Button at bottom-right */}
            <div
              className="avatar-camera-btn"
              title="Change photo"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="#f5eedd"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden-file-input"
              onChange={handlePhotoUpload}
              aria-label="Upload profile photo file"
            />
          </div>
        </div>

        {/* Controls Stack: Unified flex column that dynamically distributes on all screen heights */}
        <div className="identity-controls-stack">
          {/* Inputs Group: Display Name & Country with tight, clean spacing */}
          <div className="identity-inputs-group">
            {/* 1. Display Name Input Plate */}
            <div className="identity-field-wrapper">
              <div className="identity-field-plate">
                <div className="plate-bg-layer" aria-hidden="true" />
                <div className="plate-inner-border" aria-hidden="true" />

                <div className="plate-content">
                  <div className="plate-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                      <path
                        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                        stroke="#f1e5cf"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle
                        cx="12"
                        cy="7"
                        r="4"
                        stroke="#f1e5cf"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  <div className="plate-body">
                    <label htmlFor="input-display-name" className="plate-label">
                      Display Name
                    </label>
                    <input
                      id="input-display-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value.slice(0, NAME_LIMIT))}
                      maxLength={NAME_LIMIT}
                      placeholder="Enter name"
                      autoComplete="nickname"
                      className="plate-input"
                    />
                  </div>

                  <div className="plate-meta" aria-label="Character count">
                    <span>{name.length}/{NAME_LIMIT}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Country (Optional) Dropdown Plate */}
            <div className="identity-field-wrapper country-field-wrapper" ref={dropdownRef}>
              <div className="identity-field-plate country-plate">
                <div className="plate-bg-layer" aria-hidden="true" />
                <div className="plate-inner-border" aria-hidden="true" />

                <button
                  type="button"
                  className="plate-content plate-btn"
                  onClick={() => setCountryDropdownOpen(!countryDropdownOpen)}
                  aria-haspopup="listbox"
                  aria-expanded={countryDropdownOpen}
                >
                  <div className="plate-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                      <path
                        d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
                        stroke="#f1e5cf"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle
                        cx="12"
                        cy="10"
                        r="3"
                        stroke="#f1e5cf"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  <div className="plate-body text-left">
                    <span className="plate-label">Country (Optional)</span>
                    <span className="plate-value">{country || 'Select Country'}</span>
                  </div>

                  <div className="plate-meta" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      fill="none"
                      stroke="#a69980"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`chevron-icon ${countryDropdownOpen ? 'open' : ''}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>

                {/* Country Picker Dropdown Menu */}
                {countryDropdownOpen && (
                  <div className="country-dropdown-menu" role="listbox">
                    <div className="country-search-box">
                      <input
                        type="text"
                        placeholder="Search country…"
                        value={countryFilter}
                        onChange={(e) => setCountryFilter(e.target.value)}
                        className="country-search-input"
                        autoFocus
                      />
                    </div>
                    <div className="country-list-scroll">
                      {filteredCountries.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`country-item ${country === c ? 'selected' : ''}`}
                          onClick={() => {
                            setCountry(c);
                            setCountryDropdownOpen(false);
                            setCountryFilter('');
                          }}
                          role="option"
                          aria-selected={country === c}
                        >
                          <span>{c}</span>
                          {country === c && <span className="check-mark">✓</span>}
                        </button>
                      ))}
                      {filteredCountries.length === 0 && (
                        <div className="country-no-results">No countries found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. Player Badges Section */}
          <div className="identity-badges-wrapper">
            <h3 className="badge-section-title">Choose a Player Badge (Optional)</h3>
            <div className="badge-selection-row" role="radiogroup" aria-label="Player Badges">
              {/* 1. Compass Rose Badge */}
              <button
                type="button"
                role="radio"
                aria-checked={selectedBadge === 'compass'}
                className={`player-badge-btn ${selectedBadge === 'compass' ? 'selected' : ''}`}
                onClick={() => setSelectedBadge(selectedBadge === 'compass' ? '' : 'compass')}
                title="Compass Rose"
              >
                <div className="badge-inner">
                  <svg viewBox="0 0 40 40" width="28" height="28" fill="none">
                    <circle cx="20" cy="20" r="9.5" stroke="currentColor" strokeWidth="1.2" opacity="0.8" />
                    <circle cx="20" cy="20" r="3.2" stroke="currentColor" strokeWidth="1.2" />
                    <polygon points="20,3 22,17 20,19 18,17" fill="currentColor" />
                    <polygon points="20,37 22,23 20,21 18,23" fill="currentColor" />
                    <polygon points="3,20 17,18 19,20 17,22" fill="currentColor" />
                    <polygon points="37,20 23,18 21,20 23,22" fill="currentColor" />
                    <polygon points="8,8 18,18 16,19 15,16" fill="currentColor" opacity="0.8" />
                    <polygon points="32,8 22,18 24,19 25,16" fill="currentColor" opacity="0.8" />
                    <polygon points="8,32 18,22 16,21 15,24" fill="currentColor" opacity="0.8" />
                    <polygon points="32,32 22,22 24,21 25,24" fill="currentColor" opacity="0.8" />
                  </svg>
                </div>
              </button>

              {/* 2. Wolf Head Badge */}
              <button
                type="button"
                role="radio"
                aria-checked={selectedBadge === 'wolf'}
                className={`player-badge-btn ${selectedBadge === 'wolf' ? 'selected' : ''}`}
                onClick={() => setSelectedBadge(selectedBadge === 'wolf' ? '' : 'wolf')}
                title="Dire Wolf"
              >
                <div className="badge-inner">
                  <svg viewBox="0 0 40 40" width="28" height="28" fill="none">
                    <path
                      d="M20 7 L25 15 L32 10 L28 22 L31 29 L26 31 L20 37 L14 31 L9 29 L12 22 L8 10 L15 15 Z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinejoin="round"
                    />
                    <path d="M20 7 L20 31" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M15 15 L20 23 L25 15" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M16 23 L20 28 L24 23" stroke="currentColor" strokeWidth="1.2" />
                    <polygon points="15,20 18,21 16,22" fill="currentColor" />
                    <polygon points="25,20 22,21 24,22" fill="currentColor" />
                    <polygon points="18.5,31 21.5,31 20,33" fill="currentColor" />
                  </svg>
                </div>
              </button>

              {/* 3. Dragon Badge */}
              <button
                type="button"
                role="radio"
                aria-checked={selectedBadge === 'dragon'}
                className={`player-badge-btn ${selectedBadge === 'dragon' ? 'selected' : ''}`}
                onClick={() => setSelectedBadge(selectedBadge === 'dragon' ? '' : 'dragon')}
                title="Sea Dragon"
              >
                <div className="badge-inner">
                  <svg viewBox="0 0 40 40" width="28" height="28" fill="none">
                    <path
                      d="M17 7 C 22 6 27 9 26 14 C 25 18 20 19 18 23 C 16 27 18 31 23 32 C 28 33 31 30 30 27 C 30 25 28 24 26 25"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path d="M17 7 L12 9 L15 12 L11 14 L17 16" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M20 7 L23 4 L22 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    <path d="M25 10 L28 11" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M25 15 L29 17" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M22 20 L26 22" stroke="currentColor" strokeWidth="1.3" />
                    <circle cx="27" cy="27" r="1.5" fill="currentColor" />
                  </svg>
                </div>
              </button>

              {/* 4. Sacred Lotus Badge */}
              <button
                type="button"
                role="radio"
                aria-checked={selectedBadge === 'lotus'}
                className={`player-badge-btn ${selectedBadge === 'lotus' ? 'selected' : ''}`}
                onClick={() => setSelectedBadge(selectedBadge === 'lotus' ? '' : 'lotus')}
                title="Sacred Lotus"
              >
                <div className="badge-inner">
                  <svg viewBox="0 0 40 40" width="28" height="28" fill="none">
                    <path
                      d="M20 8 C 16 16 16 24 20 28 C 24 24 24 16 20 8 Z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <path
                      d="M18 14 C 11 17 9 24 14 28 C 16 26 18 22 18 14 Z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <path
                      d="M13 22 C 7 24 6 29 11 31 C 14 30 15 27 13 22 Z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M22 14 C 29 17 31 24 26 28 C 24 26 22 22 22 14 Z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <path
                      d="M27 22 C 33 24 34 29 29 31 C 26 30 25 27 27 22 Z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <path d="M12 32 C 16 34 24 34 28 32" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </div>
              </button>

              {/* 5. Mountain Peaks Badge */}
              <button
                type="button"
                role="radio"
                aria-checked={selectedBadge === 'mountain'}
                className={`player-badge-btn ${selectedBadge === 'mountain' ? 'selected' : ''}`}
                onClick={() => setSelectedBadge(selectedBadge === 'mountain' ? '' : 'mountain')}
                title="Twin Peaks"
              >
                <div className="badge-inner">
                  <svg viewBox="0 0 40 40" width="28" height="28" fill="none">
                    <polygon points="19,9 31,31 7,31" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M19 9 L21 16 L18 22 L21 31" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M14 19 L19 16 L23 20" stroke="currentColor" strokeWidth="1.2" />
                    <polygon points="28,17 37,31 23,31" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M28 17 L30 23 L28 31" stroke="currentColor" strokeWidth="1.1" />
                  </svg>
                </div>
              </button>

              {/* 6. Tree of Life Badge */}
              <button
                type="button"
                role="radio"
                aria-checked={selectedBadge === 'tree'}
                className={`player-badge-btn ${selectedBadge === 'tree' ? 'selected' : ''}`}
                onClick={() => setSelectedBadge(selectedBadge === 'tree' ? '' : 'tree')}
                title="Tree of Life"
              >
                <div className="badge-inner">
                  <svg viewBox="0 0 40 40" width="28" height="28" fill="none">
                    <path d="M20 20 L20 31 M18 31 L20 27 L22 31" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M20 23 L16 19 M20 22 L24 19" stroke="currentColor" strokeWidth="1.3" />
                    <circle cx="20" cy="14" r="7.5" stroke="currentColor" strokeWidth="1.2" />
                    <circle cx="14" cy="16" r="5" stroke="currentColor" strokeWidth="1.1" />
                    <circle cx="26" cy="16" r="5" stroke="currentColor" strokeWidth="1.1" />
                    <circle cx="20" cy="12" r="1" fill="currentColor" />
                    <circle cx="16" cy="14" r="1" fill="currentColor" />
                    <circle cx="24" cy="14" r="1" fill="currentColor" />
                    <path d="M13 32 C 17 33 23 33 27 32" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </div>
              </button>
            </div>
            <p className="badge-caption">
              Badges don&apos;t change your gameplay.
              <br />
              They just show a bit of you.
            </p>
          </div>

          {/* Status / Error Toast if any */}
          {(authError || authBusy) && (
            <div className="identity-toast-wrapper" role="alert">
              {authBusy ? (
                <div className="toast-busy">
                  <span className="toast-spinner" />
                  <span>{authBusy}</span>
                </div>
              ) : (
                <div className="toast-error">
                  <span>{authError}</span>
                </div>
              )}
            </div>
          )}

          {/* 4. Continue Button (Ornate Chamfered Parchment Plaque) */}
          <div className="identity-btn-wrapper">
            <button
              type="button"
              id="btn-identity-continue"
              className="identity-continue-btn"
              onClick={handleContinue}
              disabled={!!authBusy}
              aria-label="Continue to game"
            >
              <div className="btn-bg-parchment" aria-hidden="true" />
              <div className="btn-inner-filigree" aria-hidden="true" />

              <div className="btn-label-content">
                <span className="btn-label-text">Continue</span>
                <span className="btn-label-arrow" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
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
