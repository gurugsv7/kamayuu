'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  BarChart3,
  Settings as SettingsIcon,
  Zap,
  Trophy,
  Bot,
  ArrowRight,
  BookOpen,
} from 'lucide-react';

export interface HomeScreenProps {
  playerName?: string;
  playerPhoto?: string;
  playerRank?: string;
  playerRating?: number;
  aiDifficulty?: string;
  onDifficultyChange?: (difficulty: string) => void;
  onQuickMatch?: (mode: 'casual' | 'ranked') => void;
  onComingSoon?: (mode: 'casual' | 'ranked') => void;
  onPrivateTable?: () => void;
  onPractice?: (difficulty: string) => void;
  onHowToPlay?: () => void;
  onOpenSettings?: () => void;
  onOpenFriends?: () => void;
  onOpenLeaderboard?: () => void;
  backgroundImageUrl?: string;
}

export default function HomeScreen({
  playerName = 'Guru',
  playerPhoto = '',
  playerRank = 'Gold II',
  playerRating = 1248,
  aiDifficulty = 'medium',
  onDifficultyChange,
  onQuickMatch,
  onComingSoon,
  onPrivateTable,
  onPractice,
  onHowToPlay,
  onOpenSettings,
  onOpenFriends,
  onOpenLeaderboard,
  backgroundImageUrl = '/onboarding-identity-bg.webp',
}: HomeScreenProps) {
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>(aiDifficulty);

  // Follow the difficulty when it is changed elsewhere (restored settings, replay).
  useEffect(() => {
    setSelectedDifficulty(aiDifficulty);
  }, [aiDifficulty]);

  const handleDifficultySelect = (diff: string) => {
    setSelectedDifficulty(diff);
    onDifficultyChange?.(diff);
  };

  const handleStartQuickMatch = () => {
    onQuickMatch?.('casual');
  };

  const handleStartPractice = () => {
    onPractice?.(selectedDifficulty);
  };

  return (
    <div className="home-viewport" role="region" aria-label="Kamayuu Home">
      <div
        className="home-canvas"
        style={{
          backgroundImage: `url('${backgroundImageUrl}')`,
        }}
      >
        {/* Subtle vignette atmosphere */}
        <div className="home-ambient-overlay" aria-hidden="true" />

        {/* ================================================================
            TOP HUD BAR: Profile Capsule + Action Icons
            ================================================================ */}
        <header className="home-top-hud">
          {/* Left: Player Profile Capsule */}
          <div className="home-profile-capsule" title={`${playerName} (${playerRank})`}>
            {/* Avatar Thumbnail with Gold Rim */}
            <div className="profile-thumb-frame">
              {playerPhoto ? (
                <img src={playerPhoto} alt={playerName} className="profile-thumb-img" />
              ) : (
                <div className="profile-thumb-placeholder">
                  {/* Mini silhouette SVG matching theme */}
                  <svg viewBox="0 0 40 40" width="100%" height="100%">
                    <defs>
                      <linearGradient id="hudSky" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#252f48" />
                        <stop offset="60%" stopColor="#874345" />
                        <stop offset="100%" stopColor="#f59c52" />
                      </linearGradient>
                    </defs>
                    <rect width="40" height="40" fill="url(#hudSky)" />
                    <circle cx="20" cy="15" r="7" fill="#0b0e14" />
                    <path d="M7 38 C9 27 15 25 20 25 C25 25 31 27 33 38 Z" fill="#0b0e14" />
                  </svg>
                </div>
              )}
            </div>

            {/* Player Info Meta */}
            <div className="profile-meta">
              <span className="profile-name">{playerName}</span>
            </div>
          </div>

          {/* Right: 3 Circular Action Buttons */}
          <div className="home-action-buttons">
            <button
              type="button"
              className="hud-circle-btn"
              onClick={onOpenFriends}
              aria-label="Friends & Social"
              title="Friends & Tables"
            >
              <Users size={17} />
            </button>
            <button
              type="button"
              className="hud-circle-btn"
              onClick={onOpenLeaderboard}
              aria-label="Leaderboards & Stats"
              title="Leaderboard & Stats"
            >
              <BarChart3 size={17} />
            </button>
            <button
              type="button"
              className="hud-circle-btn"
              onClick={onOpenSettings}
              aria-label="Table Settings"
              title="Table Settings"
            >
              <SettingsIcon size={17} />
            </button>
          </div>
        </header>

        {/* ================================================================
            MAIN CONTENT STACK: 3 Game Mode Banners + How to Play
            ================================================================ */}
        <main className="home-modes-container">
          {/* 1. QUICK MATCH BANNER */}
          <article className="mode-card quick-match-card" onClick={handleStartQuickMatch}>
            {/* Ornate corner filigree accents */}
            <div className="card-outer-filigree" aria-hidden="true" />
            <div className="card-inner-bevel" aria-hidden="true" />

            <div className="mode-card-layout">
              {/* Left Artwork Thumbnail */}
              <div className="mode-art-thumb">
                <img
                  src="/card-art-quickmatch.png"
                  alt="Quick Match Cards"
                  className="art-image"
                  draggable={false}
                />
                <div className="art-overlay-gradient" aria-hidden="true" />
              </div>

              {/* Right Content */}
              <div className="mode-card-details">
                <div className="mode-card-header">
                  <h2 className="mode-card-title">QUICK MATCH</h2>
                  <button
                    type="button"
                    className="mode-arrow-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartQuickMatch();
                    }}
                    aria-label="Start Quick Match"
                  >
                    <ArrowRight size={15} />
                  </button>
                </div>

                <p className="mode-card-subtitle">Find players instantly</p>

                {/* Casual / Ranked Mode Segmented Switch */}
                <div
                  className="mode-toggle-pills"
                  aria-label="Match Type"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="toggle-pill"
                    onClick={() => onComingSoon?.('casual')}
                  >
                    <Zap size={13} className="pill-icon" />
                    <span>Casual</span>
                  </button>

                  <button
                    type="button"
                    className="toggle-pill"
                    onClick={() => onComingSoon?.('ranked')}
                  >
                    <Trophy size={13} className="pill-icon" />
                    <span>Ranked</span>
                  </button>
                </div>

                <p className="mode-card-footer">2 – 4 players · Fast games</p>
              </div>
            </div>
          </article>

          {/* 2. PRIVATE TABLE BANNER */}
          <article className="mode-card private-table-card" onClick={onPrivateTable}>
            <div className="card-outer-filigree" aria-hidden="true" />
            <div className="card-inner-bevel" aria-hidden="true" />

            <div className="mode-card-layout">
              {/* Left Artwork Thumbnail */}
              <div className="mode-art-thumb">
                <img
                  src="/card-art-privatetable.png"
                  alt="Private Table Cards"
                  className="art-image"
                  draggable={false}
                />
                <div className="art-overlay-gradient" aria-hidden="true" />
              </div>

              {/* Right Content */}
              <div className="mode-card-details">
                <div className="mode-card-header">
                  <h2 className="mode-card-title">PRIVATE TABLE</h2>
                  <button
                    type="button"
                    className="mode-arrow-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPrivateTable?.();
                    }}
                    aria-label="Open Private Table"
                  >
                    <ArrowRight size={15} />
                  </button>
                </div>

                <p className="mode-card-subtitle">Create or join with friends</p>

                {/* Tag */}
                <div className="private-table-tag">
                  <Users size={14} className="tag-icon" />
                  <span>Play your way</span>
                </div>
              </div>
            </div>
          </article>

          {/* 3. PRACTICE BANNER */}
          <article className="mode-card practice-card" onClick={handleStartPractice}>
            <div className="card-outer-filigree" aria-hidden="true" />
            <div className="card-inner-bevel" aria-hidden="true" />

            <div className="mode-card-layout">
              {/* Left Artwork Thumbnail */}
              <div className="mode-art-thumb">
                <img
                  src="/card-art-practice.png"
                  alt="Practice Chess Pieces"
                  className="art-image"
                  draggable={false}
                />
                <div className="art-overlay-gradient" aria-hidden="true" />
              </div>

              {/* Right Content */}
              <div className="mode-card-details">
                <div className="mode-card-header">
                  <h2 className="mode-card-title">PRACTICE</h2>
                  <button
                    type="button"
                    className="mode-arrow-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartPractice();
                    }}
                    aria-label="Start Practice"
                  >
                    <ArrowRight size={15} />
                  </button>
                </div>

                <p className="mode-card-subtitle">Play against AI</p>

                {/* AI Difficulty Selector Plate */}
                <div className="ai-diff-selector" onClick={(e) => e.stopPropagation()}>
                  <div className="diff-label-group">
                    <Bot size={15} className="diff-bot-icon" />
                    <span>AI Difficulty</span>
                  </div>

                  <div className="diff-segments" role="radiogroup" aria-label="AI difficulty">
                    {(['easy', 'medium', 'hard'] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        role="radio"
                        aria-checked={selectedDifficulty === d}
                        className={`diff-segment ${selectedDifficulty === d ? 'active' : ''}`}
                        onClick={() => handleDifficultySelect(d)}
                      >
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="mode-card-footer">2 – 4 players · No pressure</p>
              </div>
            </div>
          </article>

          {/* ================================================================
              HOW TO PLAY BUTTON (Chamfered Plaque)
              ================================================================ */}
          <div className="home-how-to-play-wrapper">
            <button
              type="button"
              className="home-how-to-play-btn"
              onClick={onHowToPlay}
              aria-label="Learn How to Play Kamayuu"
            >
              <div className="btn-parchment-glow" aria-hidden="true" />
              <div className="btn-inner-border" aria-hidden="true" />
              <div className="btn-content-row">
                <BookOpen size={16} className="book-icon" />
                <span className="btn-text">How to Play</span>
                <ArrowRight size={15} className="arrow-icon" />
              </div>
            </button>
          </div>

          {/* ================================================================
              BOTTOM ORNAMENT DIVIDER
              ================================================================ */}
          <div className="home-bottom-divider" aria-hidden="true">
            <span className="divider-line" />
            <span className="divider-diamond">◆</span>
            <span className="divider-line" />
          </div>
        </main>
      </div>
    </div>
  );
}
