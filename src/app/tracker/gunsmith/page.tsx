'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { saveBuild, getBuildForWeapon, loadBuilds, type GunsmithBuild } from '@/lib/gunsmith';
import { GUNSMITH_CATEGORIES, getCompatibleParts, buildTagIndex, type AccessoryLike, type WeaponOverrides } from '@/lib/partCompat';

interface Weapon {
  id: number;
  caliber?: string;
  stats?: Record<string, unknown>;
  supportedTags?: string[];
}

type Accessory = AccessoryLike;

// Imported from a local game-asset folder via scripts/import-part-images.js
// (public/images/weapons/{weaponId}.png) — coverage isn't complete, so this
// renders nothing rather than a broken-image icon when a weapon has none.
function WeaponThumb({ src, alt, size = 48 }: { src: string; alt: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} style={{ width: size, height: size }}
      className="shrink-0 rounded bg-white/5 object-contain"
      onError={() => setFailed(true)} />
  );
}

export default function GunsmithPage() {
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [partCatalog, setPartCatalog] = useState<Record<string, Record<string, string>>>({});
  const [partCompatOverrides, setPartCompatOverrides] = useState<Record<string, string>>({});
  const [weaponOverrides, setWeaponOverrides] = useState<WeaponOverrides>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [selectedWeapon, setSelectedWeapon] = useState<Weapon | null>(null);
  const [weaponSearch, setWeaponSearch] = useState('');
  const [buildName, setBuildName] = useState('');
  const [attachments, setAttachments] = useState<Record<string, number>>({});
  const [builds, setBuilds] = useState<GunsmithBuild[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/abi-maps/data/weapon-detail.json').then(r => r.json()),
      fetch('/abi-maps/data/item_names.json').then(r => r.json()),
      fetch('/abi-maps/data/weapon-parts.json').then(r => r.json()).catch(() => ({})),
      fetch('/abi-maps/data/weapon-part-compat.json').then(r => r.json()).catch(() => ({})),
      fetch('/abi-maps/data/weapon-part-overrides.json').then(r => r.json()).catch(() => ({})),
    ]).then(([wd, nm, pc, compat, overrides]) => {
      setNames(nm);
      setWeapons(wd.weapons || []);
      setAccessories(wd.accessories || []);
      setPartCatalog(pc || {});
      setPartCompatOverrides(compat || {});
      setWeaponOverrides(overrides || {});
      setBuilds(loadBuilds());
      if (wd.weapons?.length) {
        setSelectedWeapon(wd.weapons[0]);
        setBuildName(getName(nm, String(wd.weapons[0].id)));
      }
      setLoading(false);
    });
  }, []);

  const tagIndex = useMemo(
    () => buildTagIndex(accessories, partCompatOverrides),
    [accessories, partCompatOverrides],
  );

  const getName = (nm: Record<string, string> | null, id: string) => {
    const dict = nm || names;
    return dict[id] || `ID ${id}`;
  };

  const handleWeaponSelect = useCallback((w: Weapon) => {
    setSelectedWeapon(w);
    setBuildName(getName(null, String(w.id)));
    setSaved(false);
    // Load existing build if any
    const existing = getBuildForWeapon(w.id);
    if (existing) {
      setAttachments(existing.attachments);
      setBuildName(existing.name);
    } else {
      setAttachments({});
    }
  }, [names]);

  const handleSave = () => {
    if (!selectedWeapon) return;
    const build: GunsmithBuild = {
      weaponId: selectedWeapon.id,
      name: buildName || getName(null, String(selectedWeapon.id)),
      timestamp: Date.now(),
      attachments,
    };
    saveBuild(build);
    setBuilds(loadBuilds());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const setAttachment = (category: string, id: number) => {
    setAttachments(prev => ({ ...prev, [category]: id }));
    setSaved(false);
  };

  // Get available parts for a category
  const getPartsForCategory = useCallback((category: string) => {
    if (!selectedWeapon) return [];
    return getCompatibleParts(selectedWeapon, category, accessories, partCatalog, tagIndex, names, weaponOverrides);
  }, [selectedWeapon, accessories, partCatalog, tagIndex, names, weaponOverrides]);

  // Stat diff for a category
  const getStatDiff = (category: string): string => {
    const selectedId = attachments[category];
    if (!selectedId) return 'stock';
    const partCat = partCatalog[String(selectedId)];
    if (!partCat) return '';

    const parts: string[] = [];
    const vr = Number(partCat.sVerticalRearSeatControl || 0);
    const hr = Number(partCat.sHorizontalRearSeatControl || 0);
    const ergo = Number(partCat.sHumanMachineEfficiency || 0);
    const acc = Number(partCat.sAccuracy || 0);
    const stab = Number(partCat.sLumbarStability || 0);
    if (vr !== 0) parts.push(`V${vr > 0 ? '+' : ''}${vr}`);
    if (hr !== 0) parts.push(`H${hr > 0 ? '+' : ''}${hr}`);
    if (ergo !== 0) parts.push(`E${ergo > 0 ? '+' : ''}${ergo}`);
    if (acc !== 0) parts.push(`Acc${acc > 0 ? '+' : ''}${acc}`);
    if (stab !== 0) parts.push(`Stab${stab > 0 ? '+' : ''}${stab}`);
    return parts.length > 0 ? parts.join(' ') : 'stat mods';
  };

  const filteredWeapons = weapons.filter(w =>
    !weaponSearch || getName(null, String(w.id)).toLowerCase().includes(weaponSearch.toLowerCase())
  );

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
            <Link href="/tracker" className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#D4AF37] transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back to Tracker
            </Link>
            <Link href="/tracker/gunsmith/compat" className="text-xs text-[#9CA3AF] hover:text-[#D4AF37] transition-colors">
              Part compatibility editor →
            </Link>
          </div>
          <h1 className="text-3xl font-bold font-display text-gradient">Gunsmith</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">Build weapons by selecting a receiver and attaching compatible parts. Builds are saved locally and used to filter attachments in Aim Lab.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left: Weapon Selector */}
          <div className="glass rounded-xl p-4">
            <h2 className="text-xs text-[#D4AF37] uppercase tracking-wider mb-2">Weapon Receiver</h2>
            <input type="text" placeholder="Search..." value={weaponSearch} onChange={e => setWeaponSearch(e.target.value)}
              className="w-full glass rounded px-2 py-1.5 text-xs text-white outline-none mb-2" />
            <div className="max-h-80 overflow-y-auto space-y-0.5">
              {filteredWeapons.slice(0, 100).map(w => (
                <button key={w.id} onClick={() => handleWeaponSelect(w)}
                  className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors ${
                    selectedWeapon?.id === w.id ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'text-[#9CA3AF] hover:text-white hover:bg-white/5'
                  }`}>
                  {getName(null, String(w.id))}
                  <span className="text-[9px] opacity-50 ml-1">[{w.caliber}]</span>
                </button>
              ))}
            </div>
          </div>

          {/* Middle: Gunsmith Attachment Tree */}
          <div className="lg:col-span-2 space-y-3">
            {selectedWeapon && (
              <>
                <div className="glass rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <WeaponThumb src={`/images/weapons/${selectedWeapon.id}.png`} alt={getName(null, String(selectedWeapon.id))} />
                      <h2 className="text-sm font-bold text-white">
                        {getName(null, String(selectedWeapon.id))}
                        <span className="text-[10px] text-[#9CA3AF] ml-2">[{selectedWeapon.caliber}]</span>
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="text" value={buildName} onChange={e => setBuildName(e.target.value)}
                        placeholder="Build name..."
                        className="glass rounded px-2 py-1 text-[11px] text-white outline-none w-40" />
                      <button onClick={handleSave}
                        className="px-3 py-1 rounded text-[11px] font-medium bg-[#D4AF37] text-black hover:bg-[#D4AF37]/80 transition-colors">
                        {saved ? '✓ Saved' : 'Save Build'}
                      </button>
                    </div>
                  </div>

                  {/* Weapon base stats */}
                  {selectedWeapon.stats && (
                    <div className="flex gap-4 text-[10px] text-[#6B7280] font-mono mb-3 flex-wrap">
                      <span>RPM: {String(selectedWeapon.stats?.FireRate ?? '?')}</span>
                      <span>Vel: {String(selectedWeapon.stats?.MuzzleVelocity ?? '?')} m/s</span>
                      <span>DMG: {String(selectedWeapon.stats?.AdapterAdjustDamage ?? '0')}</span>
                      <span>Ergo: {String(selectedWeapon.stats?.Engonomics ?? '?')}</span>
                      <span>Zero: {String(selectedWeapon.stats?.ZeroDropDistance ? Number(selectedWeapon.stats.ZeroDropDistance)/100 : '?')}m</span>
                    </div>
                  )}
                </div>

                {/* Attachment Categories Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {GUNSMITH_CATEGORIES.map(cat => {
                    const parts = getPartsForCategory(cat);
                    if (parts.length === 0) return null;
                    const selectedId = attachments[cat] || 0;
                    return (
                      <div key={cat} className="glass rounded-xl p-3">
                        <h3 className="text-[10px] text-[#D4AF37] uppercase tracking-wider mb-1.5 flex items-center justify-between">
                          <span>{cat}</span>
                          <span className="text-[8px] text-[#6B7280]">{parts.length} parts</span>
                        </h3>
                        <select value={selectedId}
                          onChange={e => setAttachment(cat, Number(e.target.value))}
                          className="w-full text-[10px] bg-[#1a1a1a] text-[#9CA3AF] border border-white/5 rounded outline-none">
                          <option value={0} className="bg-[#1a1a1a]">None (stock)</option>
                          {parts.map(p => {
                            const isCatalog = p.source === 'catalog';
                            const s = (isCatalog ? p.raw : p.stats) || {};
                            const statParts: string[] = [];
                            const vr = isCatalog ? Number((s as Record<string, string>).sVerticalRearSeatControl || 0) : Number((s as Record<string, unknown>).VerticalRecoil ?? 0);
                            const hr = isCatalog ? Number((s as Record<string, string>).sHorizontalRearSeatControl || 0) : Number((s as Record<string, unknown>).HorizontalRecoil ?? 0);
                            if (vr !== 0) statParts.push(`V${vr > 0 ? '+' : ''}${vr}`);
                            if (hr !== 0) statParts.push(`H${hr > 0 ? '+' : ''}${hr}`);
                            const sDiff = statParts.length > 0 ? statParts.join(' ') : '';
                            return (
                              <option key={p.id} value={p.id} className="bg-[#1a1a1a]">
                                {p.name}{sDiff ? ` (${sDiff})` : ''}
                              </option>
                            );
                          })}
                        </select>
                        {selectedId > 0 && (
                          <div className="text-[8px] text-[#6B7280] mt-1">
                            {getStatDiff(cat)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Right: Saved Builds */}
          <div className="space-y-3">
            <div className="glass rounded-xl p-4">
              <h2 className="text-xs text-[#D4AF37] uppercase tracking-wider mb-2">Saved Builds ({builds.length})</h2>
              {builds.length === 0 ? (
                <p className="text-[10px] text-[#6B7280]">No builds saved yet. Select a weapon, configure parts, and click Save.</p>
              ) : (
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {builds.map(b => (
                    <div key={b.weaponId} className="bg-white/5 rounded p-2">
                      <div className="text-[11px] text-white font-medium truncate">{b.name}</div>
                      <div className="text-[9px] text-[#6B7280]">{Object.keys(b.attachments).length} parts configured</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="glass rounded-xl p-4">
              <h2 className="text-xs text-[#D4AF37] uppercase tracking-wider mb-2">How it Works</h2>
              <div className="text-[10px] text-[#9CA3AF] space-y-2 leading-relaxed">
                <p>1. Select a <span className="text-white">Weapon Receiver</span> from the left panel</p>
                <p>2. Configure each <span className="text-[#D4AF37]">attachment slot</span> — pick from compatible parts</p>
                <p>3. <span className="text-green-400">Save Build</span> — stored in your browser</p>
                <p>4. Saved builds filter attachment options in <span className="text-emerald-400">Aim Lab</span></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
