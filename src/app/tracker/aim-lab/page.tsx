'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { simulate, getBranchLabel, calcDistanceFactor, type SimResult, type DamageDistance } from '@/lib/abiSim';
import { indexDamageOverview, indexAvgShots, parseShotCell, lookupByWeapon,
         type DamageOverviewRow, type AvgShotsRow } from '@/lib/damageData';
import { getBuildForWeapon } from '@/lib/gunsmith';
import { getCompatibleParts, buildTagIndex, GUNSMITH_CATEGORIES, type CompatiblePart, type WeaponOverrides } from '@/lib/partCompat';

interface Weapon {
  id: number;
  caliber?: string;
  stats?: Record<string, unknown>;
  supportedTags?: string[];
  damageDistance?: Record<string, unknown>;
}

interface Accessory {
  id: number;
  tag: string;
  stats?: Record<string, unknown>;
}

interface Bullet {
  id: number;
  caliber?: string;
  stats?: Record<string, unknown>;
}

interface Shot {
  x: number; y: number;
  shot: number;
  type: 'semi' | 'auto';
  aimX: number; aimY: number; // where the crosshair was when fired
}

interface CrosshairState {
  x: number; y: number; // pixel position on canvas
  radius: number;       // spread radius in pixels
  aimCmX: number;      // converted to cm (aim point)
  aimCmY: number;
}

// True extreme spread: max distance between any two shots, not just the bounding-box dimension
function groupExtremeSpread(pts: { x: number; y: number }[]): number {
  let max = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > max) max = d;
    }
  }
  return max;
}

interface RecoilProfile {
  vKick: number; hKick: number; avgKick: number;
  ceilingMoaBase: number;
}

// Bound-circle ceiling range, in MOA, driven purely by the Accuracy stat
// (0-100 rating; ~0-85 in current game data). NOTE: the weapon's AdsMoaX/Y
// data field looked like it should be the spread-cone size, but empirically
// it isn't — a high-accuracy AR had a *larger* raw AdsMoaX than a shotgun,
// backwards from real dispersion. So it's intentionally not used here;
// these constants are a placeholder scale pending real reference data.
const ACC_CEILING_MIN_MOA = 1.5; // ~100 accuracy: tight, precise cone
const ACC_CEILING_MAX_MOA = 14;  // ~0 accuracy: wide, shotgun-like cone

// eff.vRecoil/hRecoil (+ bullet V/H recoil) are RECOIL CONTROL ratings on a
// 0-100 scale — higher means LESS kick, not more. Confirmed against the
// game's own attachment data: barrels (which increase real recoil when
// shortened) apply negative deltas here, while stocks/grips (which tame
// recoil) apply positive deltas. Both keep a small floor so even a maxed-out
// weapon still has a slight kick and a non-zero cone — no gun is perfectly
// recoilless or pinpoint accurate.
function getRecoilProfile(accuracy: number, vControl: number, hControl: number): RecoilProfile {
  const CONTROL_CAP = 100;
  const KICK_FLOOR = 0.06;
  const vKick = KICK_FLOOR + (1 - KICK_FLOOR) * Math.max(0, 1 - Math.max(0, vControl) / CONTROL_CAP);
  const hKick = KICK_FLOOR + (1 - KICK_FLOOR) * Math.max(0, 1 - Math.max(0, hControl) / CONTROL_CAP);
  const accNorm = Math.min(1, Math.max(0, accuracy) / CONTROL_CAP); // 0 (worst) .. 1 (best)
  const ceilingMoaBase = ACC_CEILING_MAX_MOA - (ACC_CEILING_MAX_MOA - ACC_CEILING_MIN_MOA) * accNorm;
  return { vKick, hKick, avgKick: (vKick + hKick) / 2, ceilingMoaBase };
}

// How much of the accuracy ceiling the bound circle has bloomed open to.
// The opening shot is tight/near pinpoint (FIRST_SHOT_FRACTION of the
// ceiling); recoil control (avgKick) restrains how fast it opens up from
// there — great control barely blooms even under sustained fire, poor
// control reaches the full rated circle within a few rounds.
const FIRST_SHOT_FRACTION = 0.22;
const BLOOM_RATE = 0.35;
function getBloomMult(sustainedCount: number, avgKick: number): number {
  const bloomProgress = 1 - Math.exp(-sustainedCount * BLOOM_RATE * avgKick);
  return FIRST_SHOT_FRACTION + (1 - FIRST_SHOT_FRACTION) * bloomProgress;
}

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

export default function AimLabPage() {
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [partCatalog, setPartCatalog] = useState<Record<string, Record<string, string>>>({});
  const [partCompatOverrides, setPartCompatOverrides] = useState<Record<string, string>>({});
  const [weaponOverrides, setWeaponOverrides] = useState<WeaponOverrides>({});
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [weaponSearch, setWeaponSearch] = useState('');

  const [selectedWeapon, setSelectedWeapon] = useState<Weapon | null>(null);
  const [selectedBullet, setSelectedBullet] = useState<Bullet | null>(null);
  const [distance, setDistance] = useState(25);
  const [fireMode, setFireMode] = useState<'semi' | 'auto'>('semi');
  const [ammoTier, setAmmoTier] = useState(-1);
  const [shots, setShots] = useState<Shot[]>([]);
  const [isFiring, setIsFiring] = useState(false);
  const [roundCount, setRoundCount] = useState(0);
  const [crosshair, setCrosshair] = useState<CrosshairState>({ x: 250, y: 250, radius: 8, aimCmX: 0, aimCmY: 0 });
  const [hoveringCanvas, setHoveringCanvas] = useState(false);
  const [showSpreadPreview, setShowSpreadPreview] = useState(true);
  const [zeroDistance, setZeroDistance] = useState(50); // user-adjustable zero in ABI style
  const [drawTick, setDrawTick] = useState(0); // animation frame counter for canvas redraws

  // Scraped data states
  const [dmgOverview, setDmgOverview] = useState<Map<string, DamageOverviewRow[]>>(new Map());
  const [avgShots, setAvgShots] = useState<Map<string, AvgShotsRow[]>>(new Map());
  const [armors, setArmors] = useState<Array<{ id: number; nativeArmorType?: string; type?: number; durabilityMax?: number; stats?: Record<string, unknown> }>>([]);
  const [simArmor, setSimArmor] = useState<{ id: number; nativeArmorType?: string; type?: number; durabilityMax?: number; stats?: Record<string, unknown> } | null>(null);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [showDmgPanel, setShowDmgPanel] = useState(true);
  const [showTTKPanel, setShowTTKPanel] = useState(true);
  const [showSimPanel, setShowSimPanel] = useState(true);

  // Smart attachment system
  const [selectedAttachments, setSelectedAttachments] = useState<Record<string, CompatiblePart | null>>({});

  const tagIndex = useMemo(
    () => buildTagIndex(accessories, partCompatOverrides),
    [accessories, partCompatOverrides],
  );

  // Which of the fixed categories this weapon actually supports, in display order.
  const attachmentCategories = selectedWeapon
    ? GUNSMITH_CATEGORIES.filter(cat =>
        selectedWeapon.supportedTags?.some(t => t.startsWith('Assemble.' + cat + '.')))
    : [];

  const autoTimer = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const burstCount = useRef(0);
  const lastRecoil = useRef({ x: 0, y: 0 });
  const settleCenter = useRef({ x: 0, y: 0 }); // plateau the pattern climbs to before it settles into shake
  const mouseAim = useRef({ x: 0, y: 0 }); // live mouse-tracked aim (cm), updated on every mousemove regardless of fire state

  // ── Animation state (refs for smooth 60fps interpolation) ──
  const displayAim = useRef({ aimCmX: 0, aimCmY: 0 }); // smoothly interpolated crosshair
  const flashIntensity = useRef(0); // muzzle flash decay (1.0 → 0)
  const shakeOffset = useRef({ x: 0, y: 0 }); // screen shake decay
  const animRunning = useRef(false);
  const animFrameRef = useRef<number>(0);
  const crosshairRef = useRef(crosshair); // latest crosshair state for rAF
  const shotsRef = useRef(shots); // latest shots for rAF
  const isFiringRef = useRef(isFiring);
  const recoveryRef = useRef(false); // true while recoil is recovering
  const recoveryTarget = useRef({ aimCmX: 0, aimCmY: 0 }); // where crosshair should recover to

  // Keep refs in sync with state
  useEffect(() => { crosshairRef.current = crosshair; }, [crosshair]);
  useEffect(() => { shotsRef.current = shots; }, [shots]);
  useEffect(() => { isFiringRef.current = isFiring; }, [isFiring]);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, t);

  useEffect(() => {
    Promise.all([
      fetch('/abi-maps/data/weapon-detail.json').then(r => r.json()),
      fetch('/abi-maps/data/bullet-detail.json').then(r => r.json()),
      fetch('/abi-maps/data/item_names.json').then(r => r.json()),
      fetch('/abi-maps/data/weapon-parts.json').then(r => r.json()).catch(() => ({})),
      fetch('/abi-maps/data/damage_overview.json').then(r => r.json()).catch(() => []),
      fetch('/abi-maps/data/avg_shots.json').then(r => r.json()).catch(() => []),
      fetch('/abi-maps/data/armor-detail.json').then(r => r.json()).catch(() => []),
      fetch('/abi-maps/data/weapon-part-compat.json').then(r => r.json()).catch(() => ({})),
      fetch('/abi-maps/data/weapon-part-overrides.json').then(r => r.json()).catch(() => ({})),
    ]).then(([wd, bd, nm, pc, dov, avg, ad, compat, overrides]) => {
      setNames(nm);
      setWeapons(wd.weapons || []);
      setAccessories(wd.accessories || []);
      setPartCatalog(pc || {});
      setWeaponOverrides(overrides || {});
      setPartCompatOverrides(compat || {});
      setBullets(Array.isArray(bd) ? bd : (bd.bullets || []));
      setDmgOverview(indexDamageOverview(Array.isArray(dov) ? dov : []));
      setAvgShots(indexAvgShots(Array.isArray(avg) ? avg : []));
      setArmors(Array.isArray(ad) ? ad : (ad.armors || ad.armor || []));
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

  // ── Effective stats ──
  const getEffectiveStats = useCallback(() => {
    if (!selectedWeapon) return null;
    const ws = selectedWeapon.stats as Record<string, unknown>;
    if (!ws) return null;

    let vRec = Number(ws?.VerticalRecoil || 0);
    let hRec = Number(ws?.HorizontalRecoil || 0);
    let accStat = Number(ws?.Accuracy || 70);
    let adsMoaX = Number(ws?.AdsMoaX || 30);
    let adsMoaY = Number(ws?.AdsMoaY || 30);
    let velocity = Number(ws?.MuzzleVelocity || 800);
    let weaponZero = Number(ws?.ZeroDropDistance || 5000) / 100;
    let stability = Number(ws?.WeaponStability || 0);
    let ergonomics = Number(ws?.Engonomics || 0);
    let dmgMod = Number(ws?.AdapterAdjustDamage || 0);

    for (const [, part] of Object.entries(selectedAttachments)) {
      if (!part) continue;
      const isCatalog = part.source === 'catalog';
      const as = isCatalog ? part.raw : part.stats;
      if (!as) continue;
      if (isCatalog) {
        const cat = as as Record<string, string>;
        vRec += Number(cat['sVerticalRearSeatControl'] || 0);
        hRec += Number(cat['sHorizontalRearSeatControl'] || 0);
        ergonomics += Number(cat['sHumanMachineEfficiency'] || 0);
        accStat += Number(cat['sAccuracy'] || 0);
        stability += Number(cat['sLumbarStability'] || 0);
      } else {
        if (as.VerticalRecoil !== undefined) vRec += Number(as.VerticalRecoil);
        if (as.HorizontalRecoil !== undefined) hRec += Number(as.HorizontalRecoil);
        if (as.Accuracy !== undefined) accStat += Number(as.Accuracy);
        if (as.AdsMoaX !== undefined) adsMoaX += Number(as.AdsMoaX);
        if (as.AdsMoaY !== undefined) adsMoaY += Number(as.AdsMoaY);
        if (as.MuzzleVelocity !== undefined) velocity += Number(as.MuzzleVelocity);
        if (as.WeaponStability !== undefined) stability += Number(as.WeaponStability);
        if (as.Engonomics !== undefined) ergonomics += Number(as.Engonomics);
        if (as.AdapterAdjustDamage !== undefined) dmgMod += Number(as.AdapterAdjustDamage);
        if (as.MoaScale !== undefined) { adsMoaX += Number(as.MoaScale); adsMoaY += Number(as.MoaScale); }
      }
    }

    return {
      vRecoil: Math.max(0, vRec),
      hRecoil: Math.max(0, hRec),
      accuracy: Math.max(1, accStat),
      adsMoaX: Math.max(0.5, adsMoaX),
      adsMoaY: Math.max(0.5, adsMoaY),
      velocity,
      zeroDist: weaponZero,
      stability,
      ergonomics,
      dmgMod,
    };
  }, [selectedWeapon, selectedAttachments]);

  // ── Calculate spread & recoil for a shot ──
  const calcShot = useCallback((shotNum: number, type: 'semi' | 'auto', aimCmX: number, aimCmY: number) => {
    if (!selectedWeapon || !selectedBullet) return null;
    const eff = getEffectiveStats();
    if (!eff) return null;

    const bs = selectedBullet.stats as Record<string, unknown>;
    const bVRecoil = Number(bs?.VerticalRecoil || 0);
    const bHRecoil = Number(bs?.HorizontalRecoil || 0);
    const bulletMoaX = Number(bs?.MoaX || 0);
    const bulletMoaY = Number(bs?.MoaY || 0);

    const totalVControl = eff.vRecoil + bVRecoil;
    const totalHControl = eff.hRecoil + bHRecoil;
    const { vKick, hKick, avgKick, ceilingMoaBase } =
      getRecoilProfile(eff.accuracy, totalVControl, totalHControl);

    const MOA_TO_CM = distance / 100 * 2.9089;

    // ── Spread (bound circle) ──
    // Accuracy sets the CEILING the circle blooms toward under sustained
    // fire — not its resting size. The opening shot is tight/near pinpoint;
    // recoil control then restrains how fast (and how far) the circle opens
    // up toward that ceiling as the burst continues: great control keeps it
    // tight even under sustained fire, poor control (e.g. an auto shotgun)
    // blooms out to the full rated circle within just a few rounds.
    const ceilingMoaX = Math.max(0.5, ceilingMoaBase + bulletMoaX);
    const ceilingMoaY = Math.max(0.5, ceilingMoaBase + bulletMoaY);

    const sustainedCount = type === 'semi' ? 0 : burstCount.current;
    const bloomMult = getBloomMult(sustainedCount, avgKick);
    const spreadMoaX = ceilingMoaX * bloomMult;
    const spreadMoaY = ceilingMoaY * bloomMult;

    const spreadX_cm = spreadMoaX * MOA_TO_CM;
    const spreadY_cm = spreadMoaY * MOA_TO_CM;

    // Random roll within the spread ellipse
    const coneAngle = Math.random() * 2 * Math.PI;
    const coneRadius = Math.sqrt(Math.random());
    const baseX = Math.cos(coneAngle) * coneRadius * spreadX_cm;
    const baseY = Math.sin(coneAngle) * coneRadius * spreadY_cm;

    // ── Recoil (MOA-based) — magnitude driven by recoil-control kick multipliers ──
    const BASE_SETTLE_MOA = 0.9;
    const BASE_CLIMB_MOA = 1.6;
    const BASE_DRIFT_MOA = 1.0;
    const recoilMoa = BASE_SETTLE_MOA * avgKick;
    const climbMoa = BASE_CLIMB_MOA * vKick;
    const driftMoa = BASE_DRIFT_MOA * hKick;
    const SETTLED_RADIUS_cm = recoilMoa * MOA_TO_CM;
    const CLIMB_cm = climbMoa * MOA_TO_CM;
    const DRIFT_cm = driftMoa * MOA_TO_CM;

    let recoilX: number, recoilY: number;

    if (type === 'semi') {
      recoilX = (Math.random() - 0.5) * 2 * DRIFT_cm;
      recoilY = Math.random() * CLIMB_cm; // recoil always kicks the muzzle up, never down
      burstCount.current = 0;
      lastRecoil.current = { x: 0, y: 0 };
      settleCenter.current = { x: 0, y: 0 };
    } else {
      if (burstCount.current < 5) {
        const c = (5 - burstCount.current) / 5;
        recoilX = lastRecoil.current.x + (Math.random() - 0.5) * DRIFT_cm;
        recoilY = lastRecoil.current.y + CLIMB_cm * (1.5 - c * 0.5); // climb UP (+Y) as the burst progresses
        settleCenter.current = { x: recoilX, y: recoilY }; // plateau reached so far — used once settle phase begins
      } else {
        // Settled phase: shake around the plateau reached during the climb, not around origin
        const a = Math.random() * 2 * Math.PI;
        const r = Math.sqrt(Math.random()) * SETTLED_RADIUS_cm;
        recoilX = settleCenter.current.x + Math.cos(a) * r;
        recoilY = settleCenter.current.y + Math.sin(a) * r;
      }
      burstCount.current++;
    }

    // Bound the pattern: climb sums up to ~6x a single kick over the 5-shot
    // climb phase (factors 1.0..1.4), plus settle shake on top. Recoil only
    // ever pushes the muzzle up, so the downward floor is just the settle
    // shake radius, not a mirror of the climb ceiling. Horizontal drift is an
    // unbounded random walk otherwise, so cap it the same way.
    const MAX_CLIMB_cm = CLIMB_cm * 6 + SETTLED_RADIUS_cm;
    const MAX_DRIFT_cm = DRIFT_cm * 6 + SETTLED_RADIUS_cm;
    recoilX = Math.max(-MAX_DRIFT_cm, Math.min(MAX_DRIFT_cm, recoilX));
    recoilY = Math.max(-SETTLED_RADIUS_cm, Math.min(MAX_CLIMB_cm, recoilY));
    lastRecoil.current = { x: recoilX, y: recoilY };

    // Bullet drop with ZERO IN offset
    const t = distance / eff.velocity;
    const drop_m = 0.5 * 9.81 * t * t;
    const dropAtZero = 0.5 * 9.81 * Math.pow(Math.min(zeroDistance, eff.zeroDist) / eff.velocity, 2);
    const drop_cm = (drop_m - dropAtZero) * 100;

    // Final bullet position: aim point + spread + recoil - drop.
    // recoilX/recoilY are already the cumulative pattern offset from the
    // burst's base aim point (see startAuto), so no extra drift is added here.
    const bulletX = aimCmX + baseX + recoilX;
    const bulletY = aimCmY + baseY + recoilY - drop_cm;

    return {
      bulletX, bulletY,
      recoilX, recoilY,
      drop_cm,
      spreadX_cm, spreadY_cm,
      bloomFactor: bloomMult,
    };
  }, [selectedWeapon, selectedBullet, distance, getEffectiveStats, zeroDistance]);

  // ── Firing ──
  const fireOnce = useCallback(() => {
  if (!hoveringCanvas) return;
  burstCount.current = 0;
  lastRecoil.current = { x: 0, y: 0 };
  settleCenter.current = { x: 0, y: 0 };
  const { x: aimX, y: aimY } = mouseAim.current;
  const result = calcShot(roundCount + 1, 'semi', aimX, aimY);
  if (result) {
    // Trigger visual effects
    flashIntensity.current = 1.0;
    shakeOffset.current = { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 3 };
    setShots(prev => [...prev, {
      x: result.bulletX,
      y: result.bulletY,
      shot: roundCount + 1,
      type: 'semi',
      aimX, aimY,
    }]);
    setRoundCount(r => r + 1);
    // Start recovery animation after semi shot
    recoveryRef.current = true;
    recoveryTarget.current = { aimCmX: aimX * 0.3, aimCmY: aimY * 0.3 };
    startAnimLoop();
  }
  }, [calcShot, roundCount, hoveringCanvas]);

  const stopAuto = useCallback(() => {
  if (autoTimer.current) { clearInterval(autoTimer.current); autoTimer.current = null; }
  setIsFiring(false);
  // Start smooth recoil recovery animation (don't snap — let the rAF loop lerp back).
  // Release the recoil-induced climb/drift and settle back toward wherever the
  // player's mouse currently is — it may have moved during the burst — not a
  // fraction of the absolute (climbed) position, which would snap off-center
  // aims toward center.
  recoveryRef.current = true;
  recoveryTarget.current = {
    aimCmX: mouseAim.current.x,
    aimCmY: mouseAim.current.y,
  };
  // Sync round count after burst
  setRoundCount(prev => Math.max(prev, shotsRef.current.filter(s => s.type === 'auto').length));
  }, []);

  const startAuto = useCallback(() => {
  if (isFiring || !hoveringCanvas) return;
  setIsFiring(true);
  burstCount.current = 0;
  lastRecoil.current = { x: 0, y: 0 };
  settleCenter.current = { x: 0, y: 0 };
  const rpm = Number((selectedWeapon?.stats as Record<string, unknown>)?.FireRate || 600);
  const interval = 60 / rpm * 1000;
  const startCount = roundCount;

  let count = 0;
  const fireNext = () => {
  if (count >= 30) { stopAuto(); return; }
  // Read the mouse position fresh each shot — the pattern (climb/drift/settle,
  // tracked separately via lastRecoil/settleCenter) rides on top of wherever
  // the player is currently aiming, so it keeps tracking mouse movement
  // instead of freezing at the position held when the trigger was first pulled.
  const { x: aimX, y: aimY } = mouseAim.current;
  const result = calcShot(startCount + count + 1, 'auto', aimX, aimY);
  if (result) {
    // Trigger visual effects for each auto shot
    flashIntensity.current = 0.7; // slightly less intense than semi
    shakeOffset.current = {
      x: (Math.random() - 0.5) * 3 * Math.min(1, count / 5),
      y: (Math.random() - 0.5) * 2 * Math.min(1, count / 5),
    };
    setShots(prev => [...prev, {
      x: result.bulletX,
      y: result.bulletY,
      shot: startCount + count + 1,
      type: 'auto',
      aimX: aimX + result.recoilX,
      aimY: aimY + result.recoilY,
    }]);
    setRoundCount(startCount + count + 1);
    // The reticle climbs to exactly where the pattern is for this shot —
    // matches real spray-pattern feedback, and gives the recovery animation
    // a well-defined "current" position to lerp back down from.
    setCrosshair(prev => ({
      ...prev,
      aimCmX: aimX + result.recoilX,
      aimCmY: aimY + result.recoilY,
    }));
  }
  count++;
  };
  // Fire first shot immediately, then interval
  fireNext();
  startAnimLoop();
  autoTimer.current = setInterval(fireNext, interval);
  }, [isFiring, selectedWeapon, calcShot, roundCount, hoveringCanvas, stopAuto]);

  const clearTarget = () => {
  stopAuto(); setShots([]); setRoundCount(0);
  lastRecoil.current = { x: 0, y: 0 }; burstCount.current = 0; settleCenter.current = { x: 0, y: 0 };
  setCrosshair(prev => ({ ...prev, aimCmX: 0, aimCmY: 0 }));
  displayAim.current = { aimCmX: 0, aimCmY: 0 };
  recoveryRef.current = false;
  };

  // ── Animation loop (requestAnimationFrame) ──
  const startAnimLoop = useCallback(() => {
    if (animRunning.current) return; // already running
    animRunning.current = true;

    const tick = () => {
      const ch = crosshairRef.current;
      const dAim = displayAim.current;

      // Smooth interpolation: display position tracks toward target position
      // Fast lerp during fire (0.25), slower during recovery (0.08)
      const lerpSpeed = isFiringRef.current ? 0.25 : 0.08;
      dAim.aimCmX = lerp(dAim.aimCmX, ch.aimCmX, lerpSpeed);
      dAim.aimCmY = lerp(dAim.aimCmY, ch.aimCmY, lerpSpeed);

      // Handle smooth recoil recovery
      if (recoveryRef.current && !isFiringRef.current) {
        const rTarget = recoveryTarget.current;
        ch.aimCmX = lerp(ch.aimCmX, rTarget.aimCmX, 0.04);
        ch.aimCmY = lerp(ch.aimCmY, rTarget.aimCmY, 0.04);
        dAim.aimCmX = lerp(dAim.aimCmX, rTarget.aimCmX, 0.06);
        dAim.aimCmY = lerp(dAim.aimCmY, rTarget.aimCmY, 0.06);
        // Stop recovery when close enough
        if (Math.abs(ch.aimCmX - rTarget.aimCmX) < 0.05 &&
            Math.abs(ch.aimCmY - rTarget.aimCmY) < 0.05) {
          recoveryRef.current = false;
          setCrosshair(prev => ({ ...prev, aimCmX: rTarget.aimCmX, aimCmY: rTarget.aimCmY }));
        }
      }

      // Decay muzzle flash
      if (flashIntensity.current > 0) {
        flashIntensity.current = Math.max(0, flashIntensity.current - 0.08);
      }

      // Decay screen shake
      if (Math.abs(shakeOffset.current.x) > 0.01 || Math.abs(shakeOffset.current.y) > 0.01) {
        shakeOffset.current.x *= 0.82;
        shakeOffset.current.y *= 0.82;
      } else {
        shakeOffset.current = { x: 0, y: 0 };
      }

      // Trigger canvas redraw
      setDrawTick(t => t + 1);

      // Keep running while there's animation to do
      const hasActivity = isFiringRef.current ||
        flashIntensity.current > 0.01 ||
        Math.abs(shakeOffset.current.x) > 0.01 ||
        Math.abs(shakeOffset.current.y) > 0.01 ||
        recoveryRef.current ||
        Math.abs(dAim.aimCmX - ch.aimCmX) > 0.01 ||
        Math.abs(dAim.aimCmY - ch.aimCmY) > 0.01;

      if (hasActivity) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        animRunning.current = false;
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, [lerp]);

  // Cleanup animation frame and any in-flight auto-fire interval on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (autoTimer.current) clearInterval(autoTimer.current);
    };
  }, []);

  // ── Load Gunsmith build for selected weapon ──
  useEffect(() => {
    if (!selectedWeapon) { setSelectedAttachments({}); return; }
    const build = getBuildForWeapon(selectedWeapon.id);
    if (build) {
      // Convert gunsmith build (category→partId) to aim-lab format
      const mapped: Record<string, CompatiblePart | null> = {};
      for (const [cat, partId] of Object.entries(build.attachments)) {
        if (partId > 0) {
          const acc = accessories.find(a => a.id === partId);
          if (acc) {
            mapped[cat] = {
              id: acc.id, name: names[String(acc.id)] || String(acc.id),
              tag: acc.tag, source: 'accessory', stats: acc.stats,
              raw: acc as unknown as Record<string, unknown>,
            };
          } else {
            const catalogPart = partCatalog[String(partId)];
            mapped[cat] = {
              id: partId, name: catalogPart?.n ? String(catalogPart.n) : String(partId),
              tag: tagIndex.get(partId), source: 'catalog',
              raw: (catalogPart as unknown as Record<string, unknown>) || {},
            };
          }
        }
      }
      setSelectedAttachments(mapped);
    }
  }, [selectedWeapon?.id, accessories, partCatalog, tagIndex, names]);

  // ── Live Simulation Effect (runs on weapon/bullet/armor/distance change) ──
  useEffect(() => {
    if (!selectedWeapon || !selectedBullet || !simArmor) { setSimResult(null); return; }
    const s = selectedBullet.stats as Record<string, unknown>;
    const ws = selectedWeapon.stats as Record<string, unknown>;
    const bDmg = Number(s?.BaseDamage || 0);
    const bPen = Number(s?.PenetrationFactor || 0);
    const bArmorDmg = Number(s?.ArmorDamage || 0);
    const wMod = Number(ws?.AdapterAdjustDamage || 0);
    const bluntCoeff = Number(s?.BulletBlockDamageFactor ?? 0.05);
    const rpm = Number(ws?.FireRate || 0);
    const fireInterval = rpm > 0 ? 60 / rpm : 0;
    const vel = Math.max(Number(ws?.MuzzleVelocity || 0), Number(s?.BaseSpeed || 0) / 100) || 800;
    const travelTime = distance > 0 ? distance / vel : 0;
    const { factor, effectiveRange } = calcDistanceFactor(distance, selectedWeapon.damageDistance as unknown as DamageDistance);
    const as = simArmor.stats as Record<string, unknown>;
    const al = Number(as?.armor_level ?? 0);
    const adur = Number(simArmor.durabilityMax ?? 0) / 10;
    const adest = Number(as?.armor_destructibility ?? 0.3);
    const apCoeff = Number(as?.armor_penetrate_coefficient ?? 1);
    const apConst = Number(as?.armor_penetrate_coefficient_constant ?? 0);
    const seed = 12345 + Math.floor(Number(selectedWeapon.id) % 99999);
    const isHelmet = simArmor.nativeArmorType === 'Helmet';
    const hp = isHelmet ? 40 : 85;
    const sim = simulate(bDmg, wMod, 0, bPen, bArmorDmg, bluntCoeff, factor,
      al, adur, adest, -1, isHelmet, 65, 0, 0, 0, apCoeff, apConst, hp, seed);
    const ttk = travelTime + Math.max(0, (sim.shots.findIndex(x => x.kill) + 1 || sim.shots.length) - 1) * fireInterval;
    setSimResult({ ...sim, effectiveRange, travelTime, fireInterval, ttk, rpm });
  }, [selectedWeapon, selectedBullet, simArmor, distance]);

  // ── Canvas drawing ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const maxRadius = Math.min(W, H) * 0.45;
    const cmToPx = maxRadius / 15;

    // Background - dark
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    // Paper target circle background
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius + 10);
    bgGrad.addColorStop(0, '#f5f0e8');
    bgGrad.addColorStop(0.85, '#e8e0d0');
    bgGrad.addColorStop(1, '#d0c8b8');
    ctx.beginPath(); ctx.arc(cx, cy, maxRadius + 10, 0, Math.PI * 2);
    ctx.fillStyle = bgGrad; ctx.fill();
    ctx.strokeStyle = '#b0a898'; ctx.lineWidth = 2; ctx.stroke();

    // Ring colors per cm radius (15 entries: idx 0=15cm outer ... idx 14=1cm center)
    const ringColors: Record<number, string> = {
      15: '#f5f0e8', 14: '#f5f0e8',  // outer cream
      13: '#e53935', 12: '#e53935',  // red
      11: '#ffffff', 10: '#ffffff',  // white
      9:  '#e53935', 8:  '#e53935',  // red
      7:  '#ffffff', 6:  '#ffffff',  // white
      5:  '#e53935', 4:  '#e53935',  // red
      3:  '#ffffff', 2:  '#ffffff',  // white
      1:  '#e53935',                 // center red
    };
    const ringStroke: Record<number, string> = {
      15: '#555', 14: '#555', 13: '#999', 12: '#999',
      11: '#999', 10: '#999', 9: '#555', 8: '#555',
      7: '#555', 6: '#555', 5: '#999', 4: '#999',
      3: '#999', 2: '#999', 1: '#f00',
    };

    // Draw rings outer to inner
    for (let r = 15; r >= 1; r--) {
      const rPx = r * cmToPx;
      ctx.beginPath(); ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.fillStyle = ringColors[r] || '#ccc';
      ctx.fill();
      ctx.strokeStyle = ringStroke[r] || 'rgba(0,0,0,0.2)';
      ctx.lineWidth = r === 1 ? 1.5 : 0.5; ctx.stroke();
    }

    // Ring labels at 15, 10, 5, 1 cm
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    for (const rCm of [15, 10, 5]) {
      ctx.fillText(`${rCm}`, cx + rCm * cmToPx + 6, cy - 4);
    }

    // Center cross-lines (faint)
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.5; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(cx - maxRadius, cy); ctx.lineTo(cx + maxRadius, cy);
    ctx.moveTo(cx, cy - maxRadius); ctx.lineTo(cx, cy + maxRadius); ctx.stroke();
    ctx.setLineDash([]);

    // ── Apply screen shake offset ──
    const shakeX = shakeOffset.current.x;
    const shakeY = shakeOffset.current.y;
    if (Math.abs(shakeX) > 0.01 || Math.abs(shakeY) > 0.01) {
      ctx.save();
      ctx.translate(shakeX, shakeY);
    }

    // ── Helper: visual spread radius in pixels (capped for display) ──
    const visualSpreadPx = (moaX: number, moaY: number): number => {
      const avgCm = ((moaX + moaY) / 2) * (distance / 100) * 2.9089;
      const ratio = Math.min(1, avgCm / 15); // fraction of target radius
      return 4 + ratio * 36; // 4px (tight) to 40px (max spread)
    };

    // ── Expected spread pattern (ghost zone preview) ──
    const eff = getEffectiveStats();
    const bs2 = selectedBullet?.stats as Record<string, unknown>;
    const bulletMoaX2 = Number(bs2?.MoaX || 0);
    const bulletMoaY2 = Number(bs2?.MoaY || 0);
    const bulletVRecoil2 = Number(bs2?.VerticalRecoil || 0);
    const bulletHRecoil2 = Number(bs2?.HorizontalRecoil || 0);
    const profile = eff
      ? getRecoilProfile(eff.accuracy, eff.vRecoil + bulletVRecoil2, eff.hRecoil + bulletHRecoil2)
      : null;

    // How bloomed the bound circle is right now (0.22 opening shot → 1.0 fully bloomed to the accuracy ceiling)
    const getSpreading = (): number => {
      if (!profile) return FIRST_SHOT_FRACTION;
      const sustainedCount = fireMode === 'auto' ? burstCount.current : 0;
      return getBloomMult(sustainedCount, profile.avgKick);
    };

    if (showSpreadPreview && eff && profile && selectedBullet && hoveringCanvas) {
      const bloomMult = getSpreading();
      const previewMoaX = Math.max(0.5, profile.ceilingMoaBase + bulletMoaX2) * bloomMult;
      const previewMoaY = Math.max(0.5, profile.ceilingMoaBase + bulletMoaY2) * bloomMult;
      const sp = visualSpreadPx(previewMoaX, previewMoaY);

      // Use the smoothly interpolated crosshair position for the preview center
      const aimPxX = cx + displayAim.current.aimCmX * cmToPx;
      const aimPxY = cy - displayAim.current.aimCmY * cmToPx;

      // Spread preview as translucent circle
      ctx.beginPath(); ctx.arc(aimPxX, aimPxY, sp, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(212, 175, 55, 0.07)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)';
      ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // For auto, show expected recoil trajectory (deterministic dots)
      // with increasing spread bloom per shot
      if (fireMode === 'auto') {
        const climbPxStep = sp * 0.12;
        for (let s = 1; s <= 8; s++) {
          const sx = aimPxX + (s % 3 === 0 ? sp * 0.15 : s % 3 === 1 ? -sp * 0.1 : 0);
          const sy = aimPxY - climbPxStep * Math.min(s, 5) - (s > 5 ? (s - 5) * climbPxStep * 0.1 : 0);
          ctx.beginPath(); ctx.arc(sx, sy, 2 + s * 0.3, 0, Math.PI * 2); // bigger dots = bigger bloom
          ctx.fillStyle = `rgba(212, 175, 55, ${0.04 + s * 0.015})`;
          ctx.fill();
        }
      }
    }

    // ── Crosshair (circle + dot) ──
    if (hoveringCanvas) {
      const bs3 = selectedBullet?.stats as Record<string, unknown>;
      const bulletMoaX3 = Number(bs3?.MoaX || 0);
      // Crosshair shows current bloom: tight on the opening shot, opens up
      // toward the accuracy ceiling during sustained auto fire
      const bloomMult = getSpreading();
      const crossMoa = profile
        ? Math.max(0.5, profile.ceilingMoaBase + bulletMoaX3) * bloomMult
        : 3;
      const crossRadius_px = visualSpreadPx(crossMoa, crossMoa);

      // Use smoothly interpolated display position (not the raw state)
      const aimPxX = cx + displayAim.current.aimCmX * cmToPx;
      const aimPxY = cy - displayAim.current.aimCmY * cmToPx;

      // Muzzle flash glow (drawn behind crosshair for layered effect)
      if (flashIntensity.current > 0.01) {
        const flashAlpha = flashIntensity.current * 0.4;
        const flashRadius = 8 + flashIntensity.current * 18;
        const flashGrad = ctx.createRadialGradient(aimPxX, aimPxY, 0, aimPxX, aimPxY, flashRadius);
        flashGrad.addColorStop(0, `rgba(255, 220, 100, ${flashAlpha})`);
        flashGrad.addColorStop(0.4, `rgba(255, 160, 50, ${flashAlpha * 0.5})`);
        flashGrad.addColorStop(1, `rgba(255, 100, 30, 0)`);
        ctx.beginPath(); ctx.arc(aimPxX, aimPxY, flashRadius, 0, Math.PI * 2);
        ctx.fillStyle = flashGrad; ctx.fill();
      }

      // Outer circle (spread indicator) — pulses slightly when firing
      const pulseRadius = isFiring ? crossRadius_px + flashIntensity.current * 3 : crossRadius_px;
      ctx.beginPath(); ctx.arc(aimPxX, aimPxY, Math.max(4, pulseRadius), 0, Math.PI * 2);
      ctx.strokeStyle = isFiring ? 'rgba(255,80,80,0.7)' : 'rgba(255,255,255,0.7)';
      ctx.lineWidth = isFiring ? 2 : 1.5; ctx.stroke();

      // Crosshair cross (+) — fixed length independent of spread
      const crossLen = 12;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(aimPxX - crossLen, aimPxY); ctx.lineTo(aimPxX + crossLen, aimPxY);
      ctx.moveTo(aimPxX, aimPxY - crossLen); ctx.lineTo(aimPxX, aimPxY + crossLen);
      ctx.stroke();

      // Center dot (red, pulses brighter during flash)
      const dotAlpha = 0.7 + flashIntensity.current * 0.3;
      ctx.beginPath(); ctx.arc(aimPxX, aimPxY, 1.5 + flashIntensity.current, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(239, 68, 68, ${dotAlpha})`; ctx.fill();
    }

    // ── Bullet impacts ──
    if (shots.length === 0 && !hoveringCanvas) {
      ctx.fillStyle = '#6b7280'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('Move mouse over target & click to fire', cx, H - 20);
    } else {
      shots.forEach((shot, i) => {
        const px = cx + shot.x * cmToPx;
        const py = cy - shot.y * cmToPx;
        if (px < 0 || px > W || py < 0 || py > H) return;
        const alpha = 1 - (shots.length - i - 1) / Math.max(shots.length, 20) * 0.5;

        // Bullet hole — small dark dot with faint border
        ctx.beginPath(); ctx.arc(Math.max(3,Math.min(W-3,px)), Math.max(3,Math.min(H-3,py)), 2, 0, Math.PI*2);
        ctx.fillStyle = `rgba(20,20,20,${alpha})`; ctx.fill();
        ctx.strokeStyle = `rgba(150,150,150,${Math.min(1,alpha) * 0.5})`; ctx.lineWidth = 0.5; ctx.stroke();

        // Number label every 5th shot
        if (shot.shot % 5 === 0 || shot.shot === 1) {
          ctx.fillStyle = `rgba(0,0,0,${alpha*0.7})`; ctx.font = '6px monospace'; ctx.textAlign = 'left';
          ctx.fillText(`${shot.shot}`, px + 3, py + 2);
        }

        // Line from aim point to impact (for semi shots)
        if (shot.type === 'semi' && i > 0 && shots[i-1].type === 'semi') {
          const prevPx = cx + shots[i-1].x * cmToPx;
          const prevPy = cy - shots[i-1].y * cmToPx;
          ctx.strokeStyle = `rgba(255,255,255,0.1)`;
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(prevPx, prevPy); ctx.lineTo(px, py); ctx.stroke();
        }
      });
    }

    // ── Restore screen shake transform ──
    if (Math.abs(shakeX) > 0.01 || Math.abs(shakeY) > 0.01) {
      ctx.restore();
    }

    // ── Stats overlay ──
    if (shots.length >= 2) {
      const xs = shots.map(s => s.x), ys = shots.map(s => s.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const gs_cm = groupExtremeSpread(shots);
      const gMoa = gs_cm / (distance / 100) / 2.9089;
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(8, 8, 170, 70);
      ctx.fillStyle = '#d4af37'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`Group: ${gs_cm.toFixed(1)} cm`, 14, 24);
      ctx.fillText(`MOA: ${gMoa.toFixed(1)}'`, 14, 38);
      ctx.fillText(`H: ${(maxX-minX).toFixed(1)} cm`, 14, 52);
      ctx.fillText(`V: ${(maxY-minY).toFixed(1)} cm`, 14, 66);
    }

    // ── Zero info overlay ──
    if (eff && selectedBullet) {
      const zeroText = `Zero: ${zeroDistance}m | Weapon Zero: ${eff.zeroDist.toFixed(0)}m | Dist: ${distance}m`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(8, H - 22, 300, 16);
      ctx.fillStyle = distance === zeroDistance ? '#4ade80' : '#facc15';
      ctx.font = '9px monospace'; ctx.textAlign = 'left';
      ctx.fillText(zeroText, 12, H - 10);
    }

  }, [shots, distance, crosshair, hoveringCanvas, fireMode, selectedWeapon, selectedBullet,
      getEffectiveStats, showSpreadPreview, isFiring, zeroDistance, drawTick]);

  // ── Canvas mouse handlers ──
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const maxRadius = Math.min(canvas.width, canvas.height) * 0.45;
    const cmToPx = maxRadius / 15;

    // Convert to cm offset from center
    const cmX = (px - cx) / cmToPx;
    const cmY = (cy - py) / cmToPx;

    // Always keep the live mouse-tracked aim current, including mid-burst —
    // this is what fireNext reads, so held-trigger fire keeps following the mouse.
    mouseAim.current = { x: cmX, y: cmY };

    setCrosshair(prev => ({
      ...prev,
      x: px,
      y: py,
      aimCmX: cmX,
      aimCmY: cmY,
    }));

    // Update display aim directly for instant mouse tracking (no interpolation lag)
    // Only when NOT firing — during fire, the rAF loop handles interpolation
    if (!isFiringRef.current && !recoveryRef.current) {
      displayAim.current.aimCmX = cmX;
      displayAim.current.aimCmY = cmY;
    }
  }, []);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (fireMode === 'auto') {
      startAuto();
    } else {
      fireOnce();
    }
  }, [fireMode, startAuto, fireOnce]);

  const handleCanvasMouseUp = useCallback(() => {
    if (fireMode === 'auto') stopAuto();
  }, [fireMode, stopAuto]);

  const handleCanvasMouseLeave = useCallback(() => {
    setHoveringCanvas(false);
    if (isFiring) stopAuto();
  }, [isFiring, stopAuto]);

  const eff = getEffectiveStats();
  const bulletVRecoilStat = Number((selectedBullet?.stats as Record<string, unknown>)?.VerticalRecoil ?? 0);
  const bulletHRecoilStat = Number((selectedBullet?.stats as Record<string, unknown>)?.HorizontalRecoil ?? 0);
  const recoilProfile = eff
    ? getRecoilProfile(eff.accuracy, eff.vRecoil + bulletVRecoilStat, eff.hRecoil + bulletHRecoilStat)
    : null;
  const filteredWeapons = weapons.filter(w => !weaponSearch || getName(String(w.id)).toLowerCase().includes(weaponSearch.toLowerCase()));

  // Derived lookups for scraped data
  const wName = selectedWeapon ? getName(String(selectedWeapon.id)) : '';
  const dmgRows = lookupByWeapon(dmgOverview, wName);
  const avgRows = lookupByWeapon(avgShots, wName);
  const helmetsList = armors.filter(a => a.nativeArmorType === 'Helmet');
  const vestsList = armors.filter(a => a.nativeArmorType === 'Vest' || (!a.nativeArmorType && a.type === 0));

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
          <h1 className="text-2xl font-bold font-display text-gradient">Aim Lab</h1>
          <p className="text-xs text-[#9CA3AF]">Aim with mouse crosshair — each shot is a ballistics roll. Adjust Zero In, see patterns instantly.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Primary controls row */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
          <div className="glass rounded-xl p-3">
            <label className="block text-[10px] text-[#D4AF37] uppercase mb-1">Weapon</label>
            <input type="text" placeholder="Search..." value={weaponSearch} onChange={e => setWeaponSearch(e.target.value)} className="w-full glass rounded px-2 py-1 text-xs text-white outline-none mb-1" />
            <select size={4} value={selectedWeapon?.id ?? ''} onChange={e => {
              const w = weapons.find(x => x.id === Number(e.target.value));
              if (w) {
                setSelectedWeapon(w);
                clearTarget();
                setSelectedAttachments({});
                const wZero = Number((w.stats as Record<string, unknown>)?.ZeroDropDistance || 5000) / 100;
                setZeroDistance(prev => Math.min(prev, Math.max(5, Math.round(wZero))));
              }
            }} className="w-full text-xs bg-[#1a1a1a] text-[#9CA3AF] border border-white/5 rounded outline-none">
              {filteredWeapons.slice(0, 50).map(w => (<option key={w.id} value={w.id} className="bg-[#1a1a1a]">{getName(String(w.id))}</option>))}
            </select>
          </div>
          <div className="glass rounded-xl p-3">
            <label className="block text-[10px] text-[#D4AF37] uppercase mb-1">Ammo</label>
            <div className="flex flex-wrap gap-0.5 mb-1">
              <button onClick={() => setAmmoTier(-1)}
                className={`px-1 py-0.5 rounded text-[8px] transition-colors ${ammoTier === -1 ? 'bg-[#D4AF37] text-black' : 'bg-white/5 text-[#9CA3AF] hover:text-white'}`}>All</button>
              {[...Array(8)].map((_, i) => (
                <button key={i} onClick={() => setAmmoTier(i)}
                  className={`px-1 py-0.5 rounded text-[8px] transition-colors ${ammoTier === i ? 'bg-[#D4AF37] text-black' : 'bg-white/5 text-[#9CA3AF] hover:text-white'}`}>T{i}</button>
              ))}
            </div>
            <div className="max-h-28 overflow-y-auto space-y-0.5">
              {(() => {
                const filtered = compatibleBullets
                  .filter(b => ammoTier < 0 || Number((b.stats as Record<string, unknown>)?.PenetrationLevel ?? -1) === ammoTier)
                  .sort((a, b) => {
                    const ta = Number((a.stats as Record<string, unknown>)?.PenetrationLevel ?? 0);
                    const tb = Number((b.stats as Record<string, unknown>)?.PenetrationLevel ?? 0);
                    if (ta !== tb) return tb - ta;
                    return (getName(String(a.id))).localeCompare(getName(String(b.id)));
                  })
                  .slice(0, 25);
                return filtered.length === 0
                  ? <p className="text-[10px] text-[#6B7280]">No compatible ammo</p>
                  : filtered.map(b => (
                      <button key={b.id} onClick={() => { setSelectedBullet(b); clearTarget(); }}
                        className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] transition-colors ${selectedBullet?.id === b.id ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'text-[#9CA3AF] hover:text-white hover:bg-white/5'}`}>
                        {getName(String(b.id))}
                        <span className="opacity-50"> T{String((b.stats as Record<string, unknown>)?.PenetrationLevel ?? '?')}</span>
                      </button>
                    ));
              })()}
            </div>
          </div>
          <div className="glass rounded-xl p-3">
            <label className="block text-[10px] text-[#D4AF37] uppercase mb-1">Target Distance</label>
            <div className="flex items-center gap-2">
              <input type="range" min={1} max={200} value={distance} onChange={e => { setDistance(Number(e.target.value)); clearTarget(); }} className="flex-1 accent-[#D4AF37]" />
              <span className="text-white font-mono text-xs w-10 text-right">{distance}m</span>
            </div>
          </div>
          <div className="glass rounded-xl p-3">
            <label className="block text-[10px] text-[#D4AF37] uppercase mb-1">Zero In
              <span className="text-[#6B7280] font-normal lowercase ml-1">— adjust aim distance</span>
            </label>
            <div className="flex items-center gap-2">
              <input type="range" min={5} max={eff ? Math.max(5, Math.round(eff.zeroDist)) : 200} value={zeroDistance} onChange={e => setZeroDistance(Number(e.target.value))} className="flex-1 accent-[#4ade80]" />
              <span className="text-white font-mono text-xs w-10 text-right">{zeroDistance}m</span>
            </div>
            <div className="text-[9px] text-[#6B7280] mt-0.5">
              {distance === zeroDistance
                ? <span className="text-green-400">✓ On zero — bullets hit where you aim</span>
                : <span className="text-yellow-400">Zero @ {zeroDistance}m (dist: {distance}m) — bullet offset active</span>}
              {eff && <div className="mt-0.5">Max zero for this weapon: {eff.zeroDist.toFixed(0)}m</div>}
            </div>
          </div>
          <div className="glass rounded-xl p-3">
            <label className="block text-[10px] text-[#D4AF37] uppercase mb-1">Weapon Zero</label>
            <div className="text-[11px] text-white font-mono mt-2">
              Base: {eff?.zeroDist.toFixed(0) || '?'}m
            </div>
            <div className="text-[9px] text-[#6B7280] mt-1">Velocity: {eff?.velocity || '?'} m/s</div>
          </div>
        </div>

        {/* Smart Attachment Tree */}
        <div className="mb-4">
          <details className="glass rounded-xl p-3" open>
            <summary className="text-[10px] text-[#D4AF37] uppercase tracking-wider cursor-pointer select-none">
              Attachments ({attachmentCategories.length} categories)
              <span className="text-[#6B7280] font-normal lowercase ml-1">— only parts that fit this weapon are listed</span>
            </summary>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {attachmentCategories.map(category => {
                if (!selectedWeapon) return null;
                const allItems = getCompatibleParts(selectedWeapon, category, accessories, partCatalog, tagIndex, names, weaponOverrides);
                const selected = selectedAttachments[category] || null;

                return (
                  <div key={category} className="bg-white/5 rounded-lg p-2">
                    <div className="text-[9px] text-[#D4AF37] uppercase mb-1 font-semibold">
                      {category}
                      {allItems.length > 0 && <span className="text-[#6B7280] font-normal"> ({allItems.length})</span>}
                    </div>
                    {allItems.length > 0 ? (
                      <select value={selected?.id ?? 0}
                        onChange={e => {
                          const id = Number(e.target.value);
                          setSelectedAttachments(prev => ({ ...prev, [category]: id > 0 ? (allItems.find(a => a.id === id) ?? null) : null }));
                          clearTarget();
                        }}
                        className="w-full text-[9px] bg-[#1a1a1a] text-[#9CA3AF] border border-white/5 rounded outline-none">
                        <option value={0} className="bg-[#1a1a1a]">None (stock)</option>
                        {allItems.map(part => {
                          const isCatalog = part.source === 'catalog';
                          const s = (isCatalog ? part.raw : part.stats) || {};
                          const parts: string[] = [];
                          const vr = isCatalog ? Number((s as Record<string, string>)['sVerticalRearSeatControl'] || 0) : Number((s as Record<string, unknown>).VerticalRecoil ?? 0);
                          const hr = isCatalog ? Number((s as Record<string, string>)['sHorizontalRearSeatControl'] || 0) : Number((s as Record<string, unknown>).HorizontalRecoil ?? 0);
                          const ergo = isCatalog ? Number((s as Record<string, string>)['sHumanMachineEfficiency'] || 0) : 0;
                          const acc = isCatalog ? Number((s as Record<string, string>)['sAccuracy'] || 0) : Number((s as Record<string, unknown>).Accuracy ?? 0);
                          const dmg = isCatalog ? 0 : Number((s as Record<string, unknown>).AdapterAdjustDamage ?? 0);
                          const moa = isCatalog ? 0 : Number((s as Record<string, unknown>).AdsMoaX ?? 0);
                          if (vr !== 0) parts.push(`V${vr > 0 ? '+' : ''}${vr}`);
                          if (hr !== 0) parts.push(`H${hr > 0 ? '+' : ''}${hr}`);
                          if (ergo !== 0) parts.push(`E${ergo > 0 ? '+' : ''}${ergo}`);
                          if (acc !== 0) parts.push(`Acc${acc > 0 ? '+' : ''}${acc}`);
                          if (dmg !== 0) parts.push(`Dmg${dmg}`);
                          if (moa !== 0) parts.push(`Moa${moa > 0 ? '+' : ''}${moa}`);
                          return (
                            <option key={String(part.id)} value={String(part.id)} className="bg-[#1a1a1a]">
                              {part.name}{parts.length > 0 ? ` (${parts.join(' ')})` : ''}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <div className="text-[8px] text-[#4B5563] leading-tight opacity-50">
                        No compatible parts found
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 text-[8px] text-[#4B5563] leading-relaxed">
              <span className="text-[#D4AF37]">Barrel</span> → changes DMG,Recoil,MOA &nbsp;|&nbsp;
              <span className="text-[#D4AF37]">Stock</span> → changes Recoil &nbsp;|&nbsp;
              <span className="text-[#D4AF37]">Handguard → Rail → Grip</span> hierarchy supported
            </div>
          </details>
        </div>

        {/* Target + Controls side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Canvas + Fire Controls */}
          <div className="lg:col-span-2 space-y-2">
            <div className="glass rounded-xl p-4 flex justify-center">
              <canvas
                ref={canvasRef}
                width={550}
                height={550}
                className="w-full max-w-[550px] aspect-square cursor-crosshair"
                onMouseMove={handleCanvasMouseMove}
                onMouseEnter={() => setHoveringCanvas(true)}
                onMouseLeave={handleCanvasMouseLeave}
                onMouseDown={handleCanvasMouseDown}
                onMouseUp={handleCanvasMouseUp}
              />
            </div>

            {/* Fire controls — near target */}
            <div className="glass rounded-xl p-3">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Fire mode */}
                <div className="flex gap-1 bg-[#1A1A1A] rounded-lg p-0.5">
                  <button
                    onClick={() => { setFireMode('semi'); stopAuto(); }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      fireMode === 'semi'
                        ? 'bg-[#D4AF37] text-black'
                        : 'text-[#9CA3AF] hover:text-white'
                    }`}
                  >
                    SEMI
                  </button>
                  <button
                    onClick={() => { setFireMode('auto'); stopAuto(); }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      fireMode === 'auto'
                        ? 'bg-[#D4AF37] text-black'
                        : 'text-[#9CA3AF] hover:text-white'
                    }`}
                  >
                    AUTO
                  </button>
                </div>

                <span className="text-[10px] text-[#6B7280]">|</span>

                {/* Fire buttons */}
                <button
                  onClick={fireOnce}
                  className="px-5 py-1.5 rounded-lg text-sm font-bold bg-red-600/80 hover:bg-red-600 text-white transition-colors"
                >
                  🔫 FIRE
                </button>

                <button
                  onMouseDown={fireMode === 'auto' ? startAuto : undefined}
                  onMouseUp={fireMode === 'auto' ? stopAuto : undefined}
                  onMouseLeave={fireMode === 'auto' ? stopAuto : undefined}
                  onTouchStart={fireMode === 'auto' ? startAuto : undefined}
                  onTouchEnd={fireMode === 'auto' ? stopAuto : undefined}
                  className={`px-5 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                    isFiring
                      ? 'bg-red-500 text-white'
                      : fireMode === 'auto'
                        ? 'bg-orange-600/80 hover:bg-orange-600 text-white'
                        : 'bg-[#374151] text-[#6B7280] cursor-not-allowed'
                  }`}
                >
                  {isFiring ? '🔥 FIRING...' : fireMode === 'auto' ? 'HOLD AUTO' : '—'}
                </button>

                <span className="text-[10px] text-[#6B7280]">|</span>

                {/* Pattern preview toggle */}
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSpreadPreview}
                    onChange={e => setShowSpreadPreview(e.target.checked)}
                    className="accent-[#D4AF37]"
                  />
                  <span className="text-[10px] text-[#9CA3AF]">Show spread pattern</span>
                </label>

                <span className="text-[10px] text-[#6B7280]">|</span>

                <button
                  onClick={clearTarget}
                  className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-[#9CA3AF] transition-colors"
                >
                  🗑 Clear
                </button>

                <span className="text-[10px] text-[#6B7280]">Rounds: {roundCount}</span>
              </div>

              <div className="mt-2 text-[9px] text-[#6B7280] flex gap-4 flex-wrap">
                <span>🎯 Click on target to fire at crosshair</span>
                <span>💡 Each shot = random ballistics roll</span>
                <span>📐 Crosshair = spread cone size</span>
              </div>
            </div>
          </div>

          {/* Stats panel */}
          <div className="space-y-3">
            <div className="glass rounded-xl p-4">
              {selectedWeapon && (
                <div className="flex items-center gap-3 mb-2">
                  <WeaponThumb src={`/images/weapons/${selectedWeapon.id}.png`} alt={getName(String(selectedWeapon.id))} />
                  <h3 className="text-xs text-[#D4AF37] uppercase tracking-wider">{getName(String(selectedWeapon.id))}</h3>
                </div>
              )}
              {eff && (
                <div className="text-[11px] space-y-1 text-[#9CA3AF] font-mono">
                  <div className="flex justify-between"><span>ADS MOA</span><span className="text-white">{eff.adsMoaX.toFixed(1)}x{eff.adsMoaY.toFixed(1)}</span></div>
                  <div className="flex justify-between"><span>Accuracy</span><span className="text-white">{eff.accuracy}%</span></div>
                  <div className="flex justify-between"><span>Stability</span><span className="text-white">{eff.stability}</span></div>
                  <div className="flex justify-between"><span>Velocity</span><span className="text-white">{eff.velocity} m/s</span></div>
                  <div className="flex justify-between"><span>Weapon Zero</span><span className="text-white">{eff.zeroDist.toFixed(0)}m</span></div>
                  <div className="flex justify-between"><span>Zero In (set)</span><span className="text-[#4ade80]">{zeroDistance}m</span></div>
                  <div className="flex justify-between"><span>RPM</span><span className="text-white">{String((selectedWeapon?.stats as Record<string, unknown>)?.FireRate ?? '?')}</span></div>
                  <div className="flex justify-between border-t border-white/5 pt-1 mt-1">
                    <span>Bound Circle Bloom</span>
                    <span className={isFiring ? 'text-orange-400' : 'text-[#6B7280]'}>
                      {(recoilProfile ? getBloomMult(fireMode === 'auto' ? burstCount.current : 0, recoilProfile.avgKick) * 100 : 22).toFixed(0)}% of ceiling
                    </span>
                  </div>
                </div>
              )}
              {selectedBullet && (
                <div className="text-[11px] space-y-1 text-[#9CA3AF] font-mono mt-2 pt-2 border-t border-white/5">
                  <div className="flex justify-between"><span>Bullet MOA</span><span className="text-white">
                    {String((selectedBullet.stats as Record<string, unknown>)?.MoaX ?? '0')}×{String((selectedBullet.stats as Record<string, unknown>)?.MoaY ?? '0')}
                  </span></div>
                  <div className="flex justify-between"><span>Bullet V/H Rec</span><span className="text-white">
                    {String((selectedBullet.stats as Record<string, unknown>)?.VerticalRecoil ?? '0')}/{String((selectedBullet.stats as Record<string, unknown>)?.HorizontalRecoil ?? '0')}
                  </span></div>
                </div>
              )}
              {eff && recoilProfile && (
                <div className="text-[11px] space-y-1 text-[#9CA3AF] font-mono mt-2 pt-2 border-t border-white/5">
                  <div className="flex justify-between"><span>V.Recoil Control</span><span className="text-orange-400">{eff.vRecoil}</span></div>
                  <div className="flex justify-between"><span>H.Recoil Control</span><span className="text-orange-400">{eff.hRecoil}</span></div>
                  <div className="flex justify-between"><span>Settled radius</span><span className="text-white">{(0.9 * recoilProfile.avgKick * distance / 100 * 2.9089).toFixed(1)} cm</span></div>
                  <div className="flex justify-between"><span>Opening shot @ {distance}m</span><span className="text-white">
                    {((recoilProfile.ceilingMoaBase + Number((selectedBullet?.stats as Record<string, unknown>)?.MoaX || 0)) * FIRST_SHOT_FRACTION * distance / 100 * 2.9089).toFixed(1)} cm
                  </span></div>
                  <div className="flex justify-between"><span>Bloomed ceiling @ {distance}m</span><span className="text-white">
                    {((recoilProfile.ceilingMoaBase + Number((selectedBullet?.stats as Record<string, unknown>)?.MoaX || 0)) * distance / 100 * 2.9089).toFixed(1)} cm
                  </span></div>
                </div>
              )}
            </div>

            {/* ── Damage Overview Panel ── */}
            {dmgRows.length > 0 && showDmgPanel && (
              <details className="glass rounded-xl p-4" open>
                <summary className="text-xs text-[#D4AF37] uppercase tracking-wider cursor-pointer select-none flex items-center gap-2"
                  onClick={e => { e.preventDefault(); setShowDmgPanel(!showDmgPanel); }}>
                  Damage Overview — STK
                  <span className="text-[8px] text-[#6B7280] font-normal lowercase">({dmgRows.length} combos)</span>
                </summary>
                <div className="mt-2 space-y-1 max-h-60 overflow-y-auto text-[10px] font-mono">
                  {dmgRows.map((r, i) => {
                    const h = parseShotCell(r.head_shots);
                    const c = parseShotCell(r.chest_shots);
                    return (
                      <div key={i} className="bg-white/5 rounded px-2 py-1">
                        <div className="text-[#9CA3AF] truncate text-[9px]">{r.weapon_combo}</div>
                        <div className="text-[8px] text-[#6B7280] truncate">{r.ammo_name}</div>
                        <div className="flex justify-between mt-0.5">
                          <span className="text-red-400 text-[10px]">Head: {h ? `${h.shots} (${h.dmg} dmg)` : r.head_shots}</span>
                          <span className="text-orange-400 text-[10px]">Chest: {c ? `${c.shots} (${c.dmg} dmg)` : r.chest_shots}</span>
                        </div>
                        {r.damage_modifier && (
                          <div className="text-[8px] text-[#6B7280] mt-0.5">{r.damage_modifier} · {r.armor_level}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            )}

            {/* ── Average TTK / STK Panel ── */}
            {avgRows.length > 0 && showTTKPanel && (
              <details className="glass rounded-xl p-4" open>
                <summary className="text-xs text-[#D4AF37] uppercase tracking-wider cursor-pointer select-none flex items-center gap-2"
                  onClick={e => { e.preventDefault(); setShowTTKPanel(!showTTKPanel); }}>
                  Avg TTK / STK
                  <span className="text-[8px] text-[#6B7280] font-normal lowercase">({avgRows.length} armors)</span>
                </summary>
                <div className="mt-2 max-h-60 overflow-y-auto">
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr className="text-[#6B7280] text-left">
                        <th className="pb-1">Armor</th>
                        <th className="pb-1 text-right">Shots</th>
                        <th className="pb-1 text-right">Time</th>
                        <th className="pb-1 text-right">Min</th>
                        <th className="pb-1 text-right">Max</th>
                      </tr>
                    </thead>
                    <tbody>
                      {avgRows.slice().sort((a, b) => a.parsed.avg_shots - b.parsed.avg_shots).map((r, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="py-0.5 text-[#9CA3AF] truncate max-w-[100px] text-[9px]">{r.armor_name}</td>
                          <td className="py-0.5 text-right text-white">{r.parsed.avg_shots.toFixed(1)}</td>
                          <td className="py-0.5 text-right text-[#4ade80]">{r.parsed.avg_seconds.toFixed(2)}s</td>
                          <td className="py-0.5 text-right text-[#9CA3AF]">{r.parsed.min_shots}</td>
                          <td className="py-0.5 text-right text-[#9CA3AF]">{r.parsed.max_shots}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {/* ── Live Simulation Panel ── */}
            <details className="glass rounded-xl p-4" open>
              <summary className="text-xs text-[#D4AF37] uppercase tracking-wider cursor-pointer select-none flex items-center gap-2"
                onClick={e => { e.preventDefault(); setShowSimPanel(!showSimPanel); }}>
                Live Simulation
                <span className="text-[8px] text-[#6B7280] font-normal lowercase">@{distance}m</span>
              </summary>
              <select value={simArmor?.id ?? ''}
                onChange={e => {
                  const id = Number(e.target.value);
                  setSimArmor(id > 0 ? (armors.find(a => a.id === id) ?? null) : null);
                }}
                className="w-full mt-2 text-[10px] bg-[#1a1a1a] text-[#9CA3AF] border border-white/5 rounded outline-none">
                <option value="">Select armor to simulate…</option>
                <optgroup label="— Helmets —">
                  {helmetsList.map(a => (
                    <option key={a.id} value={a.id} className="bg-[#1a1a1a]">{getName(String(a.id))}</option>
                  ))}
                </optgroup>
                <optgroup label="— Vests / Rigs —">
                  {vestsList.map(a => (
                    <option key={a.id} value={a.id} className="bg-[#1a1a1a]">{getName(String(a.id))}</option>
                  ))}
                </optgroup>
              </select>
              {simResult && simResult.shots.length > 0 && (
                <>
                  <div className="flex justify-between text-[10px] text-[#6B7280] mt-2">
                    <span>×{simResult.distanceFactor.toFixed(3)} dmg</span>
                    <span>Eff range: {simResult.effectiveRange.toFixed(0)}m</span>
                    <span className="text-white font-bold">TTK {(simResult.ttk * 1000).toFixed(0)}ms</span>
                  </div>
                  <div className="mt-1 space-y-0.5 max-h-52 overflow-y-auto text-[10px] font-mono">
                    {simResult.shots.map(s => (
                      <div key={s.shot} className={`flex justify-between items-center px-2 py-0.5 rounded ${
                        s.kill ? 'bg-green-500/10' : s.ricochet ? 'bg-blue-500/10' : s.penetrated ? 'bg-green-500/5' : ''
                      }`}>
                        <span className="text-[#9CA3AF] w-4">#{s.shot}</span>
                        <span className={
                          s.ricochet ? 'text-blue-400 font-bold' :
                          s.penetrated ? 'text-green-400' : 'text-yellow-400'
                        }>
                          {s.ricochet ? 'RICO' : s.penetrated ? 'PEN' : 'BLK'}
                        </span>
                        <span className="text-white">{s.damage} dmg</span>
                        <span className={s.kill ? 'text-green-400 font-bold' : 'text-[#6B7280]'}>{s.remainingHP} HP</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[9px] text-[#6B7280] mt-1">
                    {getBranchLabel(simResult.shots[0].branchName)} · Dur left: {simResult.durabilityLeft.toFixed(1)}
                  </div>
                </>
              )}
            </details>

            {/* Shot group stats */}
            {shots.length >= 2 && (
              <div className="glass rounded-xl p-4">
                <h3 className="text-xs text-[#D4AF37] uppercase tracking-wider mb-2">Shot Group</h3>
                {(() => {
                  const xs = shots.map(s => s.x), ys = shots.map(s => s.y);
                  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
                  const gs_cm = groupExtremeSpread(shots);
                  const moa = gs_cm / (distance / 100) / 2.9089;
                  return (
                    <div className="text-[11px] space-y-1 text-[#9CA3AF] font-mono">
                      <div className="flex justify-between"><span>Shots</span><span className="text-white">{shots.length}</span></div>
                      <div className="flex justify-between"><span>Group size</span><span className="text-white">{gs_cm.toFixed(1)} cm</span></div>
                      <div className="flex justify-between"><span>Group MOA</span><span className="text-white">{moa.toFixed(2)}'</span></div>
                      <div className="flex justify-between"><span>H spread</span><span className="text-white">{(maxX-minX).toFixed(1)} cm</span></div>
                      <div className="flex justify-between"><span>V spread</span><span className="text-white">{(maxY-minY).toFixed(1)} cm</span></div>
                      <div className="flex justify-between"><span>Center offset</span><span className="text-white">({(shots.reduce((a,s)=>a+s.x,0)/shots.length).toFixed(1)}, {(shots.reduce((a,s)=>a+s.y,0)/shots.length).toFixed(1)})</span></div>
                      <div className="pt-2 border-t border-white/5 mt-2">
                        <div className="flex justify-between text-[9px]"><span>Zero In: {zeroDistance}m</span><span className={distance === zeroDistance ? 'text-green-400' : 'text-yellow-400'}>
                          {distance === zeroDistance ? '✓ Matched' : `Dist ${distance}m`}
                        </span></div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {shots.length === 0 && (
              <div className="glass rounded-xl p-4">
                <h3 className="text-xs text-[#D4AF37] uppercase tracking-wider mb-2">How to Use</h3>
                <div className="text-[10px] text-[#9CA3AF] space-y-2 leading-relaxed">
                  <p>1. Move mouse over target → crosshair follows</p>
                  <p>2. Crosshair size = spread cone at current range</p>
                  <p>3. Click or press FIRE to shoot</p>
                  <p>4. Each shot = random ballistics roll</p>
                  <p>5. <span className="text-[#4ade80]">Zero In</span>: adjust aim distance</p>
                  <p>6. AUTO mode: hold to see recoil pattern</p>
                  <p>7. Instant pattern shows expected spread zone</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
