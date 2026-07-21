'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function SeasonPage() {
  const [html, setHtml] = useState('');

  useEffect(() => {
    fetch('/data/season-tasks.txt').then(r => r.text()).then(setHtml).catch(() => setHtml(''));
  }, []);

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      <div className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/tracker" className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#D4AF37] transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Tracker
          </Link>
          <h1 className="text-3xl font-bold font-display text-gradient">Season Tasks</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">S6 Season — all chapters</p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="glass rounded-xl p-6">
          <p className="text-[#9CA3AF] mb-4">Season tasks data was extracted from the game website. The original page contains complex interactive SVG elements for the 3×3 task grid.</p>
          <a href="/data/season-tasks.txt" target="_blank" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#D4AF37]/10 text-[#D4AF37] hover:bg-[#D4AF37]/20 transition-colors text-sm">
            View raw task data
          </a>
        </div>
      </div>
    </main>
  );
}
