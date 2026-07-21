// ── Gunsmith Config Storage ──
// Stores weapon build configurations in localStorage.
// Both Gunsmith page and aim-lab/simulator read from this.

export interface GunsmithBuild {
  weaponId: number;
  name: string;
  timestamp: number;
  attachments: Record<string, number>; // category -> accessory id (0 = none/stock)
  // category keys: 'Barrel','Muzzle','Handguard','Foregrip','Stocks',
  //   'UpperReceiver','Bolt','GasBlock','PistolGrip','Magazine',
  //   'Mount','Sight','IronSight','Mod','Trigger'
}

const STORAGE_KEY = 'abi-gunsmith-builds';

export function loadBuilds(): GunsmithBuild[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveBuild(build: GunsmithBuild): void {
  const builds = loadBuilds();
  const idx = builds.findIndex(b => b.weaponId === build.weaponId);
  if (idx >= 0) {
    builds[idx] = build;
  } else {
    builds.push(build);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(builds));
}

export function deleteBuild(weaponId: number): void {
  const builds = loadBuilds().filter(b => b.weaponId !== weaponId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(builds));
}

export function getBuildForWeapon(weaponId: number): GunsmithBuild | undefined {
  return loadBuilds().find(b => b.weaponId === weaponId);
}

// Category ordering + prefix mapping now live in partCompat.ts (shared with
// Aim Lab) — re-exported here so existing imports of these two names don't
// need to change.
export { GUNSMITH_CATEGORIES, CATEGORY_PREFIX_MAP } from './partCompat';
