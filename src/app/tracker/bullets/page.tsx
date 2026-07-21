'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AmmoStats {
  BaseDamage?: number;
  ArmorDamage?: number;
  BaseSpeed?: number;
  PenetrationLevel?: number;
  PenetrationFactor?: number;
  BleedProbabilityForPenetration?: number;
  BleedProbabilityForBlock?: number;
  BleedProbabilityForBody?: number;
  ShotsInOneBullet?: number;
  BrokenProbability?: number;
  [key: string]: unknown;
}

interface Bullet {
  id: number;
  caliber?: string;
  name?: string;
  stats?: AmmoStats;
  [key: string]: unknown;
}

function fmtCal(cal: string): string {
  if (!cal) return '-';
  const m = cal.match(/^(\d+)(x)(\d+.*)/i);
  if (m) {
    const f = m[1].length > 3 ? `${m[1].slice(0, -2)}.${m[1].slice(-2)}` : `${m[1].slice(0, 1)}.${m[1].slice(1)}`;
    return `${f}×${m[3]}`;
  }
  return cal;
}

export default function BulletsPage() {
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    Promise.all([
      fetch('/data/bullet-detail.json').then(r => r.json()),
      fetch('/data/item_names.json').then(r => r.json()),
    ]).then(([bd, nameMap]) => {
      setNames(nameMap);
      const arr = Array.isArray(bd) ? bd : (bd.bullets || []);
      setBullets(arr.filter((v: unknown): v is Bullet => !!v));
    });
  }, []);

  const getName = (b: Bullet): string => names[String(b.id)] || `ID ${b.id}`;

  const filtered = bullets
    .filter(b => !search || getName(b).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = getName(a).localeCompare(getName(b));
      else if (sortBy === 'pen') cmp = (a.stats?.PenetrationFactor || 0) - (b.stats?.PenetrationFactor || 0);
      else if (sortBy === 'penLevel') cmp = (a.stats?.PenetrationLevel || 0) - (b.stats?.PenetrationLevel || 0);
      else if (sortBy === 'damage') cmp = (a.stats?.BaseDamage || 0) - (b.stats?.BaseDamage || 0);
      else if (sortBy === 'armorDamage') cmp = (a.stats?.ArmorDamage || 0) - (b.stats?.ArmorDamage || 0);
      else if (sortBy === 'velocity') cmp = (a.stats?.BaseSpeed || 0) - (b.stats?.BaseSpeed || 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const toggleSort = (field: string) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: string }) => (
    <span className={sortBy === field ? 'text-[#D4AF37] ml-1' : 'text-[#4B5563] ml-1'}>
      {sortBy === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      <div className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/tracker" className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#D4AF37] transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Tracker
          </Link>
          <h1 className="text-3xl font-bold font-display text-gradient">Ammunition</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">{bullets.length} bullet types</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <input type="text" placeholder="Search ammo..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-80 glass rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#6B7280] outline-none focus:border-[#D4AF37]/50 transition-colors" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 overflow-x-auto">
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left py-3 px-4 text-[#9CA3AF] font-medium cursor-pointer hover:text-[#D4AF37]" onClick={() => toggleSort('name')}>Name <SortIcon field="name" /></th>
                <th className="text-left py-3 px-4 text-[#9CA3AF] font-medium">Caliber</th>
                <th className="text-center py-3 px-4 text-[#9CA3AF] font-medium cursor-pointer hover:text-[#D4AF37]" onClick={() => toggleSort('penLevel')}>Pen Lv <SortIcon field="penLevel" /></th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium cursor-pointer hover:text-[#D4AF37]" onClick={() => toggleSort('pen')}>Penetration <SortIcon field="pen" /></th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium cursor-pointer hover:text-[#D4AF37]" onClick={() => toggleSort('damage')}>Base DMG <SortIcon field="damage" /></th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium cursor-pointer hover:text-[#D4AF37]" onClick={() => toggleSort('armorDamage')}>Armor DMG <SortIcon field="armorDamage" /></th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium cursor-pointer hover:text-[#D4AF37]" onClick={() => toggleSort('velocity')}>Velocity <SortIcon field="velocity" /></th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium">Bleed</th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium">Pellets</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b, i) => (
                <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 px-4 text-white font-medium">{getName(b)}</td>
                  <td className="py-2.5 px-4 text-[#9CA3AF]">{fmtCal(b.caliber || '')}</td>
                  <td className="py-2.5 px-4 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                      (b.stats?.PenetrationLevel || 0) >= 6 ? 'bg-red-500/20 text-red-400' :
                      (b.stats?.PenetrationLevel || 0) >= 4 ? 'bg-orange-500/20 text-orange-400' :
                      (b.stats?.PenetrationLevel || 0) >= 2 ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>Lv{b.stats?.PenetrationLevel ?? '?'}</span>
                  </td>
                  <td className="py-2.5 px-4 text-right text-white font-mono">{b.stats?.PenetrationFactor ?? '-'}</td>
                  <td className="py-2.5 px-4 text-right text-white font-mono">{b.stats?.BaseDamage ?? '-'}</td>
                  <td className="py-2.5 px-4 text-right text-white font-mono">{b.stats?.ArmorDamage ?? '-'}</td>
                  <td className="py-2.5 px-4 text-right text-white font-mono">{b.stats?.BaseSpeed ? `${(b.stats.BaseSpeed / 100).toFixed(0)} m/s` : '-'}</td>
                  <td className="py-2.5 px-4 text-right text-white font-mono">
                    {b.stats?.BleedProbabilityForPenetration != null ? `${(b.stats.BleedProbabilityForPenetration * 100).toFixed(0)}%` : '-'}
                  </td>
                  <td className="py-2.5 px-4 text-right text-white font-mono">{b.stats?.ShotsInOneBullet || 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
