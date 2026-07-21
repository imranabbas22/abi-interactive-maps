import json, math, os, re

ROOT = 'C:/Users/imran/Projects/interactive-maps-abi/public/data'

def safe_float(val, default=0.0):
    try:
        v = float(val or 0)
        return v
    except (ValueError, TypeError):
        return default

def safe_int(val, default=0):
    try:
        v = int(val or 0)
        return v
    except (ValueError, TypeError):
        return default

# Load data
with open(f'{ROOT}/weapon-detail.json', encoding='utf-8') as f: wd = json.load(f)
with open(f'{ROOT}/bullet-detail.json', encoding='utf-8') as f: bd = json.load(f)
with open(f'{ROOT}/item_names.json', encoding='utf-8') as f: names = json.load(f)

weapons = wd.get('weapons', [])
accessories = wd.get('accessories', [])
bullets = bd if isinstance(bd, list) else bd.get('bullets', [])

print(f"Weapons: {len(weapons)}, Bullets: {len(bullets)}, Accessories: {len(accessories)}")

def get_name(id_val):
    return names.get(str(id_val), f"ID {id_val}")

def calc_pen_damage_scale(bullet_pen, armor_level):
    base_prot = armor_level * 10
    diff = bullet_pen - base_prot
    if diff < -10: return 0.60
    elif diff <= 9: return 0.65 + diff * 0.005
    elif diff <= 19: return 0.80 + diff * 0.01
    else: return 1.0

HEAD_HP = 40
CHEST_HP = 85

def normalize_cal(cal):
    return re.sub(r'[.\s×x]', '', cal).lower()

rows = []
weapon_names_done = set()

for w in weapons:
    w_id = w['id']
    w_name = get_name(str(w_id))
    ws = w.get('stats', {}) or {}
    w_cal = normalize_cal(w.get('caliber', ''))
    w_mod = safe_float(ws.get('AdapterAdjustDamage', 0))
    rpm = safe_float(ws.get('FireRate', 0))
    
    # Find barrel attachments with damage mod
    barrel_mods = []
    if w.get('supportedTags'):
        for tag in w['supportedTags']:
            if tag.startswith('Assemble.Barrel.'):
                for acc in accessories:
                    if isinstance(acc.get('tag'), str) and acc['tag'] == tag:
                        acc_stats = acc.get('stats', {}) or {}
                        bm = safe_float(acc_stats.get('AdapterAdjustDamage', 0))
                        if bm != 0:
                            barrel_mods.append((acc, bm))
                        break
    
    # Find compatible bullets
    compatible = []
    for b in bullets:
        bs = b.get('stats', {}) or {}
        b_cal = normalize_cal(b.get('caliber', ''))
        b_dmg = safe_float(bs.get('BaseDamage', 0))
        b_pen = safe_float(bs.get('PenetrationFactor', 0))
        if b_dmg <= 0 or b_pen <= 0:
            continue
        if w_cal and (b_cal in w_cal or w_cal in b_cal):
            compatible.append(b)
    
    if not compatible:
        print(f"  SKIP {w_name}: no compatible bullets (cal={w.get('caliber','?')})")
        continue
    
    # For each bullet, compute STK vs armor levels 1-6
    for b in compatible:
        bs = b.get('stats', {}) or {}
        b_dmg = safe_float(bs.get('BaseDamage', 0))
        b_pen = safe_float(bs.get('PenetrationFactor', 0))
        b_tier = safe_int(bs.get('PenetrationLevel', 0))
        b_name = get_name(str(b['id']))
        
        base_dmg = b_dmg + w_mod
        
        for al in [1, 2, 3, 4, 5, 6]:
            scale = calc_pen_damage_scale(b_pen, al)
            final_dmg = round(base_dmg * scale)
            if final_dmg <= 0: continue
            
            head_stk = math.ceil(HEAD_HP / final_dmg)
            chest_stk = math.ceil(CHEST_HP / final_dmg)
            if head_stk > 30 and chest_stk > 30: continue  # skip impossible
            
            rows.append({
                'weapon_combo': w_name,
                'damage_modifier': f"{int(w_mod):+d} DMG Weapon Base: {int(w_mod):+d}",
                'ammo_name': f"{b_name} Base Dmg: {int(b_dmg)} | Pen: {int(b_pen)}",
                'pen_level': f"Lv{b_tier}",
                'armor_level': f"Lv{al}",
                'head_shots': f"{head_stk} shots ({final_dmg} dmg)",
                'chest_shots': f"{chest_stk} shots ({final_dmg} dmg)",
                'ttk_ms': f"{(head_stk - 1) * (60000.0 / rpm) if rpm > 0 else 0:.0f}",
            })
        
        # Barrel variant rows (one per barrel)
        for acc, bm in barrel_mods:
            barrel_base = b_dmg + w_mod + bm
            for al in [1, 2, 3, 4, 5, 6]:
                scale = calc_pen_damage_scale(b_pen, al)
                final_dmg = round(barrel_base * scale)
                if final_dmg <= 0: continue
                
                head_stk = math.ceil(HEAD_HP / final_dmg)
                chest_stk = math.ceil(CHEST_HP / final_dmg)
                if head_stk > 30 and chest_stk > 30: continue
                
                acc_name = get_name(str(acc['id']))
                rows.append({
                    'weapon_combo': f"{w_name} + {acc_name}",
                    'damage_modifier': f"{int(w_mod + bm):+d} DMG Weapon ({int(w_mod):+d}) + Barrel ({int(bm):+d})",
                    'ammo_name': f"{b_name} Base Dmg: {int(b_dmg)} | Pen: {int(b_pen)}",
                    'pen_level': f"Lv{b_tier}",
                    'armor_level': f"Lv{al}",
                    'head_shots': f"{head_stk} shots ({final_dmg} dmg)",
                    'chest_shots': f"{chest_stk} shots ({final_dmg} dmg)",
                    'ttk_ms': f"{(head_stk - 1) * (60000.0 / rpm) if rpm > 0 else 0:.0f}",
                })
    
    weapon_names_done.add(w_name)

print(f"\nGenerated {len(rows)} rows for {len(weapon_names_done)} weapons")

# Sort by weapon name, then ammo tier desc, then armor level asc
rows.sort(key=lambda r: (r['weapon_combo'], -(int(r['pen_level'].replace('Lv','') or '0')), int(r['armor_level'].replace('Lv','') or '0')))

out_path = f'{ROOT}/damage_overview.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(rows, f, indent=2, ensure_ascii=False)

print(f"Written to {out_path} ({os.path.getsize(out_path)} bytes)")
print(f"Unique weapon combos: {len(set(r['weapon_combo'] for r in rows))}")

# Show sample
if rows:
    print(f"\nSample rows:")
    for r in rows[:3]:
        print(json.dumps(r, indent=2))
