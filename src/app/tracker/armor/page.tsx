'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ArmorStats {
  armor_level?: number;
  armor_antipenetrationfactor?: number;
  armor_damagescaleforblock?: number;
  armor_destructibility?: number;
  armor_ricochetangle?: number;
  armor_ricochetprobabilitymin?: number;
  armor_ricochetprobabilitymax?: number;
  armor_ricochetcooldown?: number;
  armor_penetrate_coefficient?: number;
  armor_penetrate_coefficient_constant?: number;
  armor_protectmask?: number;
  armor_headdetailprotectmask?: number;
  MoveSpeed?: number;
  TurnSpeed?: number;
  Engonomics?: number;
  SoundLevelInfluence?: number;
  SoundMaxDistanceInfluenceFactor?: number;
  SoundIndicatorLevelInfluence?: number;
  SoundIndicatorMaxDistanceInfluenceFactor?: number;
  FlashTimeInfluenceFactor?: number;
  HasBrokenScreenEffect?: number;
  [key: string]: unknown;
}

interface ArmorItem {
  id: number;
  type?: number;
  stats?: ArmorStats;
  durabilityMax?: number;
  factoryDurabilityMax?: number;
  blueprintDurabilityMax?: number;
  nativeArmorType?: string;
  assembleTag?: string;
}

export default function ArmorPage() {
  const [armors, setArmors] = useState<ArmorItem[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [filterLv, setFilterLv] = useState(-1);
  const [armorFilter, setArmorFilter] = useState<'all' | 'Helmet' | 'Vest'>('all');

  useEffect(() => {
    Promise.all([
      fetch('/abi-maps/data/armor-detail.json').then(r => r.json()),
      fetch('/abi-maps/data/item_names.json').then(r => r.json()),
    ]).then(([ad, nameMap]) => {
      setNames(nameMap);
      const arr = Array.isArray(ad) ? ad : (ad.armors || ad.armor || []);
      setArmors(arr.filter((v: unknown): v is ArmorItem => !!v));
    });
  }, []);

  const getName = (a: ArmorItem): string => names[String(a.id)] || `ID ${a.id}`;

  const isHelmet = (a: ArmorItem) => a.nativeArmorType === 'Helmet';
  const isVest = (a: ArmorItem) => a.nativeArmorType === 'Vest' || (!a.nativeArmorType && a.type === 0);

  const filtered = armors.filter((a): a is ArmorItem => {
    if (!a) return false;
    if (search && !getName(a).toLowerCase().includes(search.toLowerCase())) return false;
    if (filterLv >= 0 && (a.stats?.armor_level ?? -1) !== filterLv) return false;
    if (armorFilter === 'Helmet' && !isHelmet(a)) return false;
    if (armorFilter === 'Vest' && !isVest(a)) return false;
    return true;
  }).sort((a, b) => (b.stats?.armor_level || 0) - (a.stats?.armor_level || 0));

  const levels = [...new Set(armors.map(a => a.stats?.armor_level).filter((l): l is number => l != null))].sort((a, b) => b - a);

  const helmetCount = armors.filter(isHelmet).length;
  const vestCount = armors.filter(isVest).length;

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      <div className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/tracker" className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#D4AF37] transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Tracker
          </Link>
          <h1 className="text-3xl font-bold font-display text-gradient">Armor</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">{armors.length} items · {helmetCount} helmets · {vestCount} vests</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap gap-3 items-center">
        <input type="text" placeholder="Search armor..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-72 glass rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#6B7280] outline-none focus:border-[#D4AF37]/50 transition-colors" />
        <div className="flex gap-1.5">
          <button onClick={() => setArmorFilter('all')} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${armorFilter === 'all' ? 'bg-[#D4AF37] text-black' : 'glass text-[#9CA3AF] hover:text-white'}`}>All</button>
          <button onClick={() => setArmorFilter('Helmet')} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${armorFilter === 'Helmet' ? 'bg-[#D4AF37] text-black' : 'glass text-[#9CA3AF] hover:text-white'}`}>Helmets ({helmetCount})</button>
          <button onClick={() => setArmorFilter('Vest')} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${armorFilter === 'Vest' ? 'bg-[#D4AF37] text-black' : 'glass text-[#9CA3AF] hover:text-white'}`}>Vests ({vestCount})</button>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setFilterLv(-1)} className={`px-2 py-1 rounded text-xs transition-colors ${filterLv === -1 ? 'bg-[#D4AF37] text-black' : 'bg-white/5 text-[#9CA3AF] hover:text-white'}`}>All Lv</button>
          {levels.map(lv => (
            <button key={lv} onClick={() => setFilterLv(lv)} className={`px-2 py-1 rounded text-xs transition-colors ${filterLv === lv ? 'bg-[#D4AF37] text-black' : 'bg-white/5 text-[#9CA3AF] hover:text-white'}`}>Lv{lv}</button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 overflow-x-auto">
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left py-3 px-4 text-[#9CA3AF] font-medium">Name</th>
                <th className="text-center py-3 px-4 text-[#9CA3AF] font-medium">Level</th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium">Protection</th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium">Durability</th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium">Block DMG</th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium">Destruct.</th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium">Ricochet</th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium">Move</th>
                <th className="text-right py-3 px-4 text-[#9CA3AF] font-medium">Ergo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => {
                const s = a.stats || {};
                const name = getName(a);
                return (
                  <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                    <td className="py-2 px-4">
                      <Link href={`/tracker/armor/${a.id}`} className="text-white font-medium hover:text-[#D4AF37] transition-colors">
                        {name}
                      </Link>
                    </td>
                    <td className="py-2 px-4 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                        (s.armor_level || 0) >= 6 ? 'bg-red-500/20 text-red-400' :
                        (s.armor_level || 0) >= 4 ? 'bg-orange-500/20 text-orange-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>Lv{s.armor_level ?? '?'}</span>
                    </td>
                    <td className="py-2 px-4 text-right text-white font-mono">{s.armor_antipenetrationfactor ?? '-'}</td>
                    <td className="py-2 px-4 text-right text-white font-mono">{a.durabilityMax != null ? `${(a.durabilityMax / 10).toFixed(0)}` : '-'}</td>
                    <td className="py-2 px-4 text-right text-white font-mono">{s.armor_damagescaleforblock ?? '-'}</td>
                    <td className="py-2 px-4 text-right text-white font-mono">{s.armor_destructibility ?? '-'}</td>
                    <td className="py-2 px-4 text-right text-white font-mono">{s.armor_ricochetangle ? `${s.armor_ricochetangle}°` : '-'}</td>
                    <td className="py-2 px-4 text-right text-white font-mono">{s.MoveSpeed != null ? `${(Number(s.MoveSpeed) * 100).toFixed(0)}%` : '-'}</td>
                    <td className="py-2 px-4 text-right text-white font-mono">{s.Engonomics ?? s.Engonomics ?? '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
