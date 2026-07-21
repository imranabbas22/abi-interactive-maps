'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DamageItem {
  weapon_combo: string;
  damage_modifier: string;
  ammo_name: string;
  pen_level: string;
  armor_level: string;
  head_shots: string;
  chest_shots: string;
  formula: string;
}

export default function DamagePage() {
  const [items, setItems] = useState<DamageItem[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/abi-maps/data/damage_overview.json').then(r => r.json()).then(setItems);
  }, []);

  const filtered = items.filter(i => !search || i.weapon_combo.toLowerCase().includes(search.toLowerCase()) || i.ammo_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      <div className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/tracker" className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#D4AF37] transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Tracker
          </Link>
          <h1 className="text-3xl font-bold font-display text-gradient">Damage Overview</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">{items.length} weapon × ammo × armor calculations</p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-80 glass rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#6B7280] outline-none focus:border-[#D4AF37]/50 transition-colors" />
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 overflow-x-auto">
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left py-3 px-4 text-[#9CA3AF] font-medium">Weapon</th>
                <th className="text-left py-3 px-4 text-[#9CA3AF] font-medium">DMG Mod</th>
                <th className="text-left py-3 px-4 text-[#9CA3AF] font-medium">Ammo</th>
                <th className="text-center py-3 px-4 text-[#9CA3AF] font-medium">Pen</th>
                <th className="text-center py-3 px-4 text-[#9CA3AF] font-medium">Armor</th>
                <th className="text-center py-3 px-4 text-[#9CA3AF] font-medium">Head</th>
                <th className="text-center py-3 px-4 text-[#9CA3AF] font-medium">Chest</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => (
                <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 px-4 text-white font-medium">{item.weapon_combo}</td>
                  <td className="py-2.5 px-4 text-sm">{item.damage_modifier}</td>
                  <td className="py-2.5 px-4 text-[#9CA3AF] text-xs max-w-xs truncate">{item.ammo_name}</td>
                  <td className="py-2.5 px-4 text-center"><span className={`px-2 py-0.5 rounded text-xs font-bold ${Number(item.pen_level) >= 6 ? 'bg-red-500/20 text-red-400' : Number(item.pen_level) >= 4 ? 'bg-orange-500/20 text-orange-400' : 'bg-yellow-500/20 text-yellow-400'}`}>Lv{item.pen_level}</span></td>
                  <td className="py-2.5 px-4 text-center"><span className="px-2 py-0.5 rounded text-xs font-bold bg-white/10 text-white">Lv{item.armor_level}</span></td>
                  <td className="py-2.5 px-4 text-center text-green-400 font-bold">{item.head_shots}</td>
                  <td className="py-2.5 px-4 text-center text-orange-400 font-bold">{item.chest_shots}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
