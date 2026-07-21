#!/usr/bin/env node
// Copies weapon/part images from a local abi_assets folder into
// public/images/{weapons,parts}/<id>.png, matched by ID (parts) or by
// short model code (weapons — the image set uses a different numbering
// scheme than weapon-detail.json's weapon IDs).
//
// The source folder is NOT part of this repo (game assets aren't
// redistributed via the codebase) — this is a one-off local import step;
// rerun it whenever new images are added to the source folder, pointing
// SOURCE_DIR at wherever they live on your machine.
//
// Usage: node scripts/import-part-images.js [source_dir]

const fs = require('fs');
const path = require('path');

const SOURCE_DIR = process.argv[2] || 'C:/Users/imran/abi_assets';
const PARTS_SRC = path.join(SOURCE_DIR, 'weapon_parts');
const GUNS_SRC = path.join(SOURCE_DIR, 'guns');

const dataDir = path.join(__dirname, '..', 'public', 'data');
const outPartsDir = path.join(__dirname, '..', 'public', 'images', 'parts');
const outWeaponsDir = path.join(__dirname, '..', 'public', 'images', 'weapons');
fs.mkdirSync(outPartsDir, { recursive: true });
fs.mkdirSync(outWeaponsDir, { recursive: true });

const wd = JSON.parse(fs.readFileSync(path.join(dataDir, 'weapon-detail.json'), 'utf8'));
const pc = JSON.parse(fs.readFileSync(path.join(dataDir, 'weapon-parts.json'), 'utf8'));
const weapons = wd.weapons || [];
const weaponIds = new Set(weapons.map(w => w.id));

const weaponShortCode = new Map();
for (const w of weapons) {
  const entry = pc[String(w.id)];
  if (entry && entry.s) weaponShortCode.set(w.id, entry.s);
}

function norm(s) {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function walkPngs(dir) {
  const out = [];
  for (const cat of fs.readdirSync(dir)) {
    const catDir = path.join(dir, cat);
    if (!fs.statSync(catDir).isDirectory()) continue;
    for (const f of fs.readdirSync(catDir)) {
      if (f.toLowerCase().endsWith('.png')) out.push(path.join(catDir, f));
    }
  }
  return out;
}

// ── Parts: filename ends in the exact catalog part ID ──
let partsMatched = 0;
for (const file of walkPngs(PARTS_SRC)) {
  const f = path.basename(file);
  const m = f.match(/(\d+)\.png$/i);
  if (!m) continue;
  const id = m[1];
  if (!pc[id]) continue; // not a known catalog item — skip
  fs.copyFileSync(file, path.join(outPartsDir, `${id}.png`));
  partsMatched++;
}

// ── Weapons: filename's trailing id is sometimes the real weapon id,
// otherwise match by the short model code prefix in the filename ──
const weaponMatches = new Map(); // weaponId -> { file, viaDirectId }
for (const file of walkPngs(GUNS_SRC)) {
  const f = path.basename(file);
  const m = f.match(/(\d+)\.png$/i);
  if (!m) continue;
  const trailingId = Number(m[1]);

  if (weaponIds.has(trailingId)) {
    weaponMatches.set(trailingId, { file, viaDirectId: true });
    continue;
  }

  const namePart = f.replace(/\.png$/i, '').replace(/_\d+$/, '');
  const nameNorm = norm(namePart);
  let best = null;
  for (const [wid, code] of weaponShortCode) {
    const codeNorm = norm(code);
    if (!codeNorm || codeNorm.length < 2) continue;
    if (nameNorm.includes(codeNorm)) {
      if (!best || codeNorm.length > norm(weaponShortCode.get(best)).length) best = wid;
    }
  }
  if (best && !weaponMatches.get(best)?.viaDirectId) {
    weaponMatches.set(best, { file, viaDirectId: false });
  }
}

for (const [wid, { file }] of weaponMatches) {
  fs.copyFileSync(file, path.join(outWeaponsDir, `${wid}.png`));
}

console.log('Part images copied:', partsMatched, '/ (catalog has', Object.keys(pc).length, 'entries total)');
console.log('Weapon images copied:', weaponMatches.size, '/', weapons.length, 'weapons');
