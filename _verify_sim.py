#!/usr/bin/env python3
"""Verify our sim engine (abiSim.ts) against abi-tracker's avg_shots tables.
Faithful Python mirror of src/lib/abiSim.ts. Monte Carlo over seeds,
compare avg shots-to-kill (chest) per weapon x ammo x armor combo.
"""
import json, re, math, sys
from difflib import SequenceMatcher

BASE = r"C:\Users\imran\Projects\interactive-maps-abi\public\data"

def load(name):
    with open(f"{BASE}\\{name}", encoding="utf-8") as f:
        d = json.load(f)
    if isinstance(d, list): return d
    for k in ("data", "rows", "weapons", "bullets", "armors"):
        if k in d: return d[k]
    return d  # dict itself (item_names.json)

def norm(s): return re.sub(r"[×xX]", "x", s).strip().lower()

def fuzzy(name, candidates, thr=0.9):
    best, br = None, 0.0
    nn = norm(name)
    for cn, obj in candidates:
        r = SequenceMatcher(None, nn, norm(cn)).ratio()
        if r > br: br, best = r, obj
    return (best, br) if br >= thr else (None, br)

# ── Engine mirror (abiSim.ts) ──────────────────────────────
def calcDistanceFactor(range_m, dd):
    if not dd or not dd.get("damageModifyZeroDistance"): return 1.0
    eff = dd["damageModifyZeroDistance"] / 100
    if range_m <= eff: return 1.0
    minRatio = (dd["damageMin"] / dd["damage"]) if dd.get("damage") else 0
    scaled = 1.0 - dd["damageDistanceModifier"] * (range_m - eff)
    return max(minRatio, scaled)

def calcDurProtRate(cur, mx):
    if mx <= 0: return 1.0
    r = cur / mx
    return min(1, 1.21 - 50 / (200 * r ** 1.2 + 45))

def calcPenChance(effPen, effProt, cur, mx, penCoeff):
    if cur <= 0: return 100.0
    diff = effPen - effProt
    if diff < -15: return 0.0
    full = cur / mx > 0.9999
    if diff < -10:
        if full: return 0.0
        return min(math.sqrt(abs(effPen - effProt + 21)) * penCoeff * 0.0316195525 * 100, 100)
    if diff < 0:
        if full: return 0.0
        return min(abs(effPen - effProt + 21) ** (2 / 3) * penCoeff * 0.0407166146 * 100, 100)
    c = 1 + 0.01 * effPen / (0.9 * effProt - effPen)
    pct = c * 100
    if pct > 89.989996: return 100.0
    return min(pct, 100)

def calcPenDamageScale(diff):
    if diff < -10: return 0.60
    if diff <= 9: return 0.65 + diff * 0.005
    if diff <= 19: return 0.80 + diff * 0.01
    return 1.0

def simulate_chest(bDmg, wMod, bPen, bArmorDmg, blunt, df, level, dur, penCoeff, hp=85, seed=0):
    s = seed
    def rand():
        nonlocal s
        s = (s * 1664525 + 1013904223) % 4294967296
        return s / 4294967296
    cur = dur
    scaledDmg, scaledPen, scaledArmorDmg = bDmg * df, bPen * df, bArmorDmg * df
    pds = calcPenDamageScale(bPen - level * 10)
    n = 0
    while n < 30 and hp > 0:
        n += 1
        effProt = (level * 10) * calcDurProtRate(cur, dur)
        ch = calcPenChance(scaledPen, effProt, cur, dur, penCoeff)
        pen = rand() * 100 <= ch
        if pen:
            dmg = round((scaledDmg + wMod) * pds)
        else:
            dmg = max(1, round((bDmg + wMod) * blunt * df))
        cur = max(0, round((cur - scaledArmorDmg * pds) * 100) / 100)
        hp = max(0, round((hp - dmg) * 1000) / 1000)
    return n

# ── Load + index ───────────────────────────────────────────
avg = load("avg_shots.json")
weapons = load("weapon-detail.json")
bullets = load("bullet-detail.json")
armors = load("armor-detail.json")
names = load("item_names.json")

w_name = [(names.get(str(w["id"])), w) for w in weapons if names.get(str(w["id"]))]
b_name = [(names.get(str(b["id"])), b) for b in bullets if names.get(str(b["id"]))]
a_name = [(names.get(str(a["id"])), a) for a in armors if names.get(str(a["id"]))]

COMBO_RE = re.compile(
    r"^(?P<weapon>.+?) Range (?P<range>\d+)m Fire Rate [\d.]+ rds/s \(\d+(?:\.\d+)? RPM\) "
    r"(?P<ammo>.+?) Lv(?P<tier>\d+) Base Dmg (?P<base>\d+)(?:\+(?P<mod>\d+)|-(?P<modneg>\d+))?(?: = (?P<total>\d+))? Pen (?P<pen>\d+)$"
)

ARMOR_ALIAS = {
    "BT201 Full Body Armor": "BT201 Full Body Armor",
    "926 Composite2 Gen Armor": "926 Composite Gen 2 Body Armor",
    "6B45 Heavy Armor": "6B45 Heavy Body Armor",
    "Sheriff Heavy Armor": "Sheriff Heavy Body Armor",
    "H-Tac A10 Rig": "H-Tac A10 Armored Rig",
    "KN Composite Armor": "KN Composite Body Armor",
    "SpartanC Rig": "Spartan C Heavy Armored Rig",
    "SEK Rig": "SEK Field Heavy Armored Rig",
    "AL Commander Rig": "AL Commander Armored Rig",
    "AL Assault Rig": "AL Assault Armored Rig",
    "BT101 Tactical Armor": "BT101 Tactical Body Armor",
    "AL Tactical Rig": "AL Tactical Armored Rig",
    "AVS Rig": "AVS Heavy Armored Rig",
}

def run_combo(combo, armor_name, dfmode, seeds=300, dlscale=1.0):
    m = COMBO_RE.match(combo)
    if not m:
        return None, "parse-fail"
    g = m.groupdict()
    base_weapon = g["weapon"].split(" Attach ")[0]
    w, wr = fuzzy(base_weapon, w_name)
    bl, br = fuzzy(g["ammo"], b_name)
    target = ARMOR_ALIAS.get(armor_name, armor_name)
    ar, arr = fuzzy(target, a_name)
    if not w or not bl or not ar:
        return None, f"lookup-fail (w={wr:.2f} b={br:.2f} a={arr:.2f})"
    ws, bs, as_ = w["stats"], bl["stats"], ar["stats"]
    dd = w.get("damageDistance") or {}
    rng = int(g["range"])
    if dfmode == "none":
        df = 1.0
    elif dfmode == "zerodrop":
        zd = float(ws.get("ZeroDropDistance") or 0)
        eff = zd / 100 if zd > 0 else (dd.get("damageModifyZeroDistance") or 0) / 100
        df = 1.0 if rng <= eff else 0.70  # flat -30% step (skrux sheet)
    else:
        eff = (dd.get("damageModifyZeroDistance") or 0) / (10 if dfmode == "tenth" else 100)
        if rng <= eff:
            df = 1.0
        else:
            minRatio = (dd["damageMin"] / dd["damage"]) if dd.get("damage") else 0
            df = max(minRatio, 1.0 - dd["damageDistanceModifier"] * (rng - eff))
    bDmg = int(g["base"]); wMod = int(g["mod"] or 0) - int(g["modneg"] or 0); bPen = int(g["pen"])
    bArmorDmg = float(bs.get("ArmorDamage") or 0)
    blunt = float(bs.get("BulletBlockDamageFactor") or 0.05)
    level = int(as_.get("armor_level") or 0)
    dur = float(ar.get("durabilityMax") or 0) / 10
    penCoeff = float(as_.get("armor_penetrate_coefficient") or 1)
    shots = [simulate_chest(bDmg, wMod, bPen, bArmorDmg * dlscale, blunt, df, level, dur, penCoeff, seed=s)
             for s in range(1, seeds + 1)]
    return sum(shots) / len(shots), None

# ── Run ────────────────────────────────────────────────────
LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 30
SEEDS = int(sys.argv[2]) if len(sys.argv) > 2 else 300
DFMODE = sys.argv[3] if len(sys.argv) > 3 else "none"  # none | zerodrop | hundred | tenth
DLSCALE = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
ok, fail = 0, 0
diffs = []
print(f"distance mode: {DFMODE} | dur-loss scale: {DLSCALE}")
print(f"{'combo':<36} {'armor':<26} {'their':>6} {'ours':>6} {'diff':>6}")
print("-" * 80)
for r in avg[:LIMIT]:
    combo, armor = r["weapon_combo"], r["armor_name"]
    parsed = r.get("parsed") or {}
    theirs = parsed.get("avg_shots")
    ours, err = run_combo(combo, armor, DFMODE, SEEDS, DLSCALE)
    if err or ours is None or theirs is None:
        fail += 1
        print(f"{combo.split(' Range ')[0][:34]:<36} SKIP ({err})")
        continue
    d = ours - theirs
    diffs.append(abs(d))
    flag = "  <-- MISMATCH" if abs(d) > 0.35 else ""
    print(f"{combo.split(' Range ')[0][:34]:<36} {armor[:24]:<26} {theirs:>5.2f} {ours:>5.2f} {d:>+5.2f}{flag}")
    if abs(d) <= 0.35: ok += 1

if diffs:
    print(f"\n{ok}/{ok+fail} matched (within 0.35 shots), mean |diff| = {sum(diffs)/len(diffs):.3f}, max = {max(diffs):.3f}")
