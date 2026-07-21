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

// ── Distance Factor (step function) ─────────────────────────────
export function calcDistanceFactor(range: number, dd: DamageDistance | null | undefined): { factor: number; effectiveRange: number } {
  if (!dd || !dd.damageModifyZeroDistance) return { factor: 1.0, effectiveRange: 0 };
  const effRange = dd.damageModifyZeroDistance / 100;
  if (range <= effRange) return { factor: 1.0, effectiveRange: effRange };
  const minRatio = dd.damage > 0 ? dd.damageMin / dd.damage : 0;
  const scaled = 1.0 - dd.damageDistanceModifier * (range - effRange);
  return { factor: Math.max(minRatio, scaled), effectiveRange: effRange };
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

// ── Run Full Simulation ──────────────────────────────────────────
export function simulate(
  bulletDmg: number, weaponMod: number, barrelMod: number,
  bulletPen: number, bulletArmorDmg: number, bluntCoeff: number,
  distanceFactor: number,
  armorLevel: number, armorDur: number, armorDestruct: number,
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
  const scaledDmg = bulletDmg * distanceFactor;
  const scaledPen = bulletPen * distanceFactor;
  const scaledArmorDmg = bulletArmorDmg * distanceFactor;

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

    // Pen damage scale based on BASE armor protection
    const baseArmorProt = armorLevel * 10;
    const baseDiff = bulletPen - baseArmorProt;
    let penDamageScale: number;
    if (baseDiff < -10) penDamageScale = 0.60;
    else if (baseDiff <= 9) penDamageScale = 0.65 + baseDiff * 0.005;
    else if (baseDiff <= 19) penDamageScale = 0.80 + baseDiff * 0.01;
    else penDamageScale = 1.0;

    // Durability loss
    let durLoss: number;
    if (ricochet) {
      durLoss = 0;
    } else {
      durLoss = scaledArmorDmg * armorDestruct;
    }

    // Damage calculation
    let damage: number;
    if (ricochet) {
      damage = 0;
    } else if (penetrated) {
      const base = scaledDmg + weaponMod + barrelMod;
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
