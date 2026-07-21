'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Change {
  version: string;
  date: string;
  category: string;
  item_name: string;
  field_name: string;
  old_value: string;
  new_value: string;
}

export default function ChangelogPage() {
  const [changes, setChanges] = useState<Change[]>([]);

  useEffect(() => {
    fetch('/abi-maps/data/changelog.json').then(r => r.json()).then(setChanges);
  }, []);

  const byVersion: Record<string, Change[]> = {};
  changes.forEach(c => {
    const v = c.version || 'Unknown';
    if (!byVersion[v]) byVersion[v] = [];
    byVersion[v].push(c);
  });

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      <div className="border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/tracker" className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#D4AF37] transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Tracker
          </Link>
          <h1 className="text-3xl font-bold font-display text-gradient">ChangeLog</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">{changes.length} changes across {Object.keys(byVersion).length} patch versions</p>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {Object.entries(byVersion).map(([version, items]) => (
          <div key={version} className="glass rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5">
              <h2 className="text-lg font-display font-bold text-[#D4AF37]">{version || 'Unknown Version'}</h2>
              <p className="text-xs text-[#6B7280]">{items.length} changes</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.02]">
                  <th className="text-left py-2 px-4 text-[#9CA3AF] font-medium">Item</th>
                  <th className="text-left py-2 px-4 text-[#9CA3AF] font-medium">Field</th>
                  <th className="text-left py-2 px-4 text-[#9CA3AF] font-medium">Old</th>
                  <th className="text-left py-2 px-4 text-[#9CA3AF] font-medium">New</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c, i) => (
                  <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                    <td className="py-2 px-4 text-white font-medium">{c.item_name}</td>
                    <td className="py-2 px-4 text-[#9CA3AF]">{c.field_name}</td>
                    <td className="py-2 px-4 text-red-400">{c.old_value}</td>
                    <td className="py-2 px-4 text-green-400">{c.new_value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </main>
  );
}
