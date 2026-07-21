'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Weapon {
  id: number;
  caliber?: string;
  name?: string;
  fireIntervalValue?: number;
  stats?: Record<string, unknown>;
  damageDistance?: Record<string, unknown>;
  [key: string]: unknown;
}

function formatCaliber(cal: string): string {
  if (!cal) return '-';
  // Handle formats: "762x39mm" → "7.62×39mm", "545x39mm" → "5.45×39mm"
  const m = cal.match(/^(\d+)(x)(\d+)(.*)/i);
  if (m) {
    const first = m[1].length > 3 ? m[1] : m[1].padStart(3, '0');
    const firstFmt = first.length > 3 ? `${first.slice(0, -2)}.${first.slice(-2)}` : `${first.slice(0, 1)}.${first.slice(1)}`;
    return `${firstFmt}×${m[3]}${m[4]}`;
  }
  return cal;
}

function calcRPM(stats: Record<string, unknown> | undefined): number {
  if (!stats) return 0;
  return Number(stats.FireRate) || 0;
}

export default function WeaponsPage() {
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    Promise.all([
      fetch('/data/weapon-detail.json').then(r => r.json()),
      fetch('/data/item_names.json').then(r => r.json()),
    ]).then(([wd, nameMap]) => {
      setNames(nameMap);
      const all = (wd.weapons || []) as Weapon[];
      setWeapons(all);
    });
  }, []);

  const getWeaponName = (w: Weapon): string => {
    return names[String(w.id)] || `ID ${w.id}`;
  };

  const filtered = weapons
    .filter(w => !search || getWeaponName(w).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      const an = getWeaponName(a), bn = getWeaponName(b);
      if (sortBy === 'name') cmp = an.localeCompare(bn);
      else if (sortBy === 'fireRate') cmp = calcRPM(a.stats) - calcRPM(b.stats);
      else if (sortBy === 'caliber') cmp = formatCaliber(a.caliber || '').localeCompare(formatCaliber(b.caliber || ''));
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

  const rpm = (w: Weapon) => {
    const r = calcRPM(w.stats);
    return r > 0 ? r : '-';
  };
  const hRecoil = (w: Weapon): number => Number(w.stats?.HorizontalRecoil) || 0;
  const vRecoil = (w: Weapon): number => Number(w.stats?.VerticalRecoil) || 0;

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      <div className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/tracker" className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#D4AF37] transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Tracker
          </Link>
          <h1 className="text-3xl font-bold font-display text-gradient">Weapons</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">{weapons.length} weapons</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <input
          type="text" placeholder="Search weapons..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-80 glass rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#6B7280] outline-none focus:border-[#D4AF37]/50 transition-colors"
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 overflow-x-auto">
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left py-3 px-4 text-[#9CA3AF] font-medium cursor-pointer hover:text-[#D4AF37]" onClick={() => toggleSort('name')}>Name <SortIcon field="name" /></th>
                <th className="text-left py-3 px-4 text-[#9CA3AF] font-medium cursor-pointer hover:text-[#D4AF37]" onClick={() => toggleSort('caliber')}>Caliber <SortIcon field="caliber" /></th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium cursor-pointer hover:text-[#D4AF37]" onClick={() => toggleSort('fireRate')}>RPM <SortIcon field="fireRate" /></th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium">H-Rec / V-Rec</th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium">Pen Lv</th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium">Velocity</th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium">Range</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w, i) => (
                <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 px-4">
                    <Link href={`/tracker/weapons/${w.id}`} className="text-white font-medium hover:text-[#D4AF37] transition-colors">
                      {getWeaponName(w)}
                    </Link>
                  </td>
                  <td className="py-2.5 px-4 text-[#9CA3AF]">{formatCaliber(w.caliber || '')}</td>
                  <td className="py-2.5 px-4 text-right text-white font-mono">{rpm(w)}</td>
                  <td className="py-2.5 px-4 text-right text-white font-mono">{hRecoil(w)} / {vRecoil(w)}</td>
                  <td className="py-2.5 px-4 text-right text-white font-mono">{String(w.stats?.PenetrationLevel ?? '-')}</td>
                  <td className="py-2.5 px-4 text-right text-white font-mono">{w.stats?.MuzzleVelocity ? `${w.stats.MuzzleVelocity} m/s` : '-'}</td>
                  <td className="py-2.5 px-4 text-right text-white font-mono">
                    {w.damageDistance?.damageModifyZeroDistance ? `${Math.round(Number(w.damageDistance.damageModifyZeroDistance) / 100)}m` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
