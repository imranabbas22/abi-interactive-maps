#!/usr/bin/env python3
"""Extract all armor data from the ABI interactive maps simulator."""

import json, os

BASE = "C:/Users/imran/Projects/interactive-maps-abi"

# Load armor detail data
with open(os.path.join(BASE, "public/data/armor-detail.json"), "r") as f:
    data = json.load(f)

armors = data.get("armors", data if isinstance(data, list) else [])

# Load item names
with open(os.path.join(BASE, "public/data/item_names.json"), "r") as f:
    names = json.load(f)

# Build rows
rows = []
seen_ids = set()
for a in armors:
    if not a:
        continue
    aid = a.get("id", 0)
    if aid in seen_ids:
        continue
    seen_ids.add(aid)
    
    s = a.get("stats", {}) or {}
    name = names.get(str(aid), f"ID_{aid}")
    armor_type = a.get("nativeArmorType", "Unknown")
    
    dur_max = a.get("durabilityMax", 0) or 0
    factory_dur = a.get("factoryDurabilityMax", 0) or 0
    bp_dur = a.get("blueprintDurabilityMax", 0) or 0
    
    rows.append({
        "id": aid,
        "name": name,
        "type": armor_type,
        "assemble_tag": a.get("assembleTag", ""),
        "level": s.get("armor_level"),
        "pen_factor": s.get("armor_antipenetrationfactor"),
        "block_dmg_scale": s.get("armor_damagescaleforblock"),
        "pen_coeff": s.get("armor_penetrate_coefficient"),
        "pen_constant": s.get("armor_penetrate_coefficient_constant"),
        "destructibility": s.get("armor_destructibility"),
        "durability_max": dur_max,
        "durability_max_pts": round(dur_max / 10) if dur_max else 0,
        "factory_durability_pts": round(factory_dur / 10) if factory_dur else 0,
        "blueprint_durability_pts": round(bp_dur / 10) if bp_dur else 0,
        "ricochet_angle": s.get("armor_ricochetangle"),
        "ricochet_prob_min": s.get("armor_ricochetprobabilitymin"),
        "ricochet_prob_max": s.get("armor_ricochetprobabilitymax"),
        "ricochet_cooldown": s.get("armor_ricochetcooldown"),
        "move_speed_pct": s.get("MoveSpeed"),
        "turn_speed_pct": s.get("TurnSpeed"),
        "ergonomics": s.get("Engonomics"),
        "sound_level_pct": s.get("SoundLevelInfluence"),
        "sound_max_dist_pct": s.get("SoundMaxDistanceInfluenceFactor"),
        "sound_indicator_lv_pct": s.get("SoundIndicatorLevelInfluence"),
        "sound_indicator_dist_pct": s.get("SoundIndicatorMaxDistanceInfluenceFactor"),
        "flash_reduction_pct": s.get("FlashTimeInfluenceFactor"),
        "protect_mask": s.get("armor_protectmask"),
        "head_detail_mask": s.get("armor_headdetailprotectmask"),
        "broken_screen": bool(s.get("HasBrokenScreenEffect")),
        "material_id": s.get("armor_material_id"),
    })

# ── Print summary ──
helmets = [r for r in rows if r["type"] == "Helmet"]
vests = [r for r in rows if r["type"] == "Vest"]
unknown = [r for r in rows if r["type"] not in ("Helmet", "Vest")]

print(f"{'='*80}")
print(f"  ABI INTERACTIVE MAPS — ALL ARMOR DATA EXTRACT")
print(f"{'='*80}")
print()
print(f"TOTAL: {len(rows)} items")
print(f"  Helmets: {len(helmets)}")
print(f"  Vests:   {len(vests)}")
print(f"  Other:   {len(unknown)}")
print()

levels = sorted(set(r["level"] for r in rows if r["level"] is not None), reverse=True)
print(f"Levels present: {levels}")
print()

# ── Per-level breakdown ──
for lv in levels:
    items = [r for r in rows if r["level"] == lv]
    h = [r for r in items if r["type"] == "Helmet"]
    v = [r for r in items if r["type"] == "Vest"]
    print(f"{'─'*80}")
    print(f"  LEVEL {lv}  ({len(items)} items — {len(h)} helmets, {len(v)} vests)")
    print(f"{'─'*80}")
    for r in items:
        dur_pts = r["durability_max_pts"]
        pen_f = r["pen_factor"]
        block = r["block_dmg_scale"]
        destr = r["destructibility"]
        ergo = r["ergonomics"]
        move = r["move_speed_pct"]
        
        type_mark = "H" if r["type"] == "Helmet" else ("V" if r["type"] == "Vest" else "?")
        print(f"  [{type_mark}] ID={r['id']:<10} {r['name']:<42s}")
        print(f"       Dur:{dur_pts:>4}pts | PenFac:{str(pen_f):>5s} | Block:{str(block):>7s} | Destruct:{str(destr):>7s} | Ergo:{str(ergo):>5s} | Move:{str(move):>5s}")
        if r["ricochet_angle"] is not None:
            print(f"       Ricochet: {r['ricochet_angle']}° (min={r['ricochet_prob_min']}, max={r['ricochet_prob_max']}, cd={r['ricochet_cooldown']}s)")
        if r.get("broken_screen"):
            print(f"       [Broken Screen Effect]")
        tag = r.get("assemble_tag", "")
        if tag:
            print(f"       Assemble Tag: {tag}")
    print()

# ── Raw data dump ──
print(f"{'='*80}")
print(f"  RAW JSON — ALL {len(rows)} ARMOR ITEMS")
print(f"{'='*80}")
print(json.dumps(rows, indent=2))

# Save to file
with open(os.path.join(BASE, "armor_extract_full.json"), "w") as f:
    json.dump({
        "summary": {
            "total": len(rows),
            "helmets": len(helmets),
            "vests": len(vests),
            "levels": levels,
        },
        "armors": rows
    }, f, indent=2)

print(f"\nFull JSON saved to: armor_extract_full.json")
