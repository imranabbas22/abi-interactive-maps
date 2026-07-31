#!/usr/bin/env python3
"""Build final THRESHOLD_DATA with material + repairPct + factoryMax."""
import json

BASE = r"C:\Users\imran\Projects\interactive-maps-abi"

with open(BASE + r"\public\data\armor-detail.json", encoding="utf-8") as f:
    data = json.load(f)
armors = data.get("armors", data if isinstance(data, list) else [])

with open(BASE + r"\public\data\item_names.json", encoding="utf-8") as f:
    names = json.load(f)

by_id = {}
for a in armors:
    if not a:
        continue
    aid = a.get("id")
    by_id[aid] = {
        "name": names.get(str(aid), f"ID_{aid}"),
        "durMax": (a.get("durabilityMax") or 0) / 10,
        "factoryMax": (a.get("factoryDurabilityMax") or 0) / 10,
        "bpMax": (a.get("blueprintDurabilityMax") or 0) / 10,
        "type": a.get("nativeArmorType"),
        "materialId": (a.get("stats") or {}).get("armor_material_id"),
    }

# Skrux sheet: item -> (wornMin, likeNewMin, material)
skrux = [
    # (name, id, wornMin, likeNewMin, material, category)
    ("H-LC Tactical Body Armor", 301060004, 49, 56, "Composite", "Vest"),
    ("BT6 Heavy Body Armor", 301060010, 63, 69, "Titanium", "Vest"),
    ("IMTV Samurai Standard Body Armor", 301060014, 49, 54, "Aluminum", "Vest"),
    ("IMTV Samurai Assault Body Armor", 301060015, 56, 61, "Aluminum", "Vest"),
    ("IMTV Samurai Full Protection Body Armor", 301060016, 63, 69, "Aluminum", "Vest"),
    ("926 Composite Body Armor", 301060017, 49, 56, "Composite", "Vest"),
    ("Defender M4 Heavy Body Armor", 301060020, 56, 65, "Hardened steel", "Vest"),
    ("Marshal Heavy Body Armor", 301060006, 80, 98, "Ceramic", "Vest"),
    ("BT101 Tactical Body Armor", 301060011, 70, 85, "Ceramic", "Vest"),
    ("KN Composite Body Armor", 301060026, 77, 94, "Ceramic", "Vest"),
    ("6B45 Heavy Body Armor", 301060027, 84, 98, "Hardened Steel", "Vest"),
    ("BT201 Full Body Armor", 301060032, 88, 97, "Aluminum", "Vest"),
    ("Warrior Heavy Armored Chest Rig", 301010203, 38, 43, "Composite", "Rig"),
    ("H-Tac A8 Armored Rig", 301010209, 42, 48, "Composite", "Rig"),
    ("H-Tac A9 Armored Rig", 301010210, 46, 56, "Ceramic", "Rig"),
    ("Defender M4 Heavy Armored Rig", 301010213, 70, 82, "Hardened steel", "Rig"),
    ("Spartan C Heavy Armored Rig", 301010201, 70, 82, "Hardened Steel", "Rig"),
    ("AVS Heavy Armored Rig", 301010211, 63, 77, "Ceramic", "Rig"),
    ("AL Assault Armored Rig", 301010222, 63, 73, "Composite", "Rig"),
    ("AL Tactical Armored Rig", 301010223, 66, 77, "Ceramic", "Rig"),
    ("AL Commander Armored Rig", 301010224, 70, 82, "Hardened Steel", "Rig"),
    ("FA Assault Tactical Helmet", 301040010, 35, 40, "Composite", "Helmet"),
    ("03 Heavy Tactical Helmet", 301040026, 32, 36, "Composite", "Helmet"),
    ("RSP Heavy Tactical Helmet", 301040027, 38, 43, "Composite", "Helmet"),
    ("SH50 Military Helmet", 301040028, 42, 49, "Hardened steel", "Helmet"),
    ("SH Matzka 2 Helmet", 301040029, 46, 54, "Hardened steel", "Helmet"),
    ("SH60 Military Helmet", 301040033, 35, 40, "Composite", "Helmet"),
    ("AN95 Heavy Blast Helmet", 301040036, 38, 42, "Titanium", "Helmet"),
    ("6BNT Helmet", 301040005, 52, 61, "Hardened steel", "Helmet"),
    ("IND50 Heavy Tactical Helmet", 301040048, 42, 48, "Composite", "Helmet"),
    ("SH65 Military Helmet", 301040032, 46, 52, "Composite", "Helmet"),
    ("RST Special Forces Helmet", 301040034, 52, 57, "Aluminum", "Helmet"),
    ("HG84 Offensive Helmet", 301040006, 49, 56, "Composite", "Helmet"),
    ("DOD9 Blast Helmet", 301040008, 52, 59, "Composite", "Helmet"),
    ("AS200 Heavy Tactical Helmet", 301040014, 46, 49, "Polyethylene", "Helmet"),
    ("IND70 Tactical Helmet", 301040035, 56, 60, "Polyethylene", "Helmet"),
    ("SH Matzka Mask", 301050007, 35, 41, "Hardened Steel", "Mask"),
    ("SH65 Military Mask A", 301050009, 38, 49, "Glass", "Mask"),
    ("SH65 Military Mask B", 301050011, 49, 56, "Composite", "Mask"),
    ("6BNT Blast Mask", 301050006, 46, 54, "Hardened Steel", "Mask"),
    ("RST Special Forces Mask", 301050013, 49, 54, "Aluminum", "Mask"),
]

# Repair % lost after repair (skrux material table: repair coef x 100)
repair_pct = {
    "Composite": 11.9,
    "Aramid": 4.5,
    "Polyethylene": 6.0,
    "Titanium": 8.5,
    "Aluminum": 8.9,
    "Hardened steel": 14.5,
    "Hardened Steel": 14.5,
    "Ceramic": 18.0,
    "Glass": 22.5,  # extrapolated: glass repair coef 0.225 = 22.5%
}

print(f"{'Item':42s} {'ID':>10s} {'Dur':>5s} {'Fact':>5s} {'BP':>5s} {'Worn':>4s} {'LikeN':>5s} {'Mat':16s} {'Rep%':>5s}")
print("-" * 110)
for name, aid, worn, like_new, mat, cat in skrux:
    info = by_id.get(aid, {})
    dur = info.get("durMax")
    fact = info.get("factoryMax")
    bp = info.get("bpMax")
    rp = repair_pct.get(mat, "?")
    dur_s = f"{dur:g}" if dur is not None else "?"
    fact_s = f"{fact:g}" if fact is not None else "?"
    bp_s = f"{bp:g}" if bp is not None else "?"
    flag = "" if (dur == fact) else "  <-- DIFF!"
    print(f"{name:42s} {aid:>10d} {dur_s:>5s} {fact_s:>5s} {bp_s:>5s} {worn:>4d} {like_new:>5d} {mat:16s} {rp:>5}{flag}")
