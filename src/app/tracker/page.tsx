'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Section {
  id: string;
  title: string;
  description: string;
  icon: string;
  count: number;
  href: string;
  color: string;
}

export default function TrackerPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [weapons, bullets, armor] = await Promise.all([
        fetch('/data/weapon-detail.json').then(r => r.json()),
        fetch('/data/bullet-detail.json').then(r => r.json()),
        fetch('/data/armor-detail.json').then(r => r.json()),
      ]);

      setSections([
        {
          id: 'weapons',
          title: 'Weapons',
          description: '93 weapons & 95 attachments — full stats, fire rate, recoil, ergonomics',
          icon: '🔫',
          count: (weapons.weapons?.length || 0) + (weapons.accessories?.length || 0),
          href: '/tracker/weapons',
          color: 'from-amber-500/20 to-yellow-600/10',
        },
        {
          id: 'bullets',
          title: 'Ammunition',
          description: '96 bullet types — penetration, damage, bleed, frag, velocity',
          icon: '💥',
          count: bullets.length || Object.keys(bullets).length || 96,
          href: '/tracker/bullets',
          color: 'from-red-500/20 to-orange-600/10',
        },
        {
          id: 'armor',
          title: 'Armor',
          description: '175 armor items — protection levels, ricochet, movement penalties',
          icon: '🛡️',
          count: armor.length || Object.keys(armor).length || 175,
          href: '/tracker/armor',
          color: 'from-blue-500/20 to-cyan-600/10',
        },
        {
          id: 'damage',
          title: 'Damage Overview',
          description: 'Weapon × ammo × armor damage calculations with full formulas',
          icon: '📊',
          count: 37,
          href: '/tracker/damage',
          color: 'from-purple-500/20 to-violet-600/10',
        },
        {
          id: 'ttk',
          title: 'Average Shots / TTK',
          description: '63 weapons × 13 armors — shots-to-kill, time-to-kill, probabilities',
          icon: '⏱️',
          count: 819,
          href: '/tracker/ttk',
          color: 'from-green-500/20 to-emerald-600/10',
        },
        {
          id: 'changelog',
          title: 'ChangeLog',
          description: '4 patch versions — 41 stat changes with old/new values',
          icon: '📝',
          count: 41,
          href: '/tracker/changelog',
          color: 'from-orange-500/20 to-amber-600/10',
        },
        {
          id: 'market',
          title: 'Market Catalog',
          description: '1,759 items with categories, IDs, and durability tiers',
          icon: '🏪',
          count: 1759,
          href: '/tracker/market',
          color: 'from-pink-500/20 to-rose-600/10',
        },
        {
          id: 'season',
          title: 'Season Tasks',
          description: 'S6 tasks — all 4 chapters, objectives, and rewards',
          icon: '🎯',
          count: 84,
          href: '/tracker/season',
          color: 'from-indigo-500/20 to-blue-600/10',
        },
        {
          id: 'players',
          title: 'Player Search',
          description: 'Search any player by name or UID — rank, stats, kills, match history',
          icon: '🎮',
          count: 0,
          href: '/tracker/players',
          color: 'from-[#D4AF37]/20 to-amber-600/10',
        },
        {
          id: 'simulator',
          title: 'Shooting Range',
          description: 'Simulate damage for weapon × ammo × armor combinations with live calculations',
          icon: '⚡',
          count: 0,
          href: '/tracker/simulator',
          color: 'from-red-500/20 to-rose-600/10',
        },
        {
          id: 'aim-lab',
          title: 'Aim Lab',
          description: 'Test accuracy, bullet drop & recoil patterns on a live target',
          icon: '🎯',
          count: 0,
          href: '/tracker/aim-lab',
          color: 'from-emerald-500/20 to-teal-600/10',
        },
        {
          id: 'gunsmith',
          title: 'Gunsmith',
          description: 'Build & configure weapon loadouts — saves locally, filters attachments in Aim Lab & Simulator',
          icon: '🔧',
          count: 0,
          href: '/tracker/gunsmith',
          color: 'from-[#D4AF37]/20 to-yellow-600/10',
        },
      ]);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#D4AF37] transition-colors mb-6"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Maps
          </Link>
          <h1 className="text-4xl sm:text-5xl font-bold font-display">
            <span className="text-gradient">ABI Data Tracker</span>
          </h1>
          <p className="mt-3 text-[#9CA3AF] text-lg max-w-2xl">
            Comprehensive game data mined from Arena Breakout Infinite — weapon stats,
            ammunition, armor, damage calculations, and more.
          </p>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sections.map((section) => (
              <Link
                key={section.id}
                href={section.href}
                className="group relative glass rounded-xl p-5 glow-border-hover animate-fade-in"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${section.color} rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">{section.icon}</span>
                    <span className="text-xs font-medium text-[#9CA3AF] bg-white/5 px-2.5 py-1 rounded-full">
                      {section.count.toLocaleString()} items
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-[#D4AF37] transition-colors">
                    {section.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-[#9CA3AF] leading-relaxed">
                    {section.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Footer Note */}
      <div className="border-t border-white/5 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-xs text-[#6B7280] text-center">
            Data sourced from Arena Breakout Infinite. Community-maintained reference.
          </p>
        </div>
      </div>
    </main>
  );
}
