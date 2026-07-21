'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { simulate, getBranchLabel, calcDistanceFactor, calcDurProtRate,
         calcEffectiveProtection, calcRicochetChance, calcPenChance,
         type SimResult, type ShotRecord, type DamageDistance } from '@/lib/abiSim';

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
  const [legResult, setLegResult] = useState<SimResult | null>(null);

  const [weaponSearch, setWeaponSearch] = useState('');
  const [seed, setSeed] = useState(() => Math.floor(Date.now() / 1000));
  const [range, setRange] = useState(25);
  const [impactAngle, setImpactAngle] = useState(65);
  const [ammoTier, setAmmoTier] = useState(-1);

  useEffect(() => {
    Promise.all([
      fetch('/data/weapon-detail.json').then(r => r.json()),
      fetch('/data/bullet-detail.json').then(r => r.json()),
      fetch('/data/armor-detail.json').then(r => r.json()),
      fetch('/data/item_names.json').then(r => r.json()),
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
    const { factor: distFactor, effectiveRange } = calcDistanceFactor(range, dd);

    // ── Helmet simulation ──
    if (selectedHelmet) {
      const hs = selectedHelmet.stats as Record<string, unknown>;
      const hl = Number(hs?.armor_level ?? 0);
      const hd = Number(selectedHelmet.durabilityMax ?? 0) / 10;
      const hdest = Number(hs?.armor_destructibility ?? 0.3);
      const hblunt = Number(hs?.armor_damagescaleforblock ?? 0.01);
      const hrAng = Number(hs?.armor_ricochetangle ?? 0);
      const hrMin = Number(hs?.armor_ricochetprobabilitymin ?? 0);
      const hrMax = Number(hs?.armor_ricochetprobabilitymax ?? 0);
      const hpCoeff = Number(hs?.armor_penetrate_coefficient ?? 1);
      const hpConst = Number(hs?.armor_penetrate_coefficient_constant ?? 0);
      const hp = 40; // head HP

      const sim = simulate(bDmg, wMod, 0, bPen, bArmorDmg, bluntCoeff, distFactor,
        hl, hd, hdest, hblunt,
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
      const adest = Number(as?.armor_destructibility ?? 0.3);
      const apCoeff = Number(as?.armor_penetrate_coefficient ?? 1);
      const apConst = Number(as?.armor_penetrate_coefficient_constant ?? 0);
      const chestHP = 85;

      const sim = simulate(bDmg, wMod, 0, bPen, bArmorDmg, bluntCoeff, distFactor,
        al, ad, adest, -1,
        false, 0, 0, 0, 0, apCoeff, apConst,
        chestHP, seed + 9999);
      const chestTtk = travelTime + Math.max(0, (sim.shots.findIndex(s => s.kill) + 1 || sim.shots.length) - 1) * fireInterval;
      setArmorResult({ ...sim, effectiveRange, travelTime, fireInterval, ttk: chestTtk, rpm });
    }

    // ── Leg meta simulation (limb bleed-through) ──
    // Body part chain: L Leg → R Leg → Abdomen → Chest
    // L Leg: 65 HP, x0.7
    // R Leg: 65 HP, x0.7
    // Abdomen: 75 HP, x0.85
    // Chest: 85 HP, x1.0 (no armor in leg-meta context)
    const bodyParts = [
      { name: 'L Leg', hp: 65, mult: 0.7 },
      { name: 'R Leg', hp: 65, mult: 0.7 },
      { name: 'Abdomen', hp: 75, mult: 0.85 },
      { name: 'Chest', hp: 85, mult: 1.0 },
    ];
    const baseDmg = bDmg * distFactor + wMod;
    const legShots: ShotRecord[] = [];
    const curHP = bodyParts.map(b => b.hp);
    for (let i = 1; i <= 30; i++) {
      // Find the first body part that still has HP
      let targetIdx = -1;
      for (let j = 0; j < curHP.length; j++) {
        if (curHP[j] > 0) { targetIdx = j; break; }
      }
      if (targetIdx < 0) break; // all body parts down

      const target = bodyParts[targetIdx];
      const dmg = Math.round(baseDmg * target.mult * 1000) / 1000;
      let remaining = Math.round((curHP[targetIdx] - dmg) * 1000) / 1000;

      // Check for overflow to next body part
      let overflow = 0;
      let displayedDmg = dmg;
      let displayedHP = remaining;
      let displayedPart = target.name;

      if (remaining < 0) {
        overflow = -remaining; // excess damage in this body part's space
        // Convert overflow back to base damage space, then apply to next part
        const overflowBase = overflow / target.mult;
        curHP[targetIdx] = 0;
        // Push overflow through remaining body parts
        let remOverflow = overflowBase;
        for (let k = targetIdx + 1; k < curHP.length && remOverflow > 0; k++) {
          const nextDmg = remOverflow * bodyParts[k].mult;
          if (nextDmg >= curHP[k]) {
            remOverflow -= curHP[k] / bodyParts[k].mult;
            curHP[k] = 0;
          } else {
            curHP[k] = Math.round((curHP[k] - nextDmg) * 1000) / 1000;
            remOverflow = 0;
          }
        }
        displayedHP = 0;
      } else {
        curHP[targetIdx] = remaining;
      }

      // Count total remaining HP across all parts
      const totalRem = curHP.reduce((a, b) => a + b, 0);
      const isDown = curHP[3] <= 0; // chest down = enemy downed

      legShots.push({
        shot: i, penetrated: true, ricochet: false,
        damage: displayedDmg,
        durabilityLost: 0,
        remainingHP: totalRem,
        remainingDurability: 0,
        kill: isDown,
        penChance: 100, randomRoll: 0, effectiveProt: 0, effectivePen: bPen * distFactor,
        durProtRate: 1, branchName: `leg_hit_${displayedPart}`,
      });

      if (isDown) break;
    }
    const legTtk = travelTime + Math.max(0, (legShots.findIndex(s => s.kill) + 1 || legShots.length) - 1) * fireInterval;
    setLegResult({ shots: legShots, durabilityLeft: 0, distanceFactor: distFactor, effectiveRange, travelTime, fireInterval, ttk: legTtk, rpm });
  }, [selectedWeapon, selectedBullet, selectedHelmet, selectedArmor, range, seed, impactAngle]);

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

          {/* Leg Meta Results */}
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-purple-400">
                Leg Meta (bleed-through)
                <span className="text-[10px] text-[#6B7280] ml-1">L Leg → R Leg → Abdomen → Chest</span>
              </h2>
              {legResult && (
                <span className="text-xs text-white font-mono">
                  Down: {(legResult.ttk * 1000).toFixed(0)}ms
                </span>
              )}
            </div>

            {!selectedWeapon || !selectedBullet ? (
              <p className="text-xs text-[#6B7280] text-center py-4">Select weapon + ammo</p>
            ) : !legResult || legResult.shots.length === 0 ? (
              <p className="text-xs text-[#6B7280] text-center py-4">No shots</p>
            ) : (
              <>
                {legResult.shots[0] && (
                  <div className="text-[9px] text-[#6B7280] mb-2 flex gap-2 flex-wrap">
                    <span>Dist: x{legResult.distanceFactor.toFixed(3)}</span>
                    <span>Eff range: {legResult.effectiveRange.toFixed(0)}m</span>
                    <span>Travel: {(legResult.travelTime * 1000).toFixed(0)}ms</span>
                    <span>RPM: {legResult.rpm}</span>
                  </div>
                )}
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {legResult.shots.map(s => (
                    <div key={s.shot} className={`text-[11px] font-mono px-2 py-0.5 rounded ${s.kill ? 'bg-purple-500/10' : ''}`}>
                      <div className="flex justify-between items-center">
                        <span className="text-[#9CA3AF] w-5">#{s.shot}</span>
                        <span className="text-purple-400">{getBranchLabel(s.branchName)}</span>
                        <span className="text-white">{s.damage} dmg</span>
                        <span className={s.kill ? 'text-purple-400 font-bold' : 'text-[#9CA3AF]'}>{s.remainingHP} HP</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-[#6B7280] px-1">
                  <span>{legResult.shots.filter(s => s.kill).length > 0
                    ? `Down on shot #${legResult.shots.findIndex(s => s.kill) + 1}`
                    : `${legResult.shots.length} shots`}</span>
                  <span>Total HP: 290 / TTK {(legResult.ttk * 1000).toFixed(0)}ms</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
