#!/usr/bin/env node
// Fills gaps in public/images/{weapons,parts}/ using images from the
// Arena Breakout Infinite Fandom wiki (arena-breakout-infinite.fandom.com),
// a community-maintained public wiki — used here as a supplementary source
// for items missing from the local abi_assets import (scripts/import-part-images.js).
// Matches by exact normalized name only (no fuzzy guessing) so nothing gets
// mismatched; anything not found there stays missing.
//
// Usage: node scripts/import-wiki-images.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'public', 'data');
const outPartsDir = path.join(__dirname, '..', 'public', 'images', 'parts');
const outWeaponsDir = path.join(__dirname, '..', 'public', 'images', 'weapons');
fs.mkdirSync(outPartsDir, { recursive: true });
fs.mkdirSync(outWeaponsDir, { recursive: true });

const UA = 'abi-tracker-image-import/1.0 (local dev tool)';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, res => {
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

function norm(s) {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function getAllWikiImages() {
  const images = [];
  let cont = null;
  for (let i = 0; i < 50; i++) {
    let url = 'https://arena-breakout-infinite.fandom.com/api.php?action=query&list=allimages&ailimit=500&format=json';
    if (cont) url += '&aicontinue=' + encodeURIComponent(cont);
    const data = await fetchJson(url);
    images.push(...(data.query.allimages || []).map(i => ({ name: i.name, url: i.url })));
    if (data.continue && data.continue.aicontinue) cont = data.continue.aicontinue;
    else break;
    await new Promise(r => setTimeout(r, 200));
  }
  return images;
}

async function main() {
  const wd = JSON.parse(fs.readFileSync(path.join(dataDir, 'weapon-detail.json'), 'utf8'));
  const pc = JSON.parse(fs.readFileSync(path.join(dataDir, 'weapon-parts.json'), 'utf8'));
  const weapons = wd.weapons || [];

  console.log('Fetching wiki image index...');
  const wikiImages = await getAllWikiImages();
  console.log('Wiki has', wikiImages.length, 'images total.');

  // index by normalized filename (without extension)
  const byNorm = new Map();
  for (const img of wikiImages) {
    const base = img.name.replace(/\.(png|webp|jpg|jpeg)$/i, '');
    byNorm.set(norm(base), img);
  }

  let weaponsAdded = 0, partsAdded = 0;

  for (const w of weapons) {
    const dest = path.join(outWeaponsDir, `${w.id}.png`);
    if (fs.existsSync(dest)) continue;
    const entry = pc[String(w.id)];
    const candidates = [entry?.s, entry?.n].filter(Boolean);
    let hit = null;
    for (const c of candidates) {
      hit = byNorm.get(norm(c));
      if (hit) break;
    }
    if (hit) {
      await downloadFile(hit.url, dest);
      weaponsAdded++;
      console.log('weapon', w.id, '<-', hit.name);
      await new Promise(r => setTimeout(r, 150));
    }
  }

  for (const [idStr, part] of Object.entries(pc)) {
    if (!/^20/.test(idStr)) continue; // attachment catalog range only
    const dest = path.join(outPartsDir, `${idStr}.png`);
    if (fs.existsSync(dest)) continue;
    if (!part.n) continue;
    const hit = byNorm.get(norm(part.n));
    if (hit) {
      await downloadFile(hit.url, dest);
      partsAdded++;
      console.log('part', idStr, '<-', hit.name);
      await new Promise(r => setTimeout(r, 150));
    }
  }

  console.log('\nAdded', weaponsAdded, 'weapon images and', partsAdded, 'part images from the wiki.');
}

main().catch(e => { console.error(e); process.exit(1); });
