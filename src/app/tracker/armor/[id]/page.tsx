'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

const STAT_DESC: Record<string, string> = {
  'Protection Level': 'The armor tier (Lv1-6). Higher tiers can stop higher-penetration bullets.',
  'Penetration Factor': 'Armor resistance against bullet penetration. Higher = harder to penetrate.',
  'Block Damage Scale': 'Damage multiplier when a bullet is blocked. Lower = less damage taken through armor.',
  'Pen Coefficient': 'Modifier in the penetration comparison calculation.',
  'Pen Constant': 'Constant added to the penetration comparison.',
  'Destructibility': 'Durability lost per hit. Higher = armor degrades faster.',
  'Durability': 'Maximum hit points of the armor. Higher = can absorb more damage before breaking.',
  'Factory Durability': 'Durability when purchased new from the shop or found in raid.',
  'Craftable Max': 'Maximum durability achievable when crafted via the blueprint system.',
  'Ricochet Angle': 'Angle threshold (°) for bullets to ricochet off the armor surface.',
  'Min Ricochet Chance': 'Minimum probability that a bullet hitting at the ricochet angle will bounce off.',
  'Max Ricochet Chance': 'Maximum probability that a bullet hitting at the ricochet angle will bounce off.',
  'Ricochet Cooldown': 'Cooldown in seconds before the armor can ricochet another bullet.',
  'Move Speed': 'Movement speed modifier. Negative values = slower movement.',
  'Turn Speed': 'Turning speed modifier. Negative values = slower turning.',
  'Ergonomics': 'Affects weapon handling: ADS speed, weapon swap, and aim stability.',
  'Sound Level': 'Reduces the volume of your own footsteps and actions.',
  'Sound Max Distance': 'Reduces the maximum distance your sounds can be heard.',
  'Sound Indicator Lv': 'Affects the footstep indicator level shown on the tactical map.',
  'Sound Indicator Dist': 'Affects how far away your sound indicator ping appears on the map.',
  'Flash Reduction': 'Reduces the blinding effect of flashbangs and explosions.',
  'Protect Mask': 'Bitmask indicating which body parts this armor protects.',
  'Head Detail Mask': 'Bitmask indicating which specific head zones (face, ears, nape) are protected.',
  'Broken Screen': 'Whether the visor or face shield shows visual cracks when damaged.',
};

interface ArmorItem {
  id: number;
  type?: number;
  stats?: Record<string, unknown>;
  durabilityMax?: number;
  factoryDurabilityMax?: number;
  blueprintDurabilityMax?: number;
  nativeArmorType?: string;
  assembleTag?: string;
}

export default function ArmorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [armor, setArmor] = useState<ArmorItem | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      fetch('/abi-maps/data/armor-detail.json').then(r => r.json()),
      fetch('/abi-maps/data/item_names.json').then(r => r.json()),
    ]).then(([ad, nameMap]) => {
      setNames(nameMap);
      const arr = Array.isArray(ad) ? ad : (ad.armors || ad.armor || []);
      const found = arr.find((a: ArmorItem) => String(a.id) === id);
      setArmor(found || null);
    });
  }, [id]);

  const getName = (tid: string) => names[tid] || `ID ${tid}`;

  if (!armor) {
    return (
      <main className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  const s = armor.stats || {};

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      <div className="border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/tracker/armor" className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#D4AF37] transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Armor
          </Link>
          <h1 className="text-3xl font-bold font-display text-gradient">{getName(String(armor.id))}</h1>
          <div className="flex gap-3 mt-2">
            <span className="text-sm px-2.5 py-0.5 rounded-full bg-white/5 text-[#9CA3AF]">{armor.nativeArmorType || 'Armor'}</span>
            <span className="text-sm px-2.5 py-0.5 rounded-full bg-white/5 text-[#9CA3AF]">Lv{String(s.armor_level ?? '?')}</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Protection */}
        <Section title="Protection">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard label="Protection Level" value={String(s.armor_level ?? '?')} />
            <StatCard label="Penetration Factor" value={String(s.armor_antipenetrationfactor ?? '-')} />
            <StatCard label="Block Damage Scale" value={s.armor_damagescaleforblock != null ? `${(Number(s.armor_damagescaleforblock) * 100).toFixed(0)}%` : '-'} />
            <StatCard label="Pen Coefficient" value={String(s.armor_penetrate_coefficient ?? '-')} />
            <StatCard label="Pen Constant" value={String(s.armor_penetrate_coefficient_constant ?? '-')} />
            <StatCard label="Destructibility" value={s.armor_destructibility != null ? `${(Number(s.armor_destructibility) * 100).toFixed(0)}%` : '-'} />
          </div>
        </Section>

        {/* Durability */}
        <Section title="Durability">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard label="Durability" value={armor.durabilityMax != null ? `${(armor.durabilityMax / 10).toFixed(0)}` : '-'} />
            <StatCard label="Factory Durability" value={armor.factoryDurabilityMax != null ? `${(armor.factoryDurabilityMax / 10).toFixed(0)}` : '-'} />
            <StatCard label="Craftable Max" value={armor.blueprintDurabilityMax != null ? `${(armor.blueprintDurabilityMax / 10).toFixed(0)}` : '-'} />
          </div>
        </Section>

        {/* Ricochet */}
        <Section title="Ricochet">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard label="Ricochet Angle" value={s.armor_ricochetangle ? `${s.armor_ricochetangle}°` : '-'} />
            <StatCard label="Min Ricochet Chance" value={s.armor_ricochetprobabilitymin != null ? `${(Number(s.armor_ricochetprobabilitymin) * 100).toFixed(0)}%` : '-'} />
            <StatCard label="Max Ricochet Chance" value={s.armor_ricochetprobabilitymax != null ? `${(Number(s.armor_ricochetprobabilitymax) * 100).toFixed(0)}%` : '-'} />
            <StatCard label="Ricochet Cooldown" value={s.armor_ricochetcooldown ? `${s.armor_ricochetcooldown}s` : '-'} />
          </div>
        </Section>

        {/* Mobility */}
        <Section title="Mobility & Penalties">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard label="Move Speed" value={s.MoveSpeed != null ? `${(Number(s.MoveSpeed) * 100).toFixed(0)}%` : '-'} />
            <StatCard label="Turn Speed" value={s.TurnSpeed != null ? `${(Number(s.TurnSpeed) * 100).toFixed(0)}%` : '-'} />
            <StatCard label="Ergonomics" value={String(s.Engonomics ?? '-')} />
            <StatCard label="Sound Level" value={String(s.SoundLevelInfluence ?? '-')} />
            <StatCard label="Sound Max Distance" value={String(s.SoundMaxDistanceInfluenceFactor ?? '-')} />
            <StatCard label="Flash Reduction" value={String(s.FlashTimeInfluenceFactor ?? '-')} />
          </div>
        </Section>

        {/* Hearing */}
        <Section title="Hearing">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard label="Sound Level" value={s.SoundLevelInfluence != null ? `${(Number(s.SoundLevelInfluence) * 100).toFixed(0)}%` : '-'} />
            <StatCard label="Sound Max Distance" value={s.SoundMaxDistanceInfluenceFactor != null ? `${(Number(s.SoundMaxDistanceInfluenceFactor) * 100).toFixed(0)}%` : '-'} />
            <StatCard label="Sound Indicator Lv" value={s.SoundIndicatorLevelInfluence != null ? `${(Number(s.SoundIndicatorLevelInfluence) * 100).toFixed(0)}%` : '-'} />
            <StatCard label="Sound Indicator Dist" value={s.SoundIndicatorMaxDistanceInfluenceFactor != null ? `${(Number(s.SoundIndicatorMaxDistanceInfluenceFactor) * 100).toFixed(0)}%` : '-'} />
          </div>
        </Section>

        {/* Coverage */}
        <Section title="Coverage">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard label="Protect Mask" value={String(s.armor_protectmask ?? '-')} />
            <StatCard label="Head Detail Mask" value={String(s.armor_headdetailprotectmask ?? '-')} />
            <StatCard label="Broken Screen" value={s.HasBrokenScreenEffect ? 'Yes' : 'No'} />
          </div>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-display font-bold text-white mb-3">{title}</h2>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  const desc = STAT_DESC[label];
  return (
    <div className="glass rounded-lg p-4 relative group">
      <div className="text-xs text-[#6B7280] uppercase tracking-wider mb-1 flex items-center gap-1.5">
        {label}
        {desc && (
          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-white/5 text-[8px] text-[#6B7280] cursor-help font-bold">?</span>
        )}
      </div>
      <div className="text-lg font-semibold font-mono text-white">{value}</div>
      {desc && (
        <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-xs text-[#9CA3AF] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl">
          {desc}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1a1a1a]" />
        </div>
      )}
    </div>
  );
}
