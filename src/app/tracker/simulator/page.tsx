'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { simulate, getBranchLabel, calcDistanceFactor, calcDurProtRate,
         calcEffectiveProtection, calcRicochetChance, calcPenChance,
         simulateLimb, LIMB_HP, LIMB_LABELS,
         type SimResult, type ShotRecord, type DamageDistance,
         type LimbName, type LimbSimResult } from '@/lib/abiSim';

interface Weapon {
  id: number;
  caliber?: string;
  stats?: Record<string, unknown>;
  damageDistance?: DamageDistance;
}

interface Bullet {
  id: number;
  caliber?: string;
  stats?: Record<string, unknown>;
}

interface ArmorItem {
  id: number;
  type?: number;
  stats?: Record<string, unknown>;
  durabilityMax?: number;
  nativeArmorType?: string;
}

export default function SimulatorPage() {
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [armors, setArmors] = useState<ArmorItem[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [selectedWeapon, setSelectedWeapon] = useState<Weapon | null>(null);
  const [selectedBullet, setSelectedBullet] = useState<Bullet | null>(null);
  const [selectedHelmet, setSelectedHelmet] = useState<ArmorItem | null>(null);
  const [selectedArmor, setSelectedArmor] = useState<ArmorItem | null>(null);
  const [helmetResult, setHelmetResult] = useState<SimResult | null>(null);
  const [armorResult, setArmorResult] = useState<SimResult | null>(null);
  const [limbResult, setLimbResult] = useState<LimbSimResult | null>(null);
  const [limbTarget, setLimbTarget] = useState<LimbName>('l_leg');
  const [solo, setSolo] = useState(false);

  const [weaponSearch, setWeaponSearch] = useState('');
  const [seed, setSeed] = useState(() => Math.floor(Date.now() / 1000));
  const [range, setRange] = useState(25);
  const [impactAngle, setImpactAngle] = useState(65);
  const [ammoTier, setAmmoTier] = useState(-1);

  useEffect(() => {
    Promise.all([
      fetch('/abi-maps/data/weapon-detail.json').then(r => r.json()),
      fetch('/abi-maps/data/bullet-detail.json').then(r => r.json()),
      fetch('/abi-maps/data/armor-detail.json').then(r => r.json()),
      fetch('/abi-maps/data/item_names.json').then(r => r.json()),
    ]).then(([wd, bd, ad, nm]) => {
      setNames(nm);
      setWeapons(wd.weapons || []);
      setBullets(Array.isArray(bd) ? bd : (bd.bullets || []));
      const arr = Array.isArray(ad) ? ad : (ad.armors || ad.armor || []);
      setArmors(arr);
      if (wd.weapons?.length) setSelectedWeapon(wd.weapons[0]);
      setLoading(false);
    });
  }, []);

  const getName = (id: string) => names[id] || `ID ${id}`;

  const compatibleBullets = selectedWeapon
    ? bullets.filter(b => {
        const wCal = selectedWeapon.caliber?.replace(/[.\s×x]/g, '').toLowerCase() || '';
        const bCal = (b.caliber || '').replace(/[.\s×x]/g, '').toLowerCase();
        return bCal.includes(wCal) || wCal.includes(bCal);
      })
    : [];

  const helmets = armors.filter(a => a.nativeArmorType === 'Helmet');
  const vests = armors.filter(a => a.nativeArmorType === 'Vest' || (!a.nativeArmorType && a.type === 0));

  const runSim = useCallback(() => {
    if (!selectedWeapon || !selectedBullet) return;

    const s = selectedBullet.stats as Record<string, unknown>;
    const ws = selectedWeapon.stats as Record<string, unknown>;
    const bDmg = Number(s?.BaseDamage || 0);
    const bPen = Number(s?.PenetrationFactor || 0);
    const bArmorDmg = Number(s?.ArmorDamage || 0);
    const wMod = Number(ws?.AdapterAdjustDamage || 0);
    const bluntCoeff = Number(s?.BulletBlockDamageFactor ?? 0.05);
    const muzzleVel = Number(ws?.MuzzleVelocity || 0);
    const bulletSpeed = Number(s?.BaseSpeed || 0) / 100;
    const effectiveVel = Math.max(muzzleVel, bulletSpeed) || 800;
    const travelTime = range > 0 ? range / effectiveVel : 0;
    const rpm = Number(ws?.FireRate || 0);
    const fireInterval = rpm > 0 ? 60 / rpm : 0;
    const dd = selectedWeapon.damageDistance;
    const zeroDrop = Number(ws?.ZeroDropDistance ?? 0);
    const { factor: distFactor, effectiveRange } = calcDistanceFactor(range, dd, zeroDrop);

    // ── Helmet simulation ──
    if (selectedHelmet) {
      const hs = selectedHelmet.stats as Record<string, unknown>;
      const hl = Number(hs?.armor_level ?? 0);
      const hd = Number(selectedHelmet.durabilityMax ?? 0) / 10;
      const hblunt = Number(hs?.armor_damagescaleforblock ?? 0.01);
      const hrAng = Number(hs?.armor_ricochetangle ?? 0);
      const hrMin = Number(hs?.armor_ricochetprobabilitymin ?? 0);
      const hrMax = Number(hs?.armor_ricochetprobabilitymax ?? 0);
      const hpCoeff = Number(hs?.armor_penetrate_coefficient ?? 1);
      const hpConst = Number(hs?.armor_penetrate_coefficient_constant ?? 0);
      const hp = 40; // head HP

      const sim = simulate(bDmg, wMod, 0, bPen, bArmorDmg, bluntCoeff, distFactor,
        hl, hd, hblunt,
        true, impactAngle, hrAng, hrMin, hrMax, hpCoeff, hpConst,
        hp, seed);
      const headTtk = travelTime + Math.max(0, (sim.shots.findIndex(s => s.kill) + 1 || sim.shots.length) - 1) * fireInterval;
      setHelmetResult({ ...sim, effectiveRange, travelTime, fireInterval, ttk: headTtk, rpm });
    }

    // ── Armor simulation ──
    if (selectedArmor) {
      const as = selectedArmor.stats as Record<string, unknown>;
      const al = Number(as?.armor_level ?? 0);
      const ad = Number(selectedArmor.durabilityMax ?? 0) / 10;
      const apCoeff = Number(as?.armor_penetrate_coefficient ?? 1);
      const apConst = Number(as?.armor_penetrate_coefficient_constant ?? 0);
      const chestHP = 85;

      const sim = simulate(bDmg, wMod, 0, bPen, bArmorDmg, bluntCoeff, distFactor,
        al, ad, -1,
        false, 0, 0, 0, 0, apCoeff, apConst,
        chestHP, seed + 9999);
      const chestTtk = travelTime + Math.max(0, (sim.shots.findIndex(s => s.kill) + 1 || sim.shots.length) - 1) * fireInterval;
      setArmorResult({ ...sim, effectiveRange, travelTime, fireInterval, ttk: chestTtk, rpm });
    }

    // ── Limb simulation (leg meta) ──
    // Full limb model (user-verified): legs 65, abdomen 70, chest 85,
    // arms 60, head 40. Unarmored limbs take FULL damage; overflow cascades
    // leg→abdomen→chest / arm→chest / abdomen→chest, bypassing armor.
    // Chest 0 = DOWN (dead if solo); head 0 = instant kill.
    const chestArmor = selectedArmor && limbTarget === 'chest' ? {
      level: Number(selectedArmor.stats?.armor_level ?? 0),
      dur: Number(selectedArmor.durabilityMax ?? 0) / 10,
      blockScale: 0,
      ricochetAngle: 0, ricochetProbMin: 0, ricochetProbMax: 0,
      penCoeff: Number(selectedArmor.stats?.armor_penetrate_coefficient ?? 1),
      penConst: Number(selectedArmor.stats?.armor_penetrate_coefficient_constant ?? 0),
      isHelmet: false,
    } : undefined;
    const headArmor = selectedHelmet && limbTarget === 'head' ? {
      level: Number(selectedHelmet.stats?.armor_level ?? 0),
      dur: Number(selectedHelmet.durabilityMax ?? 0) / 10,
      blockScale: Number(selectedHelmet.stats?.armor_damagescaleforblock ?? 0.01),
      ricochetAngle: Number(selectedHelmet.stats?.armor_ricochetangle ?? 0),
      ricochetProbMin: Number(selectedHelmet.stats?.armor_ricochetprobabilitymin ?? 0),
      ricochetProbMax: Number(selectedHelmet.stats?.armor_ricochetprobabilitymax ?? 0),
      penCoeff: Number(selectedHelmet.stats?.armor_penetrate_coefficient ?? 1),
      penConst: Number(selectedHelmet.stats?.armor_penetrate_coefficient_constant ?? 0),
      isHelmet: true,
    } : undefined;

    const limbSim = simulateLimb({
      bulletDmg: bDmg, weaponMod: wMod, barrelMod: 0,
      bulletPen: bPen, bulletArmorDmg: bArmorDmg, bluntCoeff,
      distanceFactor: distFactor, impactAngle,
      target: limbTarget,
      chestArmor, headArmor,
      solo, seed: seed + 4242,
    });
    const limbTtk = travelTime + Math.max(0, limbSim.shots - 1) * fireInterval;
    setLimbResult({ ...limbSim, ttk: limbTtk, distanceFactor: distFactor, effectiveRange, travelTime, fireInterval, rpm });
  }, [selectedWeapon, selectedBullet, selectedHelmet, selectedArmor, range, seed, impactAngle, limbTarget, solo]);

  useEffect(() => { runSim(); }, [runSim]);

  const filteredWeapons = weapons.filter(w => !weaponSearch || getName(String(w.id)).toLowerCase().includes(weaponSearch.toLowerCase()));

  if (loading) return (
    <main className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
    </main>
  );

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      <div className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/tracker" className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#D4AF37] transition-colors mb-3">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Tracker
          </Link>
          <h1 className="text-2xl font-bold font-display text-gradient">Shooting Range</h1>
          <p className="text-xs text-[#9CA3AF]">Full ballistics: ricochet, penetration, range falloff, armor durability & true TTK</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ── Shared Controls Row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          {/* Weapon */}
          <div className="glass rounded-xl p-3">
            <label className="block text-[10px] text-[#D4AF37] uppercase tracking-wider mb-1.5">Weapon</label>
            <input type="text" placeholder="Search..." value={weaponSearch}
              onChange={e => setWeaponSearch(e.target.value)}
              className="w-full glass rounded-lg px-2 py-1.5 text-xs text-white placeholder-[#6B7280] outline-none focus:border-[#D4AF37]/50 transition-colors mb-1.5" />
            <select size={5} value={selectedWeapon?.id ?? ''} onChange={e => { const w = weapons.find(x => x.id === Number(e.target.value)); if (w) setSelectedWeapon(w); }}
              className="w-full text-xs bg-[#1a1a1a] text-[#9CA3AF] border border-white/5 rounded-lg outline-none">
              {filteredWeapons.slice(0, 50).map(w => (
                <option key={w.id} value={w.id} className="bg-[#1a1a1a]">{getName(String(w.id))}</option>
              ))}
            </select>
            {selectedWeapon && (
              <div className="flex gap-2 mt-1 text-[9px] text-[#6B7280]">
                <span>RPM:{String(selectedWeapon.stats?.FireRate ?? '?')}</span>
                <span>Vel:{String(selectedWeapon.stats?.MuzzleVelocity ?? '?')}</span>
                <span>DMG mod:{String(selectedWeapon.stats?.AdapterAdjustDamage ?? '0')}</span>
              </div>
            )}
          </div>

          {/* Ammo */}
          <div className="glass rounded-xl p-3">
            <label className="block text-[10px] text-[#D4AF37] uppercase tracking-wider mb-1.5">Ammunition</label>
            {/* Tier filter */}
            <div className="flex flex-wrap gap-1 mb-1.5">
              <button onClick={() => setAmmoTier(-1)}
                className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${ammoTier === -1 ? 'bg-[#D4AF37] text-black' : 'bg-white/5 text-[#9CA3AF] hover:text-white'}`}>All</button>
              {[...Array(8)].map((_, i) => (
                <button key={i} onClick={() => setAmmoTier(i)}
                  className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${ammoTier === i ? 'bg-[#D4AF37] text-black' : 'bg-white/5 text-[#9CA3AF] hover:text-white'}`}>T{i}</button>
              ))}
            </div>
            <div className="max-h-36 overflow-y-auto space-y-0.5">
              {(() => {
                const filtered = compatibleBullets
                  .filter(b => ammoTier < 0 || Number((b.stats as Record<string, unknown>)?.PenetrationLevel ?? -1) === ammoTier)
                  .sort((a, b) => {
                    const ta = Number((a.stats as Record<string, unknown>)?.PenetrationLevel ?? 0);
                    const tb = Number((b.stats as Record<string, unknown>)?.PenetrationLevel ?? 0);
                    if (ta !== tb) return tb - ta; // higher tier first
                    return (getName(String(a.id))).localeCompare(getName(String(b.id)));
                  });
                return filtered.length === 0
                  ? <p className="text-xs text-[#6B7280]">No compatible ammo</p>
                  : filtered.map(b => {
                      const bs = b.stats as Record<string, unknown>;
                      return (
                        <button key={b.id} onClick={() => setSelectedBullet(b)}
                          className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors ${
                            selectedBullet?.id === b.id ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'text-[#9CA3AF] hover:text-white hover:bg-white/5'
                          }`}>
                          {getName(String(b.id))}
                          <span className="text-[9px] ml-1 opacity-60">T{String(bs?.PenetrationLevel ?? '?')} DMG:{String(bs?.BaseDamage ?? '?')} PEN:{String(bs?.PenetrationFactor ?? '?')} Armor:{String(bs?.ArmorDamage ?? '?')}</span>
                        </button>
                      );
                    });
              })()}
            </div>
          </div>

          {/* Range */}
          <div className="glass rounded-xl p-3">
            <label className="block text-[10px] text-[#D4AF37] uppercase tracking-wider mb-1.5">Range</label>
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={300} step={5} value={range}
                onChange={e => setRange(Number(e.target.value))}
                className="flex-1 accent-[#D4AF37]" />
              <span className="text-white font-mono text-xs w-12 text-right">{range}m</span>
            </div>
            <div className="flex justify-between text-[9px] text-[#6B7280] mt-0.5">
              <span>0m</span>
              <span>Eff range: {Math.round((selectedWeapon?.damageDistance?.damageModifyZeroDistance ?? 0) / 100)}m</span>
              <span>300m</span>
            </div>
          </div>

          {/* Angle */}
          <div className="glass rounded-xl p-3">
            <label className="block text-[10px] text-[#D4AF37] uppercase tracking-wider mb-1.5">Bullet Angle</label>
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={90} step={1} value={impactAngle}
                onChange={e => setImpactAngle(Number(e.target.value))}
                className="flex-1 accent-[#D4AF37]" />
              <span className="text-white font-mono text-xs w-10 text-right">{impactAngle}°</span>
            </div>
            <div className="text-[9px] text-[#6B7280] mt-0.5 text-center">
              {selectedHelmet && Number((selectedHelmet.stats as Record<string, unknown>)?.armor_ricochetangle || 0) > 0
                ? `Ricochet threshold: ${(selectedHelmet.stats as Record<string, unknown>)?.armor_ricochetangle}°`
                : 'Angle affects helmet ricochet'}
            </div>
          </div>

          {/* Reroll Button */}
          <div className="flex items-end mb-1">
            <button onClick={() => setSeed(Math.floor(Math.random() * 99999999))}
              className="w-full px-3 py-2 rounded-lg text-xs bg-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/30 transition-colors">
              ↻ Reroll Both
            </button>
          </div>
        </div>

        {/* ── Side-by-side selectors ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Helmet Select */}
          <div className="glass rounded-xl p-3">
            <label className="block text-[10px] text-[#D4AF37] uppercase tracking-wider mb-1.5">
              Helmet <span className="text-[#6B7280]">({helmets.length})</span>
            </label>
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {helmets
                .slice()
                .sort((a, b) => {
                  const la = Number((a.stats as Record<string, unknown>)?.armor_level ?? 0);
                  const lb = Number((b.stats as Record<string, unknown>)?.armor_level ?? 0);
                  if (la !== lb) return lb - la;
                  return (getName(String(a.id))).localeCompare(getName(String(b.id)));
                })
                .map(h => {
                const hs = h.stats as Record<string, unknown>;
                const ric = Number(hs?.armor_ricochetangle || 0);
                return (
                  <button key={h.id} onClick={() => setSelectedHelmet(h)}
                    className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors ${
                      selectedHelmet?.id === h.id ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'text-[#9CA3AF] hover:text-white hover:bg-white/5'
                    }`}>
                    {getName(String(h.id))}
                    <span className="text-[9px] ml-1 opacity-60">
                      Lv{String(hs?.armor_level ?? '?')} P:{String(hs?.armor_antipenetrationfactor ?? '?')} Dur:{(h.durabilityMax ?? 0) / 10}
                      {ric > 0 ? ` Ric:${ric}°` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedHelmet && (
              <div className="flex gap-2 mt-1 text-[9px] text-[#6B7280] flex-wrap">
                <span>Destruct:{String((selectedHelmet.stats as Record<string, unknown>)?.armor_destructibility ?? '')}</span>
                <span>Ric: {String((selectedHelmet.stats as Record<string, unknown>)?.armor_ricochetangle ?? '')}° ({(Number((selectedHelmet.stats as Record<string, unknown>)?.armor_ricochetprobabilitymin || 0) * 100).toFixed(0)}-{(Number((selectedHelmet.stats as Record<string, unknown>)?.armor_ricochetprobabilitymax || 0) * 100).toFixed(0)}%)</span>
              </div>
            )}
          </div>

          {/* Armor Select */}
          <div className="glass rounded-xl p-3">
            <label className="block text-[10px] text-[#D4AF37] uppercase tracking-wider mb-1.5">
              Armor / Rig <span className="text-[#6B7280]">({vests.length})</span>
            </label>
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {vests
                .slice()
                .sort((a, b) => {
                  const la = Number((a.stats as Record<string, unknown>)?.armor_level ?? 0);
                  const lb = Number((b.stats as Record<string, unknown>)?.armor_level ?? 0);
                  if (la !== lb) return lb - la;
                  return (getName(String(a.id))).localeCompare(getName(String(b.id)));
                })
                .map(v => {
                const vs = v.stats as Record<string, unknown>;
                return (
                  <button key={v.id} onClick={() => setSelectedArmor(v)}
                    className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors ${
                      selectedArmor?.id === v.id ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'text-[#9CA3AF] hover:text-white hover:bg-white/5'
                    }`}>
                    {getName(String(v.id))}
                    <span className="text-[9px] ml-1 opacity-60">
                      Lv{String(vs?.armor_level ?? '?')} P:{String(vs?.armor_antipenetrationfactor ?? '?')} Dur:{(v.durabilityMax ?? 0) / 10}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedArmor && (
              <div className="flex gap-2 mt-1 text-[9px] text-[#6B7280] flex-wrap">
                <span>Destruct:{String((selectedArmor.stats as Record<string, unknown>)?.armor_destructibility ?? '')}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Side-by-side Results ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Helmet Results */}
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-green-400">
                Helmet Simulation
                {selectedHelmet ? <span className="text-[10px] text-[#6B7280] ml-1">({getName(String(selectedHelmet.id))})</span> : ''}
              </h2>
              {helmetResult && (
                <span className="text-xs text-white font-mono">
                  TTK: {(helmetResult.ttk * 1000).toFixed(0)}ms
                </span>
              )}
            </div>

            {!selectedHelmet ? (
              <p className="text-xs text-[#6B7280] text-center py-4">Select a helmet</p>
            ) : !helmetResult || helmetResult.shots.length === 0 ? (
              <p className="text-xs text-[#6B7280] text-center py-4">No shots</p>
            ) : (
              <>
                {helmetResult.shots[0] && (
                  <div className="text-[9px] text-[#6B7280] mb-2 flex gap-2 flex-wrap">
                    <span>Dist: ×{helmetResult.distanceFactor.toFixed(3)}</span>
                    <span>Eff range: {helmetResult.effectiveRange.toFixed(0)}m</span>
                    <span>Travel: {(helmetResult.travelTime * 1000).toFixed(0)}ms</span>
                    <span>RPM: {helmetResult.rpm}</span>
                  </div>
                )}
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {helmetResult.shots.map(s => (
                    <div key={s.shot} className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                      s.kill ? 'bg-green-500/10' : s.ricochet ? 'bg-blue-500/10' : s.penetrated ? 'bg-green-500/5' : ''
                    }`}>
                      <div className="flex justify-between items-center">
                        <span className="text-[#9CA3AF] w-5">#{s.shot}</span>
                        <span className={
                          s.ricochet ? 'text-blue-400 font-bold' :
                          s.penetrated ? 'text-green-400' : 'text-yellow-400'
                        }>
                          {s.ricochet ? '✦ RICO' : s.penetrated ? '✓ PEN' : '✗ BLOCK'}
                        </span>
                        <span className="text-white">{s.damage} dmg</span>
                        <span className={s.kill ? 'text-green-400 font-bold' : 'text-[#9CA3AF]'}>{s.remainingHP} HP</span>
                      </div>
                      {!s.ricochet && (
                        <div className="flex justify-between text-[9px] pl-5 text-[#6B7280]">
                          <span>{getBranchLabel(s.branchName)}</span>
                          {s.remainingDurability > 0 && <span>Dur: {s.remainingDurability.toFixed(1)}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-[#6B7280] px-1">
                  <span>Head (40 HP) — {helmetResult.shots.filter(s => s.kill).length > 0
                    ? `Killed shot #${helmetResult.shots.findIndex(s => s.kill) + 1}`
                    : `${helmetResult.shots.length} shots`}</span>
                  <span>Dur left: {helmetResult.durabilityLeft.toFixed(1)} / TTK {(helmetResult.ttk * 1000).toFixed(0)}ms</span>
                </div>
              </>
            )}
          </div>

          {/* Armor Results */}
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-orange-400">
                Armor / Rig Simulation
                {selectedArmor ? <span className="text-[10px] text-[#6B7280] ml-1">({getName(String(selectedArmor.id))})</span> : ''}
              </h2>
              {armorResult && (
                <span className="text-xs text-white font-mono">
                  TTK: {(armorResult.ttk * 1000).toFixed(0)}ms
                </span>
              )}
            </div>

            {!selectedArmor ? (
              <p className="text-xs text-[#6B7280] text-center py-4">Select armor</p>
            ) : !armorResult || armorResult.shots.length === 0 ? (
              <p className="text-xs text-[#6B7280] text-center py-4">No shots</p>
            ) : (
              <>
                {armorResult.shots[0] && (
                  <div className="text-[9px] text-[#6B7280] mb-2 flex gap-2 flex-wrap">
                    <span>Dist: ×{armorResult.distanceFactor.toFixed(3)}</span>
                    <span>Eff range: {armorResult.effectiveRange.toFixed(0)}m</span>
                    <span>Travel: {(armorResult.travelTime * 1000).toFixed(0)}ms</span>
                    <span>RPM: {armorResult.rpm}</span>
                  </div>
                )}
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {armorResult.shots.map(s => (
                    <div key={s.shot} className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                      s.kill ? 'bg-orange-500/10' : s.penetrated ? 'bg-orange-500/5' : ''
                    }`}>
                      <div className="flex justify-between items-center">
                        <span className="text-[#9CA3AF] w-5">#{s.shot}</span>
                        <span className={s.penetrated ? 'text-orange-400' : 'text-yellow-400'}>
                          {s.penetrated ? '✓ PEN' : '✗ BLOCK'}
                        </span>
                        <span className="text-white">{s.damage} dmg</span>
                        <span className={s.kill ? 'text-orange-400 font-bold' : 'text-[#9CA3AF]'}>{s.remainingHP} HP</span>
                      </div>
                      <div className="flex justify-between text-[9px] pl-5 text-[#6B7280]">
                        <span>{getBranchLabel(s.branchName)}</span>
                        {s.remainingDurability > 0 && <span>Dur: {s.remainingDurability.toFixed(1)}</span>}
                      </div>
                      {s.effectiveProt > 0 && (
                        <div className="text-[9px] pl-5 text-[#6B7280]">
                          Prot: {s.effectiveProt.toFixed(1)} Pen: {s.effectivePen.toFixed(1)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-[#6B7280] px-1">
                  <span>Chest (85 HP) — {armorResult.shots.filter(s => s.kill).length > 0
                    ? `Killed shot #${armorResult.shots.findIndex(s => s.kill) + 1}`
                    : `${armorResult.shots.length} shots`}</span>
                  <span>Dur left: {armorResult.durabilityLeft.toFixed(1)} / TTK {(armorResult.ttk * 1000).toFixed(0)}ms</span>
                </div>
              </>
            )}
          </div>

          {/* Limb Sim Results (leg meta) */}
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-purple-400">
                Limb Sim (leg meta)
                <span className="text-[10px] text-[#6B7280] ml-1">leg → abdomen → arms → chest → head · chest/head floor at 1 · overflow bypasses armor</span>
              </h2>
              {limbResult && (
                <span className="text-xs text-white font-mono">
                  {limbResult.outcome === 'survived' ? 'Survived'
                    : limbResult.outcome === 'down' ? `DOWN ${(limbResult.ttk * 1000).toFixed(0)}ms`
                    : `KILLED ${(limbResult.ttk * 1000).toFixed(0)}ms`}
                </span>
              )}
            </div>

            {/* Target selector */}
            <div className="flex flex-wrap gap-1 mb-2">
              {(Object.keys(LIMB_HP) as LimbName[]).map(l => (
                <button key={l} onClick={() => setLimbTarget(l)}
                  className={`px-2 py-1 rounded text-[10px] border transition-colors ${
                    limbTarget === l
                      ? 'bg-purple-500/20 border-purple-400 text-purple-300'
                      : 'border-[#2A2A2A] text-[#9CA3AF] hover:border-purple-400/40'
                  }`}>
                  {LIMB_LABELS[l]} <span className="text-[#6B7280]">{LIMB_HP[l]}</span>
                </button>
              ))}
            </div>

            {/* Solo toggle */}
            <label className="flex items-center gap-2 mb-2 cursor-pointer text-[10px] text-[#9CA3AF]">
              <input type="checkbox" checked={solo} onChange={e => setSolo(e.target.checked)} className="accent-purple-500" />
              Solo mode — chest 0 = death (no revive)
            </label>

            {!selectedWeapon || !selectedBullet ? (
              <p className="text-xs text-[#6B7280] text-center py-4">Select weapon + ammo</p>
            ) : !limbResult || limbResult.log.length === 0 ? (
              <p className="text-xs text-[#6B7280] text-center py-4">No shots</p>
            ) : (
              <>
                {/* Outcome banner */}
                <div className={`rounded-lg px-3 py-2 mb-2 text-[11px] font-bold ${
                  limbResult.outcome === 'survived' ? 'bg-[#1F2937] text-[#9CA3AF]'
                  : limbResult.outcome === 'down' ? 'bg-purple-500/15 text-purple-300'
                  : 'bg-red-500/15 text-red-400'
                }`}>
                  {limbResult.outcome === 'survived' && 'SURVIVED — 30 shots, target not downed'}
                  {limbResult.outcome === 'down' && `⬇ DOWN on shot #${limbResult.shots} — teammate can revive`}
                  {limbResult.outcome === 'dead_solo' && `💀 KILLED on shot #${limbResult.shots} (solo — down = death)`}
                  {limbResult.outcome === 'dead_head' && `💀 KILLED on shot #${limbResult.shots} — headshot (head 0)`}
                </div>

                {/* Limb HP bars */}
                <div className="grid grid-cols-2 gap-1 mb-2">
                  {(Object.keys(LIMB_HP) as LimbName[]).map(l => {
                    const max = LIMB_HP[l];
                    const cur = limbResult.finalHP[l];
                    const pct = Math.max(0, Math.min(100, (cur / max) * 100));
                    const dmgTaken = limbResult.damageByLimb[l];
                    return (
                      <div key={l} className="text-[9px]">
                        <div className="flex justify-between text-[#9CA3AF]">
                          <span>{LIMB_LABELS[l]}</span>
                          <span>{cur.toFixed(0)}/{max}{dmgTaken > 0 ? ` (−${dmgTaken.toFixed(0)})` : ''}</span>
                        </div>
                        <div className="h-1.5 bg-[#1F2937] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${l === 'head' ? 'bg-red-500' : l === 'chest' ? 'bg-purple-500' : 'bg-emerald-500'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="text-[9px] text-[#6B7280] mb-2 flex gap-2 flex-wrap">
                  <span>Dist: x{limbResult.distanceFactor.toFixed(3)}</span>
                  <span>Eff range: {limbResult.effectiveRange.toFixed(0)}m</span>
                  <span>Travel: {(limbResult.travelTime * 1000).toFixed(0)}ms</span>
                  <span>RPM: {limbResult.rpm}</span>
                </div>
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {limbResult.log.map(s => (
                    <div key={s.shot} className={`text-[11px] font-mono px-2 py-0.5 rounded ${s.shot === limbResult.shots && limbResult.outcome !== 'survived' ? 'bg-purple-500/10' : ''}`}>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[#9CA3AF] w-5">#{s.shot}</span>
                        <span className="text-purple-400 flex-1 truncate">
                          {s.applied.map(h => `${LIMB_LABELS[h.limb]} −${h.dmg.toFixed(0)}`).join(' · ')}
                        </span>
                        <span className="text-white">{s.entryDamage.toFixed(0)} dmg</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-[#6B7280] px-1">
                  <span>{limbResult.outcome === 'survived' ? '30 shots (survived)' : `Ended shot #${limbResult.shots}`}</span>
                  <span>Total HP: 445 / TTK {(limbResult.ttk * 1000).toFixed(0)}ms</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
