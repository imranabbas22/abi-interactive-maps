// ── Shared ABI Ballistics Engine ──
// Extracted from simulator/page.tsx for reuse in aim-lab

export interface DamageDistance {
  damage: number;
  damageMin: number;
  damageModifyZeroDistance: number;
  damageDistanceModifier: number;
  bulletBeginDropDistance: number;
}

export interface ShotRecord {
  shot: number;
  penetrated: boolean;
  ricochet: boolean;
  damage: number;
  durabilityLost: number;
  remainingHP: number;
  remainingDurability: number;
  kill: boolean;
  penChance: number;
  randomRoll: number;
  effectiveProt: number;
  effectivePen: number;
  durProtRate: number;
  branchName: string;
}

export interface SimResult {
  shots: ShotRecord[];
  durabilityLeft: number;
  distanceFactor: number;
  effectiveRange: number;
  travelTime: number;
  fireInterval: number;
  ttk: number;
  rpm: number;
}

// ── Distance Factor (falloff) ──────────────────────────────
// Effective range = weapon ZeroDropDistance/100 (matches the game's
// displayed "Range Xm" — verified: AEK 5900→59m, AKM 5400→54m, MG3
// 15000→150m vs abi-tracker avg_shots labels; in-game: G3-12" 36m).
// Past effective range: FLAT ×0.70 step (30% lost) — verified from
// skrux "DAMAGE IN AND OUT OF RANGE" sheet (130 weapon×ammo rows, all
// 0.70) and in-game readings (G3 47→33, MK14 58→41 at out-of-range).
export function calcDistanceFactor(range: number, dd: DamageDistance | null | undefined, zeroDropUnits?: number): { factor: number; effectiveRange: number } {
  const zeroDrop = zeroDropUnits && zeroDropUnits > 0 ? zeroDropUnits : dd?.damageModifyZeroDistance;
  if (!zeroDrop) return { factor: 1.0, effectiveRange: 0 };
  const effRange = zeroDrop / 100;
  if (range <= effRange) return { factor: 1.0, effectiveRange: effRange };
  return { factor: 0.70, effectiveRange: effRange };
}

// ── Durability Protection Rate ──────────────────────────────────
export function calcDurProtRate(currentDur: number, maxDur: number): number {
  if (maxDur <= 0) return 1.0;
  const ratio = currentDur / maxDur;
  return Math.min(1, 1.21 - 50 / (200 * Math.pow(ratio, 1.2) + 45));
}

// ── Effective Protection ─────────────────────────────────────────
export function calcEffectiveProtection(armorLevel: number, currentDur: number, maxDur: number): number {
  return (armorLevel * 10) * calcDurProtRate(currentDur, maxDur);
}

// ── Ricochet Chance (helmet only) ────────────────────────────────
export function calcRicochetChance(
  isHelmet: boolean,
  impactAngle: number,
  ricochetAngle: number,
  ricochetProbMin: number,
  ricochetProbMax: number
): number {
  if (!isHelmet || ricochetAngle <= 0 || impactAngle < ricochetAngle) return 0;
  const t = Math.min(1, (impactAngle - ricochetAngle) / (90 - ricochetAngle));
  return ricochetProbMin + (ricochetProbMax - ricochetProbMin) * t;
}

// ── Penetration Chance ───────────────────────────────────────────
export function calcPenChance(
  effectivePen: number,
  effectiveProt: number,
  currentDur: number,
  maxDur: number,
  isHelmet: boolean,
  penCoeff: number,
  penConstant: number
): { chance: number; branch: string } {
  if (currentDur <= 0) return { chance: 100, branch: 'armor_destroyed' };
  const diff = effectivePen - effectiveProt;
  if (diff < -15) return { chance: 0, branch: 'overmatch_-15' };
  const full = currentDur / maxDur > 0.9999;

  if (diff < -10) {
    if (full) return { chance: 0, branch: 'full_dur_+10' };
    if (isHelmet) {
      return { chance: Math.min(penConstant * 100, 100), branch: 'non_full_+10_helmet_const' };
    } else {
      const c = Math.sqrt(Math.abs(effectivePen - effectiveProt + 21)) * penCoeff * 0.0316195525;
      return { chance: Math.min(c * 100, 100), branch: 'non_full_+10_armor_sqrt' };
    }
  }

  if (diff < 0) {
    if (full) return { chance: 0, branch: 'full_dur_gt' };
    if (isHelmet) {
      const c = ((effectivePen - effectiveProt) * 0.02 + 0.31) * penCoeff;
      return { chance: Math.min(Math.max(c * 100, 0), 100), branch: 'helmet_linear_formula' };
    } else {
      const c = Math.pow(Math.abs(effectivePen - effectiveProt + 21), 2 / 3) * penCoeff * 0.0407166146;
      return { chance: Math.min(c * 100, 100), branch: 'armor_2/3_power' };
    }
  }

  // Pen >= Prot
  const c = 1 + 0.01 * effectivePen / (0.9 * effectiveProt - effectivePen);
  const pct = c * 100;
  if (pct > 89.989996) return { chance: 100, branch: 'pen_ge_prot_100' };
  return { chance: Math.min(pct, 100), branch: 'pen_ge_prot' };
}

// ── Seeded PRNG ──────────────────────────────────────────────────
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// ── Pen Damage Scale (verified vs abi-tracker Damage Overview) ──
// Based on BASE diff (bulletPen - armorLevel*10), NOT effective protection.
// diff=3 → 0.665, diff=8 → 0.69, diff=11 → 0.91 (all verified)
export function calcPenDamageScale(baseDiff: number): number {
  if (baseDiff < -10) return 0.60;
  if (baseDiff <= 9) return 0.65 + baseDiff * 0.005;
  if (baseDiff <= 19) return 0.80 + baseDiff * 0.01;
  return 1.0;
}

// ── Run Full Simulation ──────────────────────────────────────────
export function simulate(
  bulletDmg: number, weaponMod: number, barrelMod: number,
  bulletPen: number, bulletArmorDmg: number, bluntCoeff: number,
  distanceFactor: number,
  armorLevel: number, armorDur: number,
  armorDamageScaleForBlock: number,
  isHelmet: boolean, impactAngle: number,
  ricochetAngle: number, ricochetProbMin: number, ricochetProbMax: number,
  penCoeff: number, penConstant: number,
  hp: number, seed: number
): SimResult {
  const shots: ShotRecord[] = [];
  let currentDur = armorDur;
  let remainingHP = hp;
  const rand = seededRandom(seed);
  // Distance factor applies to BASE DAMAGE only — pen and armor damage
  // stay full out of effective range (user-verified game behavior).
  // Applied to TOTAL (bullet + weapon mods): G3-12" M62 47→33 = 47×0.7.
  const scaledPen = bulletPen;
  const scaledArmorDmg = bulletArmorDmg;

  // Pen damage scale from BASE protection (verified — durability loss uses the SAME scale)
  const baseArmorProt = armorLevel * 10;
  const penDamageScale = calcPenDamageScale(bulletPen - baseArmorProt);

  for (let i = 1; i <= 30 && remainingHP > 0; i++) {
    const effectiveProt = calcEffectiveProtection(armorLevel, currentDur, armorDur);
    const durProtRate = calcDurProtRate(currentDur, armorDur);

    // Step 1: Ricochet check (helmet only)
    let ricochet = false;
    if (isHelmet && currentDur > 0) {
      const ricochetChance = calcRicochetChance(true, impactAngle, ricochetAngle, ricochetProbMin, ricochetProbMax);
      ricochet = rand() * 100 < ricochetChance * 100;
    }

    // Step 2: Penetration check
    let penetrated = false;
    let penChance = 0;
    let branch = '';
    if (ricochet) {
      branch = 'ricochet';
    } else {
      const result = calcPenChance(scaledPen, effectiveProt, currentDur, armorDur, isHelmet, penCoeff, penConstant);
      penChance = result.chance;
      branch = result.branch;
      const roll = rand() * 100;
      penetrated = roll <= penChance;
    }

    // Durability loss = armor dmg × pen damage scale (same for block AND pen).
    // armor_destructibility is NOT used — verified against Damage Overview data.
    let durLoss: number;
    if (ricochet) {
      durLoss = 0;
    } else {
      durLoss = scaledArmorDmg * penDamageScale;
    }

    // Damage calculation
    let damage: number;
    if (ricochet) {
      damage = 0;
    } else if (penetrated) {
      const base = (bulletDmg + weaponMod + barrelMod) * distanceFactor;
      damage = Math.round(base * penDamageScale);
    } else {
      if (isHelmet && armorDamageScaleForBlock > 0) {
        damage = Math.round((bulletDmg + weaponMod + barrelMod) * armorDamageScaleForBlock * distanceFactor);
      } else {
        damage = Math.round((bulletDmg + weaponMod + barrelMod) * bluntCoeff * distanceFactor);
      }
      if (damage < 1) damage = 1;
    }

    if (currentDur > 0) {
      currentDur = Math.max(0, Math.round((currentDur - durLoss) * 100) / 100);
    }
    remainingHP = Math.max(0, Math.round((remainingHP - damage) * 1000) / 1000);

    shots.push({
      shot: i, penetrated: !ricochet && penetrated, ricochet,
      damage, durabilityLost: durLoss,
      remainingHP, remainingDurability: currentDur,
      kill: remainingHP <= 0,
      penChance, randomRoll: 0,
      effectiveProt, effectivePen: scaledPen, durProtRate, branchName: branch,
    });
  }

  return { shots, durabilityLeft: currentDur, distanceFactor, effectiveRange: 0, travelTime: 0, fireInterval: 0, ttk: 0, rpm: 0 };
}

// ── Limb Model (leg meta) ─────────────────────────────────────
// User-verified: each leg 65, abdomen 70, chest 85, each arm 60, head 40 HP.
// Unarmored limbs take FULL damage (no multipliers — verified: leg hit does
// full ammo damage). Overflow when a limb reaches 0: leg → abdomen → chest,
// arm → chest, abdomen → chest. Overflow BYPASSES armor (that's the point of
// leg meta). Chest 0 = DOWN (revivable; dead if solo). Head 0 = instant KILL
// regardless of other limbs.

export type LimbName = 'head' | 'chest' | 'abdomen' | 'l_arm' | 'r_arm' | 'l_leg' | 'r_leg';

export const LIMB_HP: Record<LimbName, number> = {
  head: 40, chest: 85, abdomen: 70, l_arm: 60, r_arm: 60, l_leg: 65, r_leg: 65,
};

export const LIMB_LABELS: Record<LimbName, string> = {
  head: 'Head', chest: 'Chest', abdomen: 'Abdomen', l_arm: 'L Arm', r_arm: 'R Arm',
  l_leg: 'L Leg', r_leg: 'R Leg',
};

export const LIMB_SPREAD: Record<LimbName, LimbName | null> = {
  l_leg: 'abdomen', r_leg: 'abdomen',
  abdomen: 'chest',
  l_arm: 'chest', r_arm: 'chest',
  chest: null, head: null,
};

export interface LimbArmorParams {
  level: number; dur: number;
  blockScale: number;           // helmet armor_damagescaleforblock
  ricochetAngle: number; ricochetProbMin: number; ricochetProbMax: number;
  penCoeff: number; penConst: number;
  isHelmet: boolean;
}

export interface LimbHit { limb: LimbName; dmg: number }

export interface LimbShotLog {
  shot: number;
  entryDamage: number;          // damage at the aimed limb (armored or not)
  applied: LimbHit[];           // how it cascaded across limbs
  penetrated: boolean;
  ricochet: boolean;
  branchName: string;
  penChance: number;
}

export interface LimbSimResult {
  shots: number;                // shots to outcome
  outcome: 'down' | 'dead_head' | 'dead_solo' | 'survived';
  finalHP: Record<LimbName, number>;
  damageByLimb: Record<LimbName, number>;
  log: LimbShotLog[];
  ttk: number; distanceFactor: number; effectiveRange: number;
  travelTime: number; fireInterval: number; rpm: number;
}

export function simulateLimb(opts: {
  bulletDmg: number; weaponMod: number; barrelMod: number;
  bulletPen: number; bulletArmorDmg: number; bluntCoeff: number;
  distanceFactor: number; impactAngle: number;
  target: LimbName;
  chestArmor?: LimbArmorParams;   // applied when aiming at chest
  headArmor?: LimbArmorParams;    // applied when aiming at head
  solo: boolean;
  seed: number;
}): LimbSimResult {
  const hp: Record<LimbName, number> = { ...LIMB_HP };
  const dmgByLimb: Record<LimbName, number> = { head: 0, chest: 0, abdomen: 0, l_arm: 0, r_arm: 0, l_leg: 0, r_leg: 0 };
  const rand = seededRandom(opts.seed);
  const base = (opts.bulletDmg + opts.weaponMod + opts.barrelMod) * opts.distanceFactor;
  let chestDur = opts.chestArmor?.dur ?? 0;
  let headDur = opts.headArmor?.dur ?? 0;
  const log: LimbShotLog[] = [];
  let outcome: LimbSimResult['outcome'] = 'survived';

  const armoredEntry = (zone: 'chest' | 'head', dur: number) => {
    const armor = zone === 'chest' ? opts.chestArmor! : opts.headArmor!;
    const effProt = calcEffectiveProtection(armor.level, dur, armor.dur);
    let ricochet = false;
    if (armor.isHelmet && dur > 0 && armor.ricochetAngle > 0 && opts.impactAngle >= armor.ricochetAngle) {
      const rc = calcRicochetChance(true, opts.impactAngle, armor.ricochetAngle, armor.ricochetProbMin, armor.ricochetProbMax);
      ricochet = rand() * 100 < rc * 100;
    }
    let penetrated = false;
    let penChance = 0;
    let branch = 'ricochet';
    if (!ricochet) {
      const res = calcPenChance(opts.bulletPen, effProt, dur, armor.dur, armor.isHelmet, armor.penCoeff, armor.penConst);
      penChance = res.chance; branch = res.branch;
      penetrated = rand() * 100 <= penChance;
    }
    const pds = calcPenDamageScale(opts.bulletPen - armor.level * 10);
    const durLoss = ricochet ? 0 : opts.bulletArmorDmg * pds;
    let damage: number;
    if (ricochet) damage = 0;
    else if (penetrated) damage = Math.round(base * pds);
    else if (armor.isHelmet && armor.blockScale > 0) damage = Math.round(base * armor.blockScale);
    else damage = Math.round(base * opts.bluntCoeff);
    if (!ricochet && !penetrated && damage < 1) damage = 1;
    return { damage, penetrated, ricochet, branch, penChance, durLoss };
  };

  for (let i = 1; i <= 30; i++) {
    let entry: ReturnType<typeof armoredEntry> | { damage: number; penetrated: boolean; ricochet: boolean; branch: string; penChance: number; durLoss: number };
    if (opts.target === 'chest' && opts.chestArmor && opts.chestArmor.level > 0 && chestDur > 0) {
      entry = armoredEntry('chest', chestDur);
      chestDur = Math.max(0, Math.round((chestDur - entry.durLoss) * 100) / 100);
    } else if (opts.target === 'head' && opts.headArmor && opts.headArmor.level > 0 && headDur > 0) {
      entry = armoredEntry('head', headDur);
      headDur = Math.max(0, Math.round((headDur - entry.durLoss) * 100) / 100);
    } else {
      entry = {
        damage: Math.max(1, Math.round(base)),
        penetrated: true, ricochet: false, penChance: 100,
        branch: (opts.target === 'chest' || opts.target === 'head') ? 'armor_destroyed' : 'unarmored_hit',
        durLoss: 0,
      };
    }

    // Cascade damage through limbs starting at the aimed limb
    let remaining = entry.damage;
    let limb: LimbName | null = opts.target;
    const applied: LimbHit[] = [];
    while (remaining > 0 && limb) {
      const hpLeft = hp[limb];
      if (hpLeft > 0) {
        const take = Math.min(hpLeft, remaining);
        hp[limb] = Math.max(0, Math.round((hpLeft - take) * 1000) / 1000);
        dmgByLimb[limb] += take;
        applied.push({ limb, dmg: take });
        remaining = Math.max(0, Math.round((remaining - take) * 1000) / 1000);
      }
      if (hp[limb] <= 0) limb = LIMB_SPREAD[limb];
      else break;
    }

    log.push({ shot: i, entryDamage: entry.damage, applied, penetrated: entry.penetrated, ricochet: entry.ricochet, branchName: entry.branch, penChance: entry.penChance });

    if (hp.head <= 0) { outcome = 'dead_head'; break; }
    if (hp.chest <= 0) { outcome = opts.solo ? 'dead_solo' : 'down'; break; }
  }

  return {
    shots: outcome === 'survived' ? log.length : log.length,
    outcome,
    finalHP: hp, damageByLimb: dmgByLimb, log,
    ttk: 0, distanceFactor: opts.distanceFactor, effectiveRange: 0, travelTime: 0, fireInterval: 0, rpm: 0,
  };
}

// ── Branch Labels ─────────────────────────────────────────────────
export function getBranchLabel(branch: string): string {
  const labels: Record<string, string> = {
    'armor_destroyed': 'Armor destroyed → 100%',
    'overmatch_-15': 'Prot > Pen+15 → 0%',
    'full_dur_+10': 'Full dur, Prot > Pen+10 → 0%',
    'non_full_+10_helmet_const': 'Not full, Prot > Pen+10 → constant',
    'non_full_+10_armor_sqrt': 'Not full, Prot > Pen+10 → sqrt curve',
    'full_dur_gt': 'Full dur, Prot > Pen → 0%',
    'helmet_linear_formula': 'Not full, Prot > Pen → linear',
    'armor_2/3_power': 'Not full, Prot > Pen → 2/3 power',
    'pen_ge_prot_100': 'Pen ≥ Prot → forced 100%',
    'pen_ge_prot': 'Pen ≥ Prot → formula',
    'ricochet': '✦ RICOCHET — 0 damage',
    'leg_hit': 'Leg hit — no armor',
    'leg_hit_L Leg': 'L Leg hit',
    'leg_hit_R Leg': 'R Leg hit',
    'leg_hit_Abdomen': 'Abdomen hit',
    'leg_hit_Chest': 'Chest hit (down!)',
  };
  return labels[branch] || branch;
}
