#!/usr/bin/env node
// Generates public/data/weapon-part-compat.json — a best-effort part-id -> tag
// mapping for the ~90% of the attachment catalog that has no known tag in the
// `accessories` array. See the plan doc in this session for background.
//
// Ground truth used: weapon.supportedTags already lists every real
// "Assemble.Category.Family[.Model]" tag string that exists for each weapon,
// per category. This script never invents new tag strings — it only assigns
// an EXISTING tag (drawn from that real vocabulary) to an untagged catalog
// item, by matching the item's name/short-label against weapon model codes
// (Pass 1, high confidence) or a small hand-built platform-family table
// (Pass 2, lower confidence — flagged as such in the output for the editor).
//
// Rerun with: node scripts/classify-part-compat.js

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'public', 'data');
const wd = JSON.parse(fs.readFileSync(path.join(dataDir, 'weapon-detail.json'), 'utf8'));
const pc = JSON.parse(fs.readFileSync(path.join(dataDir, 'weapon-parts.json'), 'utf8'));

const weapons = wd.weapons || [];
const accessories = wd.accessories || [];

// Category -> catalog ID prefix(es). Kept in sync with src/lib/partCompat.ts.
const CATEGORY_PREFIX_MAP = {
  Foregrip: ['20101'], PistolGrip: ['20102'], Sight: ['20103'], Stocks: ['20104'],
  Magazine: ['20105'], Mount: ['20106'], Muzzle: ['20107'], Handguard: ['20108'],
  UpperReceiver: ['20110'], Barrel: ['20111'], Mod: ['20112', '20116'],
  GasBlock: ['20114'], Bolt: ['20115'],
};

// weaponId -> short model code, e.g. 101010001 -> "AKM" (weapon-parts.json
// carries a catalog entry for each weapon itself, with the same ID).
const weaponShortCode = new Map();
for (const w of weapons) {
  const entry = pc[String(w.id)];
  if (entry && entry.s) weaponShortCode.set(w.id, entry.s);
}

// Item names often use an abbreviated/alternate form of the weapon's own
// short code ("M4" instead of "M4A1", "AKS 74" instead of "AKS74U"). Extra
// aliases per weapon short code, checked in addition to the code itself.
// Kept to 4+ chars / alphanumeric-mixed only — short pure-letter aliases
// (e.g. a bare "AKS") risk accidentally matching inside unrelated fused
// words once spaces are stripped (caught "Oak Stock" -> "...OAKS...").
const CODE_ALIASES = {
  M4A1: ['M4'],
  AKS74U: ['AKS74'],
  AK74N: ['AK74'],
  RPK16: ['RPK16'],
  // Bare "Vector" (no caliber suffix) appears in some item names; both
  // variants share identical tags wherever the item is genuinely ambiguous
  // (e.g. UpperReceiver), so aliasing both is safe — categories where they
  // truly differ (e.g. Barrel, caliber-specific) correctly stay ambiguous.
  Vector45: ['Vector'],
  Vector9: ['Vector'],
};
function candidateCodesFor(code) {
  const out = [code];
  if (CODE_ALIASES[code]) out.push(...CODE_ALIASES[code]);
  return out;
}

function norm(s) {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Hand-built platform families for the Pass 2 fallback (generic "AK Series
// X" / "AR Compatible X" style names that don't embed one specific model
// code). Deliberately small and conservative.
const FAMILY_ROOTS = {
  AK: (code) => /^AK/i.test(code || ''),
  AR: (code) => /^(M4A1|AR57|AR30|M16)$/i.test(code || ''),
};
const FAMILY_WORD_RE = {
  AK: /\bAK\b/,
  AR: /\bAR\b/,
};

const alreadyTagged = new Set(accessories.filter(a => typeof a.tag === 'string').map(a => a.id));

const result = {}; // partId -> tag
const report = { pass1: [], pass2: [], unclassified: [] };

for (const [category, prefixes] of Object.entries(CATEGORY_PREFIX_MAP)) {
  // tag -> Set(weaponId) for this category, from real supportedTags data
  const tagWeapons = new Map();
  for (const w of weapons) {
    for (const t of (w.supportedTags || [])) {
      if (!t.startsWith('Assemble.' + category + '.')) continue;
      if (!tagWeapons.has(t)) tagWeapons.set(t, new Set());
      tagWeapons.get(t).add(w.id);
    }
  }
  // weaponId -> [tags] for this category
  const weaponTags = new Map();
  for (const [tag, ids] of tagWeapons) {
    for (const id of ids) {
      if (!weaponTags.has(id)) weaponTags.set(id, []);
      weaponTags.get(id).push(tag);
    }
  }

  // Precompute Pass-2 family tag candidates: for each family, the tag(s)
  // in this category whose weapon set is a non-trivial subset of the family.
  const familyTagChoice = {};
  for (const [famName, isMember] of Object.entries(FAMILY_ROOTS)) {
    const familyWeaponIds = new Set(weapons.filter(w => isMember(weaponShortCode.get(w.id))).map(w => w.id));
    if (familyWeaponIds.size < 2) continue;
    let best = null;
    for (const [tag, ids] of tagWeapons) {
      const overlap = [...ids].filter(id => familyWeaponIds.has(id)).length;
      if (overlap < 2) continue; // avoid single-weapon tags
      if (!best || overlap > best.overlap) best = { tag, overlap };
    }
    if (best) familyTagChoice[famName] = best.tag;
  }

  const items = Object.entries(pc).filter(([id]) => prefixes.some(p => id.startsWith(p)));

  for (const [idStr, part] of items) {
    const id = Number(idStr);
    if (alreadyTagged.has(id)) continue;
    if (!part.n) continue;
    const nameNorm = norm(part.n);
    const sNorm = norm(part.s);

    // ── Pass 1: exact (or aliased) weapon model-code match (longest code wins) ──
    const candidates = [];
    for (const [wid, code] of weaponShortCode) {
      for (const aliasCode of candidateCodesFor(code)) {
        const codeNorm = norm(aliasCode);
        if (!codeNorm || codeNorm.length < 2) continue;
        if (nameNorm.includes(codeNorm) || sNorm.includes(codeNorm)) {
          for (const tag of (weaponTags.get(wid) || [])) {
            candidates.push({ tag, len: codeNorm.length, codeNorm });
          }
          break; // one match per weapon is enough
        }
      }
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.len - a.len);
      const bestLen = candidates[0].len;
      const tied = candidates.filter(c => c.len === bestLen);
      let uniqueTags = [...new Set(tied.map(c => c.tag))];
      const matchedCodeNorm = tied[0].codeNorm; // same weapon-code match for all tied candidates

      if (uniqueTags.length > 1) {
        // Tie-break A: a weapon can carry multiple tags in one category (a
        // base stock tag and a separate "StockAdapter" tag). Prefer whichever
        // tag shares a structural keyword with the item name (Adapter, Pad,
        // Cheek, ...). Exclude the category name/generic filler words —
        // nearly every item in e.g. Stocks has "Stock" in its name, so that
        // word alone can't discriminate between candidate tags.
        const GENERIC_WORDS = new Set(['OTHER', 'COMMON', 'STANDARD', category.toUpperCase(),
          category.toUpperCase().replace(/S$/, '')]);
        const keywordedA = uniqueTags.filter(tag => {
          const tagWords = tag.split('.').slice(2).join(' ');
          return norm(tagWords).length > 0 &&
            tagWords.split(/(?=[A-Z])/).some(w =>
              w.length > 2 && !GENERIC_WORDS.has(norm(w)) && nameNorm.includes(norm(w)));
        });

        // Tie-break B: some weapons carry model-code variants that only
        // differ by an ALL-CAPS suffix appended to the code itself (MP5 vs
        // MP5SD) — too short to split into words for tie-break A. Prefer a
        // variant whose extra suffix text also appears in the item name
        // ("...SD Upper Receiver" -> MP5SD); if none of the variants' extra
        // text appears, fall back to the plain base-code tag (no suffix).
        let uniqueTagsB = uniqueTags;
        const specific = uniqueTags.filter(tag => {
          const lastSeg = norm(tag.split('.').pop() || '');
          if (!lastSeg.startsWith(matchedCodeNorm)) return false;
          const extra = lastSeg.slice(matchedCodeNorm.length);
          return extra.length > 0 && nameNorm.includes(extra);
        });
        if (specific.length === 1) {
          uniqueTagsB = specific;
        } else if (specific.length === 0) {
          const base = uniqueTags.filter(tag => norm(tag.split('.').pop() || '') === matchedCodeNorm);
          if (base.length === 1) uniqueTagsB = base;
        }

        if (keywordedA.length === 1) uniqueTags = keywordedA;
        else if (uniqueTagsB.length === 1) uniqueTags = uniqueTagsB;
      }
      if (uniqueTags.length === 1) {
        result[id] = uniqueTags[0];
        report.pass1.push({ id, name: part.n, tag: uniqueTags[0] });
        continue;
      }
    }

    // ── Pass 2: platform-family fallback ("AK Series X", "AR Compatible X") ──
    let matchedFamily = null;
    for (const [famName, re] of Object.entries(FAMILY_WORD_RE)) {
      if (re.test(part.n)) { matchedFamily = famName; break; }
    }
    if (matchedFamily && familyTagChoice[matchedFamily]) {
      result[id] = familyTagChoice[matchedFamily];
      report.pass2.push({ id, name: part.n, tag: familyTagChoice[matchedFamily], family: matchedFamily });
      continue;
    }

    report.unclassified.push({ id, name: part.n, category });
  }
}

fs.writeFileSync(path.join(dataDir, 'weapon-part-compat.json'), JSON.stringify(result));
fs.writeFileSync(path.join(__dirname, 'classify-part-compat-report.json'), JSON.stringify(report, null, 2));

console.log('Pass 1 (model-code match):', report.pass1.length);
console.log('Pass 2 (family fallback):', report.pass2.length);
console.log('Unclassified (left for manual review):', report.unclassified.length);
console.log('Total classified:', Object.keys(result).length);
