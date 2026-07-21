'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface MarketItem {
  major_id: number;
  major_name: string;
  minor_id: number;
  minor_name: string;
  item_id: number;
  durability: number;
  on_the_shelf: number;
}

interface Major {
  id: number;
  name?: string;
  minors?: { id: number; name?: string; items?: { id: number; durability?: number; onTheShelf?: number }[] }[];
}

export default function MarketPage() {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/abi-maps/data/marketPageConfig.json').then(r => r.json()),
      fetch('/abi-maps/data/item_names.json').then(r => r.json()),
    ]).then(([config, n]) => {
      setNames(n);
      const cats: MarketItem[] = [];
      (config.majors || []).forEach((major: Major) => {
        (major.minors || []).forEach((minor) => {
          (minor.items || []).forEach((item) => {
            cats.push({
              major_id: major.id,
              major_name: n[String(major.id)] || `Major ${major.id}`,
              minor_id: minor.id || 0,
              minor_name: n[String(minor.id)] || '',
              item_id: item.id,
              durability: item.durability || 0,
              on_the_shelf: item.onTheShelf ?? 1,
            });
          });
        });
      });
      setItems(cats);
    });
  }, []);

  const filtered = items.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return i.major_name.toLowerCase().includes(q) ||
      i.minor_name.toLowerCase().includes(q) ||
      names[String(i.item_id)]?.toLowerCase().includes(q) ||
      String(i.item_id).includes(q);
  });

  // Group by major
  const byMajor: Record<string, MarketItem[]> = {};
  filtered.forEach(i => {
    const key = `${i.major_id}|${i.major_name}`;
    if (!byMajor[key]) byMajor[key] = [];
    byMajor[key].push(i);
  });

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      <div className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/tracker" className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#D4AF37] transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Tracker
          </Link>
          <h1 className="text-3xl font-bold font-display text-gradient">Market Catalog</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">{items.length} items across {Object.keys(byMajor).length} categories</p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <input type="text" placeholder="Search items, categories, or IDs..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-96 glass rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#6B7280] outline-none focus:border-[#D4AF37]/50 transition-colors" />
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 space-y-4">
        {Object.entries(byMajor).map(([key, cats]) => {
          const [_, name] = key.split('|');
          return (
            <details key={key} className="glass rounded-xl overflow-hidden">
              <summary className="px-4 py-3 text-white font-medium cursor-pointer hover:bg-white/[0.02] transition-colors">{name} ({cats.length} items)</summary>
              <div className="overflow-x-auto border-t border-white/5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.02]">
                      <th className="text-left py-2 px-4 text-[#9CA3AF] font-medium">Item ID</th>
                      <th className="text-left py-2 px-4 text-[#9CA3AF] font-medium">Name</th>
                      <th className="text-left py-2 px-4 text-[#9CA3AF] font-medium">Minor Category</th>
                      <th className="text-right py-2 px-4 text-[#9CA3AF] font-medium">Durability</th>
                      <th className="text-center py-2 px-4 text-[#9CA3AF] font-medium">Shelf</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cats.map((item, i) => (
                      <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                        <td className="py-1.5 px-4 text-[#9CA3AF] font-mono text-xs">{item.item_id}</td>
                        <td className="py-1.5 px-4 text-white">{names[String(item.item_id)] || `Item ${item.item_id}`}</td>
                        <td className="py-1.5 px-4 text-[#6B7280] text-xs">{item.minor_name || `Minor ${item.minor_id}`}</td>
                        <td className="py-1.5 px-4 text-right text-white font-mono">{item.durability}</td>
                        <td className="py-1.5 px-4 text-center">{item.on_the_shelf ? '✅' : '❌'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
      </div>
    </main>
  );
}
