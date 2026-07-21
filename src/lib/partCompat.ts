// ── Weapon part category ↔ catalog mapping, and compatibility filtering ──
// Shared by Aim Lab and Gunsmith so both pages agree on what fits what.
//
// Two data sources are combined:
// 1. `weapon.supportedTags` — the game's own per-weapon whitelist of exact
//    "Assemble.Category.Family[.Model]" tags. Authoritative wherever a part's
//    tag is known.
// 2. `accessories[].tag` — the ~95 catalog items (of ~970) the scraper found
//    an exact tag for, plus `weapon-part-compat.json`, a manually/heuristically
//    curated overlay filling in tags for the rest. Together these form the
//    "tag index" every filtering decision is based on.
// A part with NO tag anywhere (not yet curated) is hidden rather than shown
// broadly — an early "loose" fallback (show it to any weapon that supports
// the category at all) let clearly-wrong items leak through (a P90
// handguard on an M870 shotgun, an AKS-74U stock on an M870), which is
// exactly the failure mode this filtering exists to prevent. Better to show
// fewer items for an uncurated weapon/category than a wrong one; the compat
// editor (gunsmith/compat) is where that gap gets closed over time.

export interface CatalogPart {
  n?: string;
  [key: string]: unknown;
}

export interface AccessoryLike {
  id: number;
  tag: string;
  stats?: Record<string, unknown>;
}

export interface WeaponLike {
  id: number;
  supportedTags?: string[];
}

// Category -> catalog ID prefix(es). Verified against the actual item names
// in weapon-parts.json (2026-07) — the previous mapping (partPrefixMap in
// aim-lab, CATEGORY_PREFIX_MAP in gunsmith.ts) was wrong for 12 of 17
// categories, e.g. 'Magazine' pointed at Rear Grip items. 'IronSight',
// 'Trigger', 'Bipod', 'Ornament' are real or invented tag namespaces with no
// corresponding catalog data (no weapon ever lists Bipod/Trigger in its
// supportedTags, and no catalog item was found for IronSight), so they're
// intentionally left out of GUNSMITH_CATEGORIES below.
export const CATEGORY_PREFIX_MAP: Record<string, string[]> = {
  Foregrip: ['20101'],
  PistolGrip: ['20102'],
  Sight: ['20103'],
  Stocks: ['20104'],
  Magazine: ['20105'],
  Mount: ['20106'],
  Muzzle: ['20107'],
  Handguard: ['20108'],
  UpperReceiver: ['20110'],
  Barrel: ['20111'],
  Mod: ['20112', '20116'], // flashlights (20112) + lasers (20116)
  GasBlock: ['20114'],
  Bolt: ['20115'],
};

// Category display order for the Gunsmith build UI and the compat editor.
export const GUNSMITH_CATEGORIES = [
  'Barrel', 'Muzzle', 'Handguard', 'Foregrip', 'Stocks',
  'UpperReceiver', 'Bolt', 'GasBlock', 'PistolGrip', 'Magazine',
  'Mount', 'Sight', 'Mod',
];

export type TagIndex = Map<number, string>; // part id -> Assemble.* tag

// Merge the game's own known tags with the curated compat-override file.
// Known accessory tags win if both exist — they're the authoritative source.
export function buildTagIndex(
  accessories: AccessoryLike[],
  overrides?: Record<string, string> | null,
): TagIndex {
  const index: TagIndex = new Map();
  if (overrides) {
    for (const [idStr, tag] of Object.entries(overrides)) {
      index.set(Number(idStr), tag);
    }
  }
  for (const a of accessories) {
    if (typeof a.tag === 'string') index.set(a.id, a.tag);
  }
  return index;
}

export interface CompatiblePart {
  id: number;
  name: string;
  tag?: string;
  source: 'accessory' | 'catalog';
  stats?: Record<string, unknown>;
  raw: Record<string, unknown>;
}

// Explicit, weapon-centric compatibility list produced by the compat editor
// — weaponId -> category -> compatible part ids. Once a weapon has an entry
// for a category (even an empty array), that's the ground truth for it,
// bypassing tag-based inference entirely. Weapons/categories with no entry
// fall back to getCompatibleParts' tag-based logic below.
export type WeaponOverrides = Record<string, Record<string, number[]>>;

// Parts compatible with `weapon` in `category`.
export function getCompatibleParts(
  weapon: WeaponLike,
  category: string,
  accessories: AccessoryLike[],
  partCatalog: Record<string, CatalogPart>,
  tagIndex: TagIndex,
  names?: Record<string, string>,
  weaponOverrides?: WeaponOverrides | null,
): CompatiblePart[] {
  const prefixes = CATEGORY_PREFIX_MAP[category];
  if (!prefixes) return [];

  const overrideIds = weaponOverrides?.[String(weapon.id)]?.[category];
  if (overrideIds) {
    const allParts = getAllPartsInCategory(category, accessories, partCatalog, names);
    const allowed = new Set(overrideIds);
    return allParts.filter(p => allowed.has(p.id));
  }

  const supported = weapon.supportedTags || [];

  const results = new Map<number, CompatiblePart>();

  for (const a of accessories) {
    if (typeof a.tag !== 'string') continue;
    if (!a.tag.startsWith('Assemble.' + category + '.')) continue;
    if (!supported.includes(a.tag)) continue;
    results.set(a.id, {
      id: a.id,
      name: names?.[String(a.id)] || String(a.id),
      tag: a.tag,
      source: 'accessory',
      stats: a.stats,
      raw: a as unknown as Record<string, unknown>,
    });
  }

  for (const [pidStr, part] of Object.entries(partCatalog)) {
    if (!prefixes.some(p => pidStr.startsWith(p))) continue;
    if (!part?.n) continue;
    const id = Number(pidStr);
    if (results.has(id)) continue;
    const knownTag = tagIndex.get(id);
    if (!knownTag || !supported.includes(knownTag)) continue;
    results.set(id, {
      id,
      name: String(part.n),
      tag: knownTag,
      source: 'catalog',
      raw: part as Record<string, unknown>,
    });
  }

  return Array.from(results.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// Every catalog part in `category`, regardless of compatibility — used by
// the compat editor, which needs to show all candidates for review rather
// than just the ones currently deemed compatible.
export function getAllPartsInCategory(
  category: string,
  accessories: AccessoryLike[],
  partCatalog: Record<string, CatalogPart>,
  names?: Record<string, string>,
): CompatiblePart[] {
  const prefixes = CATEGORY_PREFIX_MAP[category];
  if (!prefixes) return [];
  const results = new Map<number, CompatiblePart>();

  for (const a of accessories) {
    if (typeof a.tag !== 'string') continue;
    if (!a.tag.startsWith('Assemble.' + category + '.')) continue;
    results.set(a.id, {
      id: a.id,
      name: names?.[String(a.id)] || String(a.id),
      tag: a.tag,
      source: 'accessory',
      stats: a.stats,
      raw: a as unknown as Record<string, unknown>,
    });
  }

  for (const [pidStr, part] of Object.entries(partCatalog)) {
    if (!prefixes.some(p => pidStr.startsWith(p))) continue;
    if (!part?.n) continue;
    const id = Number(pidStr);
    if (results.has(id)) continue;
    results.set(id, {
      id,
      name: String(part.n),
      source: 'catalog',
      raw: part as Record<string, unknown>,
    });
  }

  return Array.from(results.values()).sort((a, b) => a.name.localeCompare(b.name));
}
