// ── Scraped Data Parsers for Aim-Lab Integration ──

export interface DamageOverviewRow {
  weapon_combo: string;
  damage_modifier: string;
  ammo_name: string;
  pen_level: string;
  armor_level: string;
  head_shots: string;
  chest_shots: string;
  formula?: string;
}

export interface AvgShotsRow {
  weapon_combo: string;
  armor_name: string;
  data: string;
  parsed: {
    avg_shots: number;
    avg_seconds: number;
    min_shots: number;
    min_time: number;
    min_prob: number;
    max_shots: number;
    max_time: number;
    max_prob: number;
  };
}

export interface GunsmithConfig {
  weaponId: number;
  boltId: string; // e.g. "20113" prefix for bolt
  attachments: Record<string, number>; // category -> accessory id
  name: string;
}

/**
 * Normalize a weapon name to a canonical key for joining
 * scrape rows to a selected weapon.
 * Drops attachments after '+', drops ' Range ...', lowercases,
 * strips non-alphanumerics.
 */
export function normalizeWeaponName(s: string): string {
  return (s || '')
    .split('+')[0]
    .split(' Range ')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Parse a shots cell like "2 shots (31.740 → 32 dmg)" or
 * "2 槍 (31.740 → 32 傷害)" into structured data.
 */
export function parseShotCell(cell: string): { shots: number; raw: number; dmg: number } | null {
  const m = cell?.match(/(\d+)\s*shots?\s*\(([\d.]+)\s*→\s*(\d+)/);
  if (m) return { shots: +m[1], raw: +m[2], dmg: +m[3] };
  // Chinese format
  const m2 = cell?.match(/(\d+)\s*槍\s*\(([\d.]+)\s*→\s*(\d+)/);
  if (m2) return { shots: +m2[1], raw: +m2[2], dmg: +m2[3] };
  return null;
}

/**
 * Build a name-keyed index for damage overview rows.
 */
export function indexDamageOverview(rows: DamageOverviewRow[]): Map<string, DamageOverviewRow[]> {
  const map = new Map<string, DamageOverviewRow[]>();
  for (const r of rows) {
    const k = normalizeWeaponName(r.weapon_combo);
    const existing = map.get(k);
    if (existing) {
      existing.push(r);
    } else {
      map.set(k, [r]);
    }
  }
  return map;
}

/**
 * Build a name-keyed index for avg_shots rows.
 */
export function indexAvgShots(rows: AvgShotsRow[]): Map<string, AvgShotsRow[]> {
  const map = new Map<string, AvgShotsRow[]>();
  for (const r of rows) {
    const k = normalizeWeaponName(r.weapon_combo);
    const existing = map.get(k);
    if (existing) {
      existing.push(r);
    } else {
      map.set(k, [r]);
    }
  }
  return map;
}

/**
 * Fuzzy lookup: try exact normalized match first, then prefix match.
 */
export function lookupByWeapon<T>(map: Map<string, T[]>, weaponName: string): T[] {
  const k = normalizeWeaponName(weaponName);
  if (map.has(k)) return map.get(k)!;
  // fallback: prefix / contains match
  for (const [key, rows] of map) {
    if (key.startsWith(k) || k.startsWith(key)) return rows;
  }
  return [];
}

/**
 * Extract numeric values from a weapon_combo string for matching
 * against weapon detail IDs. e.g. "H416 Assault Rifle [5.56x45]" -> "h416assaultrifle"
 */
export function getWeaponKeys(displayName: string): string[] {
  const base = normalizeWeaponName(displayName);
  const keys = [base];
  // Also try without common suffixes
  const stripSuffixes = ['assaultrifle', 'carbine', 'smg', 'lmg', 'marksmanrifle', 'pistol', 'boltaction', 'microsmg'];
  for (const sfx of stripSuffixes) {
    if (base.endsWith(sfx)) {
      keys.push(base.slice(0, -sfx.length));
    }
  }
  return keys;
}
