'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  GUNSMITH_CATEGORIES, getAllPartsInCategory, getCompatibleParts, buildTagIndex,
  type AccessoryLike, type WeaponOverrides, type CompatiblePart,
} from '@/lib/partCompat';

interface Weapon {
  id: number;
  caliber?: string;
  stats?: Record<string, unknown>;
  supportedTags?: string[];
}

const DRAFT_KEY = 'abi-gunsmith-compat-draft';

// Imported from a local game-asset folder via scripts/import-part-images.js
// (public/images/weapons/{weaponId}.png, public/images/parts/{partId}.png).
// Coverage isn't complete — not every weapon/part has a matched image yet —
// so this renders nothing rather than a broken-image icon when missing.
function Thumb({ src, alt, size = 28 }: { src: string; alt: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div style={{ width: size, height: size }} className="shrink-0 rounded bg-white/5" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} style={{ width: size, height: size }}
      className="shrink-0 rounded bg-white/5 object-contain"
      onError={() => setFailed(true)} />
  );
}

function loadDraft(): WeaponOverrides {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDraft(draft: WeaponOverrides) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // localStorage full/unavailable — draft still lives in memory for this session
  }
}

export default function GunsmithCompatPage() {
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [accessories, setAccessories] = useState<AccessoryLike[]>([]);
  const [partCatalog, setPartCatalog] = useState<Record<string, Record<string, string>>>({});
  const [partCompatOverrides, setPartCompatOverrides] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [selectedWeapon, setSelectedWeapon] = useState<Weapon | null>(null);
  const [weaponSearch, setWeaponSearch] = useState('');
  const [draft, setDraft] = useState<WeaponOverrides>({});
  const [exported, setExported] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/data/weapon-detail.json').then(r => r.json()),
      fetch('/data/item_names.json').then(r => r.json()),
      fetch('/data/weapon-parts.json').then(r => r.json()).catch(() => ({})),
      fetch('/data/weapon-part-compat.json').then(r => r.json()).catch(() => ({})),
      fetch('/data/weapon-part-overrides.json').then(r => r.json()).catch(() => ({})),
    ]).then(([wd, nm, pc, compat, shipped]) => {
      setNames(nm);
      setWeapons(wd.weapons || []);
      setAccessories(wd.accessories || []);
      setPartCatalog(pc || {});
      setPartCompatOverrides(compat || {});
      // Start from whatever's already shipped in the repo, then layer any
      // in-progress edits from a previous session on top (draft wins).
      const savedDraft = loadDraft();
      setDraft({ ...(shipped || {}), ...savedDraft });
      if (wd.weapons?.length) setSelectedWeapon(wd.weapons[0]);
      setLoading(false);
    });
  }, []);

  const getName = useCallback((id: string) => names[id] || `ID ${id}`, [names]);

  const tagIndex = useMemo(
    () => buildTagIndex(accessories, partCompatOverrides),
    [accessories, partCompatOverrides],
  );

  const filteredWeapons = weapons.filter(w =>
    !weaponSearch || getName(String(w.id)).toLowerCase().includes(weaponSearch.toLowerCase()));

  const attachmentCategories = selectedWeapon
    ? GUNSMITH_CATEGORIES.filter(cat =>
        selectedWeapon.supportedTags?.some(t => t.startsWith('Assemble.' + cat + '.')))
    : [];

  // Checked-id set for weapon+category: explicit draft entry if present,
  // otherwise today's tag-based default (what Aim Lab / Gunsmith would show).
  const getCheckedIds = useCallback((weapon: Weapon, category: string): Set<number> => {
    const explicit = draft[String(weapon.id)]?.[category];
    if (explicit) return new Set(explicit);
    const defaultParts = getCompatibleParts(weapon, category, accessories, partCatalog, tagIndex, names);
    return new Set(defaultParts.map(p => p.id));
  }, [draft, accessories, partCatalog, tagIndex, names]);

  const toggle = (weapon: Weapon, category: string, partId: number, allPartsInCat: CompatiblePart[]) => {
    setDraft(prev => {
      const wKey = String(weapon.id);
      const current = new Set(getCheckedIds(weapon, category));
      if (current.has(partId)) current.delete(partId); else current.add(partId);
      const next: WeaponOverrides = {
        ...prev,
        [wKey]: { ...(prev[wKey] || {}), [category]: allPartsInCat.filter(p => current.has(p.id)).map(p => p.id) },
      };
      saveDraft(next);
      return next;
    });
  };

  const setAllInCategory = (weapon: Weapon, category: string, allPartsInCat: CompatiblePart[], checked: boolean) => {
    setDraft(prev => {
      const wKey = String(weapon.id);
      const next: WeaponOverrides = {
        ...prev,
        [wKey]: { ...(prev[wKey] || {}), [category]: checked ? allPartsInCat.map(p => p.id) : [] },
      };
      saveDraft(next);
      return next;
    });
  };

  const resetCategory = (weapon: Weapon, category: string) => {
    setDraft(prev => {
      const wKey = String(weapon.id);
      if (!prev[wKey]?.[category]) return prev;
      const restCats = { ...prev[wKey] };
      delete restCats[category];
      const next = { ...prev };
      if (Object.keys(restCats).length === 0) delete next[wKey];
      else next[wKey] = restCats;
      saveDraft(next);
      return next;
    });
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'weapon-part-overrides.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  const reviewedWeaponCount = Object.keys(draft).length;

  if (loading) return (
    <main className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
    </main>
  );

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      <div className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-4">
            <Link href="/tracker/gunsmith" className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#D4AF37] transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back to Gunsmith
            </Link>
            <button onClick={handleExport}
              className="px-3 py-1.5 rounded text-xs font-medium bg-[#D4AF37] text-black hover:bg-[#D4AF37]/80 transition-colors">
              {exported ? '✓ Downloaded' : 'Export weapon-part-overrides.json'}
            </button>
          </div>
          <h1 className="text-3xl font-bold font-display text-gradient">Part Compatibility Editor</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            Check/uncheck which parts actually fit each weapon. Checkboxes start pre-filled from the game&apos;s own
            data plus a best-effort auto-classifier — review and correct, then export and drop the file into{' '}
            <code className="text-[#D4AF37]">public/data/weapon-part-overrides.json</code>.
          </p>
          <p className="mt-2 text-[11px] text-[#6B7280]">
            Your edits autosave to this browser (localStorage) as you go — {reviewedWeaponCount} weapon{reviewedWeaponCount === 1 ? '' : 's'} touched so far.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left: Weapon Selector */}
          <div className="glass rounded-xl p-4">
            <h2 className="text-xs text-[#D4AF37] uppercase tracking-wider mb-2">Weapon</h2>
            <input type="text" placeholder="Search..." value={weaponSearch} onChange={e => setWeaponSearch(e.target.value)}
              className="w-full glass rounded px-2 py-1.5 text-xs text-white outline-none mb-2" />
            <div className="max-h-[32rem] overflow-y-auto space-y-0.5">
              {filteredWeapons.slice(0, 100).map(w => {
                const touched = !!draft[String(w.id)];
                return (
                  <button key={w.id} onClick={() => setSelectedWeapon(w)}
                    className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors flex items-center justify-between ${
                      selectedWeapon?.id === w.id ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'text-[#9CA3AF] hover:text-white hover:bg-white/5'
                    }`}>
                    <span>{getName(String(w.id))} <span className="text-[9px] opacity-50">[{w.caliber}]</span></span>
                    {touched && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 ml-1" title="reviewed" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Middle: Category sections */}
          <div className="lg:col-span-3 space-y-3">
            {selectedWeapon && (
              <>
                <div className="glass rounded-xl p-4 flex items-center gap-4">
                  <Thumb src={`/images/weapons/${selectedWeapon.id}.png`} alt={getName(String(selectedWeapon.id))} size={64} />
                  <h2 className="text-sm font-bold text-white">
                    {getName(String(selectedWeapon.id))}
                    <span className="text-[10px] text-[#9CA3AF] ml-2">[{selectedWeapon.caliber}]</span>
                  </h2>
                </div>

                {attachmentCategories.map(category => {
                  const allPartsInCat = getAllPartsInCategory(category, accessories, partCatalog, names);
                  if (allPartsInCat.length === 0) return null;
                  const checked = getCheckedIds(selectedWeapon, category);
                  const isExplicit = !!draft[String(selectedWeapon.id)]?.[category];

                  return (
                    <details key={category} className="glass rounded-xl p-3" open>
                      <summary className="text-[11px] text-[#D4AF37] uppercase tracking-wider cursor-pointer select-none flex items-center justify-between">
                        <span>{category} <span className="text-[#6B7280] font-normal">({checked.size}/{allPartsInCat.length} compatible)</span></span>
                        <span className="flex items-center gap-2 text-[9px] font-normal normal-case">
                          {isExplicit && <span className="text-emerald-400">reviewed</span>}
                          <span onClick={e => { e.preventDefault(); setAllInCategory(selectedWeapon, category, allPartsInCat, true); }}
                            className="text-[#6B7280] hover:text-white cursor-pointer">all</span>
                          <span onClick={e => { e.preventDefault(); setAllInCategory(selectedWeapon, category, allPartsInCat, false); }}
                            className="text-[#6B7280] hover:text-white cursor-pointer">none</span>
                          {isExplicit && (
                            <span onClick={e => { e.preventDefault(); resetCategory(selectedWeapon, category); }}
                              className="text-[#6B7280] hover:text-red-400 cursor-pointer">reset</span>
                          )}
                        </span>
                      </summary>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1">
                        {allPartsInCat.map(part => {
                          const isChecked = checked.has(part.id);
                          const badge = part.source === 'accessory'
                            ? { label: 'tag', cls: 'text-emerald-400' }
                            : partCompatOverrides[String(part.id)]
                              ? { label: 'auto', cls: 'text-yellow-400' }
                              : { label: 'unclassified', cls: 'text-[#6B7280]' };
                          return (
                            <label key={part.id} className="flex items-center gap-1.5 text-[10px] text-[#9CA3AF] hover:text-white px-1.5 py-0.5 rounded hover:bg-white/5 cursor-pointer">
                              <input type="checkbox" checked={isChecked}
                                onChange={() => toggle(selectedWeapon, category, part.id, allPartsInCat)}
                                className="accent-[#D4AF37] shrink-0" />
                              <Thumb src={`/images/parts/${part.id}.png`} alt={part.name} size={24} />
                              <span className="truncate flex-1">{part.name}</span>
                              <span className={`text-[8px] shrink-0 ${badge.cls}`}>{badge.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
