'use client';

import { useState } from 'react';
import Link from 'next/link';

// ── Threshold data from Skrux DURABILITY sheet (updated 15/04/2026) ──
// [name, armorId, factoryMaxDur, wornMin, likeNewMin, category, material, marketPrice]
const THRESHOLD_DATA: [string, number, number, number, number, string, string, number][] = [
  // ── Vests ──
  ['H-LC Tactical Body Armor', 301060004, 70, 49, 56, 'Vest', 'Composite', 354879],
  ['BT6 Heavy Body Armor', 301060010, 90, 63, 69, 'Vest', 'Titanium', 662904],
  ['IMTV Samurai Standard Body Armor', 301060014, 70, 49, 54, 'Vest', 'Aluminum', 414414],
  ['IMTV Samurai Assault Body Armor', 301060015, 80, 56, 61, 'Vest', 'Aluminum', 432601],
  ['IMTV Samurai Full Protection Body Armor', 301060016, 90, 63, 69, 'Vest', 'Aluminum', 404699],
  ['926 Composite Body Armor', 301060017, 70, 49, 56, 'Vest', 'Composite', 335014],
  ['Defender M4 Heavy Body Armor', 301060020, 80, 56, 65, 'Vest', 'Hardened steel', 337445],
  ['Marshal Heavy Body Armor', 301060006, 115, 80, 98, 'Vest', 'Ceramic', 1155000],
  ['BT101 Tactical Body Armor', 301060011, 100, 70, 85, 'Vest', 'Ceramic', 1375189],
  ['KN Composite Body Armor', 301060026, 110, 77, 94, 'Vest', 'Ceramic', 1771381],
  ['6B45 Heavy Body Armor', 301060027, 120, 84, 98, 'Vest', 'Hardened steel', 1148879],
  ['BT201 Full Body Armor', 301060032, 125, 88, 97, 'Vest', 'Aluminum', 1463000],

  // ── Armored Rigs ──
  ['Warrior Heavy Armored Chest Rig', 301010203, 55, 38, 43, 'Rig', 'Composite', 295236],
  ['H-Tac A8 Armored Rig', 301010209, 60, 42, 48, 'Rig', 'Composite', 267221],
  ['H-Tac A9 Armored Rig', 301010210, 65, 46, 56, 'Rig', 'Ceramic', 272557],
  ['Defender M4 Heavy Armored Rig', 301010213, 100, 70, 82, 'Rig', 'Hardened steel', 374220],
  ['Spartan C Heavy Armored Rig', 301010201, 100, 70, 82, 'Rig', 'Hardened steel', 1000349],
  ['AVS Heavy Armored Rig', 301010211, 90, 63, 77, 'Rig', 'Ceramic', 994455],
  ['AL Assault Armored Rig', 301010222, 90, 63, 73, 'Rig', 'Composite', 1175753],
  ['AL Tactical Armored Rig', 301010223, 95, 66, 77, 'Rig', 'Ceramic', 1082682],
  ['AL Commander Armored Rig', 301010224, 100, 70, 82, 'Rig', 'Hardened steel', 1228065],

  // ── Helmets ──
  ['FA Assault Tactical Helmet', 301040010, 50, 35, 40, 'Helmet', 'Composite', 233749],
  ['03 Heavy Tactical Helmet', 301040026, 45, 32, 36, 'Helmet', 'Composite', 413598],
  ['RSP Heavy Tactical Helmet', 301040027, 55, 38, 43, 'Helmet', 'Composite', 277849],
  ['SH50 Military Helmet', 301040028, 60, 42, 49, 'Helmet', 'Hardened steel', 208978],
  ['SH Matzka 2 Helmet', 301040029, 65, 46, 54, 'Helmet', 'Hardened steel', 317764],
  ['SH60 Military Helmet', 301040033, 50, 35, 40, 'Helmet', 'Composite', 202752],
  ['AN95 Heavy Blast Helmet', 301040036, 55, 38, 42, 'Helmet', 'Titanium', 479952],
  ['6BNT Helmet', 301040005, 75, 52, 61, 'Helmet', 'Hardened steel', 641966],
  ['IND50 Heavy Tactical Helmet', 301040048, 60, 42, 48, 'Helmet', 'Composite', 640000],
  ['SH65 Military Helmet', 301040032, 65, 46, 52, 'Helmet', 'Composite', 770000],
  ['RST Special Forces Helmet', 301040034, 75, 52, 57, 'Helmet', 'Aluminum', 727214],
  ['HG84 Offensive Helmet', 301040006, 70, 49, 56, 'Helmet', 'Composite', 363752],
  ['DOD9 Blast Helmet', 301040008, 75, 52, 59, 'Helmet', 'Composite', 761191],
  ['AS200 Heavy Tactical Helmet', 301040014, 65, 46, 49, 'Helmet', 'Polyethylene', 679800],
  ['IND70 Tactical Helmet', 301040035, 80, 56, 60, 'Helmet', 'Polyethylene', 1463000],

  // ── Face Masks ──
  ['SH Matzka Mask', 301050007, 50, 35, 41, 'Mask', 'Hardened steel', 94304],
  ['SH65 Military Mask A', 301050009, 55, 38, 49, 'Mask', 'Glass', 30096],
  ['SH65 Military Mask B', 301050011, 65, 49, 56, 'Mask', 'Composite', 125400],
  ['6BNT Blast Mask', 301050006, 70, 46, 54, 'Mask', 'Hardened steel', 115236],
  ['RST Special Forces Mask', 301050013, 70, 49, 54, 'Mask', 'Aluminum', 276091],
];

// Repair coef by material (skrux sheet)
const REPAIR_COEF: Record<string, number> = {
  'Composite': 0.119,
  'Aramid': 0.045,
  'Polyethylene': 0.06,
  'Titanium': 0.085,
  'Aluminum': 0.089,
  'Hardened steel': 0.145,
  'Ceramic': 0.18,
  'Glass': 0.225,
};

// Durability lost per repair = factory max × coef × 0.85 (rounded to 1 dp)
// Verified on 8 live samples incl. H-Tac A9 ceramic (65 × 0.18 × 0.85 = 9.945 → 55.1 after repair)
function calcRepairLoss(factoryMax: number, material: string): number {
  const coef = REPAIR_COEF[material] ?? 0.1;
  return Math.round(factoryMax * coef * 0.85 * 10) / 10;
}

// Armor tier per item (from armor-detail.json extract) — drives the repair FEE rate
const ARMOR_TIER: Record<number, number> = {
  301060004: 5, 301060010: 5, 301060014: 5, 301060015: 5, 301060016: 5, 301060017: 5, 301060020: 5,
  301060006: 6, 301060011: 6, 301060026: 6, 301060027: 6, 301060032: 6,
  301010203: 5, 301010209: 5, 301010210: 5, 301010213: 5, 301010201: 6, 301010211: 6, 301010222: 6,
  301010223: 6, 301010224: 6,
  301040010: 5, 301040026: 5, 301040027: 5, 301040028: 5, 301040029: 5, 301040033: 5, 301040036: 5,
  301040005: 6, 301040048: 6, 301040032: 6, 301040034: 6, 301040006: 6, 301040008: 6, 301040014: 6,
  301040035: 6,
  301050007: 5, 301050009: 5, 301050011: 6, 301050006: 6, 301050013: 6,
};

// Repair fee rate per tier (verified live samples — material does NOT affect the fee):
//   T5 ≈ 2,000/pt: RSP 2,056 · Def M4 2,041 · H-Tac A9 2,006 · IMTV 1,978
//   T6 ≈ 2,800/pt: Spartan C 2,842 · AS200 2,769
const TIER_FEE_RATE: Record<number, number> = { 5: 2000, 6: 2800 };

type SellCategory = 'full' | 'like_new' | 'worn' | 'unsellable';

function evaluateCategory(currentDur: number, wornMin: number, likeNewMin: number): Exclude<SellCategory, 'full'> {
  if (currentDur >= likeNewMin) return 'like_new';
  if (currentDur >= wornMin) return 'worn';
  return 'unsellable';
}

const CATEGORY_LABELS: Record<SellCategory, string> = {
  full: 'Full Durability — Full Price',
  like_new: 'Like New — Full Price',
  worn: 'Worn — Reduced Price',
  unsellable: 'Cannot be listed',
};

const CATEGORY_ICON: Record<SellCategory, string> = {
  full: '🔵',
  like_new: '🟢',
  worn: '🟡',
  unsellable: '🔴',
};

export default function ArmorSellPage() {
  const [filter, setFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Durability inputs
  const [currentDur, setCurrentDur] = useState<string>('');
  const [currentMax, setCurrentMax] = useState<string>('');

  const selectedItem = THRESHOLD_DATA.find(d => d[1] === selectedId);
  const [factoryMax, wornMin, likeNewMin, itemName, , material] = selectedItem
    ? [selectedItem[2], selectedItem[3], selectedItem[4], selectedItem[0], selectedItem[5], selectedItem[6]]
    : [0, 0, 0, '', '', ''];

  const maxDur = parseFloat(currentMax) || factoryMax || 0;
  const currentDurability = parseFloat(currentDur) || 0;

  // ── Core repair math ──
  const repairLoss = selectedItem ? calcRepairLoss(factoryMax, material) : 0;
  const afterRepairMax = maxDur > 0 ? Math.max(0, Math.round((maxDur - repairLoss) * 10) / 10) : 0;

  // As-is category (blue if full durability)
  const isFullDurability = currentDurability > 0 && currentDurability === maxDur && maxDur === factoryMax;
  const asIsCategory: SellCategory = isFullDurability
    ? 'full'
    : currentDurability > 0
      ? evaluateCategory(currentDurability, wornMin, likeNewMin)
      : 'unsellable';

  const marketPossibleAfter = afterRepairMax >= wornMin;
  const marketPossibleNow = currentDurability >= wornMin;

  const filtered = THRESHOLD_DATA.filter(d => filter === 'all' || d[5] === filter);
  const types = [...new Set(THRESHOLD_DATA.map(d => d[5]))];
  const typeCounts: Record<string, number> = {};
  THRESHOLD_DATA.forEach(d => { typeCounts[d[5]] = (typeCounts[d[5]] || 0) + 1; });

  // Gauge percentages
  const durPct = maxDur > 0 ? Math.min(100, Math.round((currentDurability / maxDur) * 100)) : 0;
  const wornPct = maxDur > 0 ? Math.min(100, Math.round((wornMin / maxDur) * 100)) : 0;
  const likeNewPct = maxDur > 0 ? Math.min(100, Math.round((likeNewMin / maxDur) * 100)) : 0;
  const afterRepairPct = maxDur > 0 ? Math.min(100, Math.round((afterRepairMax / maxDur) * 100)) : 0;

  const shortCat = (c: SellCategory): string =>
    c === 'full' ? 'Full' : c === 'like_new' ? 'Like New' : c === 'worn' ? 'Worn' : 'Cannot list';

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/tracker" className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#D4AF37] transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Tracker
          </Link>
          <h1 className="text-3xl font-bold font-display text-gradient">Armor Sell Calculator</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">Found armor in a raid? Enter its durability and instantly know: is it sellable on the market, and would a repair help? No prices needed.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left panel: Item selection ── */}
          <div className="lg:col-span-1 space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setFilter('all')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === 'all' ? 'bg-[#D4AF37] text-black' : 'glass text-[#9CA3AF] hover:text-white'}`}>
                All ({THRESHOLD_DATA.length})
              </button>
              {types.map(t => (
                <button key={t} onClick={() => setFilter(t)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === t ? 'bg-[#D4AF37] text-black' : 'glass text-[#9CA3AF] hover:text-white'}`}>
                  {t}s ({typeCounts[t]})
                </button>
              ))}
            </div>

            <div className="glass rounded-xl overflow-hidden max-h-[60vh] overflow-y-auto">
              <div className="divide-y divide-white/[0.03]">
                {filtered.map(([name, id, maxD, worn, likeNew, type, mat]) => {
                  const typeIcon = type === 'Vest' ? '🦺' : type === 'Rig' ? '🎒' : type === 'Helmet' ? '⛑️' : '😷';
                  return (
                    <button key={id} onClick={() => { setSelectedId(id); setCurrentDur(''); setCurrentMax(''); }}
                      className={`w-full text-left px-4 py-2.5 transition-colors hover:bg-white/[0.03] ${
                        selectedId === id ? 'bg-[#D4AF37]/10 border-l-2 border-[#D4AF37]' : ''
                      }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{typeIcon}</span>
                        <span className="text-xs text-white font-medium truncate">{name}</span>
                      </div>
                      <div className="flex gap-2 mt-0.5 text-[10px] text-[#6B7280] ml-6 flex-wrap">
                        <span>Max: <span className="text-white/60">{maxD}</span></span>
                        <span className="text-[#22C55E]/60">LikeNew ≥ {likeNew}</span>
                        <span className="text-[#F59E0B]/60">Worn ≥ {worn}</span>
                        <span className="text-[#6B7280]/60">{mat}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Right panel: Calculator ── */}
          <div className="lg:col-span-2 space-y-5">
            {selectedItem ? (
              <>
                {/* Selected item info */}
                <div className="glass rounded-xl p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-display font-bold text-white">{itemName}</h2>
                      <p className="text-xs text-[#9CA3AF] mt-0.5">
                        Factory max: <span className="text-white font-mono">{factoryMax}</span>pts &middot;
                        Material: <span className="text-white">{material}</span> &middot;
                        <span className="text-[#F59E0B]"> -{repairLoss} pts per repair</span>
                      </p>
                    </div>
                  </div>

                  {/* Durability inputs */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-[#D4AF37] uppercase tracking-wider mb-1.5">Current Durability</label>
                      <input type="number" min={0} max={maxDur} step="any" value={currentDur} onChange={e => setCurrentDur(e.target.value)}
                        placeholder="e.g. 48.7"
                        className="w-full glass rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B7280] outline-none focus:border-[#D4AF37]/50 transition-colors font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs text-[#D4AF37] uppercase tracking-wider mb-1.5">Current Max Durability</label>
                      <input type="number" min={0} max={factoryMax} step="any" value={currentMax} onChange={e => setCurrentMax(e.target.value)}
                        placeholder={String(factoryMax)}
                        className="w-full glass rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B7280] outline-none focus:border-[#D4AF37]/50 transition-colors font-mono" />
                      {currentMax !== '' && maxDur < factoryMax && (
                        <p className="text-[10px] text-[#F59E0B] mt-1">Max reduced from factory {factoryMax} (repaired before / bought worn)</p>
                      )}
                    </div>
                  </div>

                  {/* Quick buttons */}
                  <div className="flex gap-1 flex-wrap">
                    {[100, 75, 50, 25, 0].map(pct => {
                      const val = Math.round((maxDur || factoryMax) * pct / 100);
                      return (
                        <button key={pct} onClick={() => { setCurrentDur(String(val)); if (currentMax === '') setCurrentMax(String(factoryMax)); }}
                          className={`px-2 py-1 rounded text-[10px] transition-colors ${
                            currentDurability === val ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'bg-white/5 text-[#6B7280] hover:text-white'
                          }`}>
                          {pct}%
                        </button>
                      );
                    })}
                    <button onClick={() => { setCurrentMax(''); setCurrentDur(''); }}
                      className="px-2 py-1 rounded text-[10px] bg-white/5 text-[#6B7280] hover:text-white transition-colors">
                      Reset
                    </button>
                  </div>
                </div>

                {/* ── After-repair summary ── */}
                {currentDur !== '' && (
                  <div className="glass rounded-xl p-5">
                    <h3 className="text-sm font-display font-bold text-white mb-3">🔧 Repair Summary</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-white/5 p-2">
                        <div className="text-[9px] text-[#6B7280] uppercase tracking-wider">Repair Loss</div>
                        <div className="text-sm font-mono font-bold text-[#F59E0B]">-{repairLoss} pts</div>
                      </div>
                      <div className="rounded-lg bg-white/5 p-2">
                        <div className="text-[9px] text-[#6B7280] uppercase tracking-wider">Max After Repair</div>
                        <div className="text-sm font-mono font-bold text-white">{afterRepairMax} / {afterRepairMax}</div>
                      </div>
                      <div className={`rounded-lg p-2 ${marketPossibleNow ? 'bg-[#22C55E]/10' : 'bg-[#EF4444]/10'}`}>
                        <div className="text-[9px] text-[#6B7280] uppercase tracking-wider">Market Now</div>
                        <div className={`text-sm font-mono font-bold ${marketPossibleNow ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                          {currentDurability > 0 ? (marketPossibleNow ? '✓ Listable' : '✗ Not listable') : '—'}
                        </div>
                      </div>
                      <div className={`rounded-lg p-2 ${asIsCategory === 'unsellable' ? 'bg-[#EF4444]/10' : asIsCategory === 'worn' ? 'bg-[#F59E0B]/10' : 'bg-[#22C55E]/10'}`}>
                        <div className="text-[9px] text-[#6B7280] uppercase tracking-wider">Sells As Now</div>
                        <div className={`text-sm font-mono font-bold ${asIsCategory === 'unsellable' ? 'text-[#EF4444]' : asIsCategory === 'worn' ? 'text-[#F59E0B]' : 'text-[#22C55E]'}`}>
                          {currentDurability > 0 ? shortCat(asIsCategory) : '—'}
                        </div>
                      </div>
                      <div className={`rounded-lg p-2 ${afterRepairMax < wornMin ? 'bg-[#EF4444]/10' : afterRepairMax < likeNewMin ? 'bg-[#F59E0B]/10' : 'bg-[#22C55E]/10'}`}>
                        <div className="text-[9px] text-[#6B7280] uppercase tracking-wider">Sells As After Repair</div>
                        <div className={`text-sm font-mono font-bold ${afterRepairMax < wornMin ? 'text-[#EF4444]' : afterRepairMax < likeNewMin ? 'text-[#F59E0B]' : 'text-[#22C55E]'}`}>
                          {currentDur !== '' ? (afterRepairMax >= wornMin ? (afterRepairMax >= likeNewMin ? 'Like New' : 'Worn') : 'Cannot list') : '—'}
                        </div>
                      </div>
                      <div className={`rounded-lg p-2 ${marketPossibleAfter ? 'bg-[#22C55E]/10' : 'bg-[#EF4444]/10'}`}>
                        <div className="text-[9px] text-[#6B7280] uppercase tracking-wider">Market After Repair</div>
                        <div className={`text-sm font-mono font-bold ${marketPossibleAfter ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                          {currentDur !== '' ? (marketPossibleAfter ? '✓ Listable' : '✗ Not listable') : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Threshold reference ── */}
                <div className="glass rounded-xl p-5">
                  <h3 className="text-sm font-display font-bold text-white mb-3">Threshold Reference</h3>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2">
                      <div className="text-[10px] text-red-400 uppercase tracking-wider">Cannot Sell</div>
                      <div className="text-base font-mono font-bold text-red-400">0 – {wornMin - 1}</div>
                    </div>
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2">
                      <div className="text-[10px] text-amber-400 uppercase tracking-wider">Worn</div>
                      <div className="text-base font-mono font-bold text-amber-400">{wornMin} – {likeNewMin - 1}</div>
                    </div>
                    <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2">
                      <div className="text-[10px] text-green-400 uppercase tracking-wider">Like New</div>
                      <div className="text-base font-mono font-bold text-green-400">≥ {likeNewMin}</div>
                    </div>
                    <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2">
                      <div className="text-[10px] text-blue-400 uppercase tracking-wider">Full (New)</div>
                      <div className="text-base font-mono font-bold text-blue-400">{factoryMax} = {factoryMax}</div>
                    </div>
                  </div>
                </div>

                {/* ── Visual gauge ── */}
                <div className="glass rounded-xl p-5">
                  <h3 className="text-sm font-display font-bold text-white mb-3">Durability Gauge</h3>
                  <div className="relative h-8 rounded-lg overflow-hidden bg-[#1a1a1a]">
                    <div className="absolute inset-y-0 left-0 bg-red-500/20 border-r border-red-500/40" style={{ width: `${wornPct}%` }} />
                    <div className="absolute inset-y-0 bg-amber-500/20 border-r border-amber-500/40" style={{ left: `${wornPct}%`, width: `${likeNewPct - wornPct}%` }} />
                    <div className="absolute inset-y-0 right-0 bg-green-500/20" style={{ left: `${likeNewPct}%` }} />

                    {currentDurability > 0 && (
                      <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-6 bg-white rounded-full shadow-lg shadow-white/30 z-10"
                        style={{ left: `calc(${durPct}% - 3px)` }} />
                    )}
                    {currentDur !== '' && afterRepairMax > 0 && afterRepairMax !== currentDurability && (
                      <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-full border-2 border-[#D4AF37] z-10"
                        style={{ left: `calc(${afterRepairPct}% - 3px)` }} />
                    )}

                    <div className="absolute inset-0 flex items-center justify-between px-3 text-[9px] text-white/40 uppercase tracking-wider">
                      <span>0</span>
                      <span>Worn {wornMin}</span>
                      <span>Like New {likeNewMin}</span>
                      <span>{maxDur}</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] text-[#6B7280] mt-1">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-white inline-block" /> Current</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full border-2 border-[#D4AF37] inline-block" /> After Repair</span>
                    <span className="text-right">Blue = Full (new) durability</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="glass rounded-xl p-12 flex flex-col items-center justify-center text-center">
                <span className="text-4xl mb-3">🛡️</span>
                <h3 className="text-lg font-display font-bold text-white mb-1">Select an Armor Item</h3>
                <p className="text-sm text-[#6B7280]">Choose an armor, helmet, rig, or face mask, enter its durability, and instantly see if it's sellable on the market — as-is and after repair.</p>
                <p className="text-xs text-[#6B7280] mt-4">Repair loss formula verified from live data &middot; thresholds from Skrux sheet 15/04/2026</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
