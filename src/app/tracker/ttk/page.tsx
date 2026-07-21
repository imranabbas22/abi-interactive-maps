'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface TTKItem {
  weapon_combo: string;
  armor_name: string;
  data: string;
  parsed?: { avg_shots?: number; avg_seconds?: number; min_shots?: number; max_shots?: number; [key: string]: unknown };
}

export default function TTKPage() {
  const [items, setItems] = useState<TTKItem[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/abi-maps/data/avg_shots.json').then(r => r.json()).then(setItems);
  }, []);

  // Group by weapon
  const byWeapon: Record<string, TTKItem[]> = {};
  items.forEach(i => {
    if (!byWeapon[i.weapon_combo]) byWeapon[i.weapon_combo] = [];
    byWeapon[i.weapon_combo].push(i);
  });

  const weaponKeys = Object.keys(byWeapon).filter(k => !search || k.toLowerCase().includes(search.toLowerCase()));

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      <div className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/tracker" className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#D4AF37] transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Tracker
          </Link>
          <h1 className="text-3xl font-bold font-display text-gradient">Average Shots / TTK</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">{Object.keys(byWeapon).length} weapon combos × {items.length > 0 ? Math.round(items.length / Object.keys(byWeapon).length) : 13} armor types</p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <input type="text" placeholder="Search weapons..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-80 glass rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#6B7280] outline-none focus:border-[#D4AF37]/50 transition-colors" />
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 space-y-3">
        {weaponKeys.slice(0, 100).map(key => (
          <details key={key} className="glass rounded-xl overflow-hidden">
            <summary className="px-4 py-3 text-white font-medium cursor-pointer hover:bg-white/[0.02] transition-colors">{key}</summary>
            <div className="overflow-x-auto border-t border-white/5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.02]">
                    <th className="text-left py-2 px-3 text-[#9CA3AF] font-medium">Armor</th>
                    <th className="text-right py-2 px-3 text-[#9CA3AF] font-medium">Avg Shots</th>
                    <th className="text-right py-2 px-3 text-[#9CA3AF] font-medium">Avg Time</th>
                    <th className="text-right py-2 px-3 text-[#9CA3AF] font-medium">Min</th>
                    <th className="text-right py-2 px-3 text-[#9CA3AF] font-medium">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {byWeapon[key].map((item, j) => {
                    const armorName = item.armor_name?.split(' Lv')[0] || item.armor_name;
                    // Parse data string
                    const m = item.data.match(/平均\s+([\d.]+)\s*發.*?平均\s+([\d.]+)\s*秒.*?最少\s+(\d+)發.*?最大\s+(\d+)發/);
                    return (
                      <tr key={j} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                        <td className="py-1.5 px-3 text-white">{armorName}</td>
                        <td className="py-1.5 px-3 text-right text-white font-mono">{m ? m[1] : '-'}</td>
                        <td className="py-1.5 px-3 text-right text-white font-mono">{m ? `${m[2]}s` : '-'}</td>
                        <td className="py-1.5 px-3 text-right text-white font-mono">{m ? m[3] : '-'}</td>
                        <td className="py-1.5 px-3 text-right text-white font-mono">{m ? m[4] : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </main>
  );
}
