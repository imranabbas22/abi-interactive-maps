'use client';

import { useState } from 'react';
import Link from 'next/link';

interface PlayerData {
  name: string;
  uid: string;
  level: number;
  rank: string;
  online: boolean;
  lastLogin: string;
  lastLogout: string;
  status: string;
  inParty: boolean;
  inCombat: boolean;
  partySize: string;
  overview?: {
    currentRank: string;
    seasonHighest: string;
    historicalHighest: string;
    registrationDate: string;
    loginRegion: string;
    gameDays: number;
    onlineHours: number;
    warehouseValue: string;
    collectionValue: string;
    collectionItems: string;
    reputationLevel: number;
    totalMatches: number;
    quickExtractions: number;
    outstandingActions: number;
    kills: number;
    avgSurvival: string;
  };
}

export default function PlayerSearchPage() {
  const [searchType, setSearchType] = useState<'name' | 'uid'>('name');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'basic'>('overview');

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;

    setLoading(true);
    setError('');
    setPlayer(null);

    try {
      const params = searchType === 'name'
        ? `name=${encodeURIComponent(keyword.trim())}`
        : `uid=${encodeURIComponent(keyword.trim())}`;

      const res = await fetch(`/api/player-search?${params}`);
      const data = await res.json();

      if (data.success) {
        setPlayer(data.data);
      } else {
        setError(data.error || 'Player not found');
      }
    } catch {
      setError('Failed to search. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Link
            href="/tracker"
            className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#D4AF37] transition-colors mb-6"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Tracker
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold font-display">
            <span className="text-gradient">Player Search</span>
          </h1>
          <p className="mt-2 text-[#9CA3AF]">
            Search any Arena Breakout Infinite player by name or UID
          </p>
        </div>
      </div>

      {/* Search Form */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSearch} className="glass rounded-xl p-5 space-y-4">
          {/* Tab switcher */}
          <div className="flex gap-1 bg-[#1A1A1A] rounded-lg p-1 w-fit">
            <button
              type="button"
              onClick={() => setSearchType('name')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                searchType === 'name'
                  ? 'bg-[#D4AF37] text-black'
                  : 'text-[#9CA3AF] hover:text-white'
              }`}
            >
              By Name
            </button>
            <button
              type="button"
              onClick={() => setSearchType('uid')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                searchType === 'uid'
                  ? 'bg-[#D4AF37] text-black'
                  : 'text-[#9CA3AF] hover:text-white'
              }`}
            >
              By UID
            </button>
          </div>

          {/* Input + Search */}
          <div className="flex gap-3">
            <input
              type={searchType === 'uid' ? 'text' : 'text'}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={searchType === 'name' ? 'Player name (e.g. maximusprime)' : 'Player UID (17-20 digits)'}
              className="flex-1 bg-[#111] border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-[#555] focus:border-[#D4AF37]/50 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/30 transition-all"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !keyword.trim()}
              className="px-6 py-3 bg-[#D4AF37] text-black font-semibold rounded-lg hover:bg-[#C49A2D] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Searching...
                </>
              ) : (
                'Search'
              )}
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="mt-4 glass rounded-xl p-4 border border-red-500/20">
            <div className="flex items-center gap-3">
              <span className="text-red-400">⚠</span>
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !player && (
          <div className="mt-8 glass rounded-xl p-6 animate-pulse">
            <div className="h-6 bg-white/5 rounded w-48 mb-4" />
            <div className="space-y-3">
              <div className="h-4 bg-white/5 rounded w-64" />
              <div className="h-4 bg-white/5 rounded w-56" />
              <div className="h-4 bg-white/5 rounded w-72" />
            </div>
          </div>
        )}

        {/* Player Results */}
        {player && (
          <div className="mt-8 space-y-6">
            {/* Basic Info Card */}
            <div className="glass rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">{player.name}</h2>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  player.online
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {player.online ? 'Online' : 'Offline'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard label="UID" value={player.uid} mono />
                <StatCard label="Level" value={String(player.level)} />
                <StatCard label="Rank" value={player.rank} gold />
                <StatCard label="Status" value={player.status} />
                <StatCard label="Last Login" value={player.lastLogin || '-'} />
                <StatCard label="Last Logout" value={player.lastLogout || '-'} />
                <StatCard label="In Party" value={player.inParty ? 'Yes' : 'No'} />
                <StatCard label="In Combat" value={player.inCombat ? 'Yes' : 'No'} />
                <StatCard label="Party Size" value={player.partySize || '-'} />
              </div>
            </div>

            {/* Overview Stats */}
            {player.overview && (
              <div className="glass rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">
                  <span className="text-gradient">Overview</span>
                </h3>

                {/* Player Info */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-[#D4AF37] mb-3 uppercase tracking-wide">
                    Player Info
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    <StatCard label="Current Rank" value={player.overview.currentRank} gold />
                    <StatCard label="Season Highest" value={player.overview.seasonHighest} />
                    <StatCard label="Historical Highest" value={player.overview.historicalHighest} gold />
                    <StatCard label="Registered" value={player.overview.registrationDate} />
                    <StatCard label="Login Region" value={player.overview.loginRegion} />
                    <StatCard label="Game Days" value={String(player.overview.gameDays)} />
                    <StatCard label="Online Hours" value={`${player.overview.onlineHours.toLocaleString()}h`} />
                    <StatCard label="Warehouse Value" value={player.overview.warehouseValue} gold />
                    <StatCard label="Collection Value" value={player.overview.collectionValue} />
                    <StatCard label="Collection Items" value={player.overview.collectionItems} />
                    <StatCard label="Reputation" value={`Level ${player.overview.reputationLevel}`} />
                  </div>
                </div>

                {/* Battle Stats */}
                <div>
                  <h4 className="text-sm font-medium text-[#D4AF37] mb-3 uppercase tracking-wide">
                    Battle Stats
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    <StatCard
                      label="Total Matches"
                      value={player.overview.totalMatches.toLocaleString()}
                      large
                    />
                    <StatCard
                      label="Kills"
                      value={player.overview.kills.toLocaleString()}
                      large
                      gold
                    />
                    <StatCard
                      label="Quick Extractions"
                      value={player.overview.quickExtractions.toLocaleString()}
                    />
                    <StatCard
                      label="Outstanding"
                      value={player.overview.outstandingActions.toLocaleString()}
                    />
                    <StatCard
                      label="Avg Survival"
                      value={player.overview.avgSurvival}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/5 mt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-xs text-[#6B7280] text-center">
            Player data sourced from community-maintained game reference. Search uses external proxy.
          </p>
        </div>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  gold = false,
  mono = false,
  large = false,
}: {
  label: string;
  value: string;
  gold?: boolean;
  mono?: boolean;
  large?: boolean;
}) {
  return (
    <div className="bg-[#111] rounded-lg p-3 border border-white/5">
      <p className="text-xs text-[#6B7280] mb-1">{label}</p>
      <p className={`${large ? 'text-xl' : 'text-sm'} font-semibold ${
        gold ? 'text-[#D4AF37]' : 'text-white'
      } ${mono ? 'font-mono text-xs sm:text-sm break-all' : ''}`}>
        {value}
      </p>
    </div>
  );
}
