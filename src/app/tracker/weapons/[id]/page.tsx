'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface WeaponStats {
  FireRate?: string;
  AdapterAdjustDamage?: number;
  MuzzleVelocity?: number;
  Ergonomics?: number;
  WeaponStability?: number;
  HorizontalRecoil?: number;
  VerticalRecoil?: number;
  MOAScale?: number;
  MoaX?: number;
  MoaY?: number;
  MOA?: number;
  SilentWalkSpeedRatio?: number;
  ADSMoveSpeedRatio?: number;
  [key: string]: unknown;
}

interface Weapon {
  id: number;
  caliber?: string;
  tag?: string;
  stats?: WeaponStats;
  supportedTags?: string[];
  fireIntervalValue?: number;
  damageDistance?: Record<string, unknown>;
}

export default function WeaponDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [weapon, setWeapon] = useState<Weapon | null>(null);
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [accessories, setAccessories] = useState<Record<string, unknown>[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      fetch('/data/weapon-detail.json').then(r => r.json()),
      fetch('/data/item_names.json').then(r => r.json()),
    ]).then(([wd, nameMap]) => {
      setNames(nameMap);
      setWeapons(wd.weapons || []);
      setAccessories(wd.accessories || []);
      const found = (wd.weapons || []).find((w: Weapon) => String(w.id) === id);
      setWeapon(found || null);
    });
  }, [id]);

  const getName = (id: string) => names[id] || `ID ${id}`;
  const rpm = (w: Weapon) => {
    const r = Number(w.stats?.FireRate) || 0;
    return r > 0 ? r : 0;
  };

  if (!weapon) {
    return (
      <main className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  const s = weapon.stats || {};
  const dd = weapon.damageDistance || {};
  const totalRecoil = (Number(s.HorizontalRecoil) || 0) + (Number(s.VerticalRecoil) || 0);

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/tracker/weapons" className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#D4AF37] transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Weapons
          </Link>
          <h1 className="text-3xl font-bold font-display text-gradient">{getName(String(weapon.id))}</h1>
          <div className="flex gap-3 mt-2">
            <span className="text-sm px-2.5 py-0.5 rounded-full bg-white/5 text-[#9CA3AF]">{weapon.caliber || '-'}</span>
            <span className="text-sm px-2.5 py-0.5 rounded-full bg-white/5 text-[#9CA3AF]">{rpm(weapon)} RPM</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Combat Stats */}
        <h2 className="text-lg font-display font-bold text-white mb-3">Combat</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          <StatCard label="Fire Rate" value={`${rpm(weapon)} RPM`} />
          <StatCard label="Fire Interval" value={weapon.fireIntervalValue ? `${(weapon.fireIntervalValue * 1000).toFixed(0)}ms` : '-'} />
          <StatCard label="Damage Modifier" value={s.AdapterAdjustDamage != null ? `${s.AdapterAdjustDamage >= 0 ? '+' : ''}${s.AdapterAdjustDamage}` : '-'}
            color={Number(s.AdapterAdjustDamage) > 0 ? 'green' : Number(s.AdapterAdjustDamage) < 0 ? 'red' : undefined} />
          <StatCard label="Base Damage (close)" value={dd.damage != null ? String(dd.damage) : '-'} />
          <StatCard label="Min Damage (far)" value={dd.damageMin != null ? String(dd.damageMin) : '-'} />
          <StatCard label="Damage Falloff" value={dd.damageDistanceModifier != null ? `${(Number(dd.damageDistanceModifier) * 100).toFixed(1)}%/m` : '-'} />
          <StatCard label="Muzzle Velocity" value={s.MuzzleVelocity ? `${s.MuzzleVelocity} m/s` : '-'} />
          <StatCard label="Zero Distance" value={s.ZeroDropDistance ? `${Math.round(Number(s.ZeroDropDistance) / 100)}m` : '-'} />
          <StatCard label="Bullet Drop Start" value={dd.bulletBeginDropDistance ? `${Math.round(Number(dd.bulletBeginDropDistance) / 100)}m` : '-'} />
          <StatCard label="Damage Range" value={dd.damageModifyZeroDistance ? `${Math.round(Number(dd.damageModifyZeroDistance) / 100)}m` : '-'} />
        </div>

        {/* Accuracy & Recoil */}
        <h2 className="text-lg font-display font-bold text-white mb-3">Accuracy & Recoil</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          <StatCard label="Horizontal Recoil" value={String(s.HorizontalRecoil ?? '-')} />
          <StatCard label="Vertical Recoil" value={String(s.VerticalRecoil ?? '-')} />
          <StatCard label="Weapon Stability" value={String(s.WeaponStability ?? '-')} />
          <StatCard label="Accuracy" value={String(s.Accuracy ?? '-')} />
          <StatCard label="MOA Scale" value={String(s.MoaScale ?? s.MoaFinalScale ?? '-')} />
          <StatCard label="ADS MOA X" value={String(s.AdsMoaX ?? '-')} />
          <StatCard label="ADS MOA Y" value={String(s.AdsMoaY ?? '-')} />
        </div>

        {/* Mobility */}
        <h2 className="text-lg font-display font-bold text-white mb-3">Mobility</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          <StatCard label="Ergonomics" value={String(s.Ergonomics ?? s.Engonomics ?? '-')} />
          <StatCard label="Move Speed" value={s.MoveSpeedRatio != null ? `${(Number(s.MoveSpeedRatio) * 100).toFixed(0)}%` : '-'} />
          <StatCard label="ADS Move Speed" value={s.ADSMoveSpeedRatio != null ? `${(Number(s.ADSMoveSpeedRatio) * 100).toFixed(0)}%` : '-'} />
          <StatCard label="Silent Walk Speed" value={s.SilentWalkSpeedRatio != null ? `${(Number(s.SilentWalkSpeedRatio) * 100).toFixed(0)}%` : '-'} />
          <StatCard label="Impact Resistance" value={String(s.ImpactResistance ?? '-')} />
        </div>

        {/* Compatible Attachments */}
        <h2 className="text-xl font-display font-bold text-white mb-4">Compatible Attachments</h2>
        {weapon.supportedTags && weapon.supportedTags.length > 0 ? (
          <div className="glass rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left py-3 px-4 text-[#9CA3AF] font-medium">Slot</th>
                  <th className="text-left py-3 px-4 text-[#9CA3AF] font-medium">Tags</th>
                </tr>
              </thead>
              <tbody>
                {weapon.supportedTags.map((tag, i) => {
                  const parts = tag.split('.');
                  const slot = parts[1] || 'Other';
                  return (
                    <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                      <td className="py-2 px-4">
                        <span className="text-[#D4AF37] text-xs font-medium uppercase">{slot}</span>
                      </td>
                      <td className="py-2 px-4">
                        <code className="text-xs text-[#9CA3AF]">{tag}</code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[#6B7280] text-sm">No attachment data available</p>
        )}

        {/* All Accessories */}
        {accessories.length > 0 && (
          <>
            <h2 className="text-xl font-display font-bold text-white mt-10 mb-4">All Accessories ({accessories.length})</h2>
            <div className="glass rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left py-3 px-4 text-[#9CA3AF] font-medium">Name</th>
                    <th className="text-left py-3 px-4 text-[#9CA3AF] font-medium">Stats</th>
                  </tr>
                </thead>
                <tbody>
                  {accessories.slice(0, 20).map((acc, i) => {
                    const accName = getName(String(acc.id));
                    const accStats = (acc.stats as Record<string, unknown>) || {};
                    const statStr = Object.entries(accStats)
                      .filter(([_, v]) => v != null)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(', ');
                    return (
                      <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                        <td className="py-2 px-4 text-white">{accName}</td>
                        <td className="py-2 px-4 text-xs text-[#9CA3AF] font-mono">{statStr || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {accessories.length > 20 && (
                <div className="py-3 px-4 text-center text-xs text-[#6B7280]">Showing 20 of {accessories.length} accessories</div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

const WEAPON_STAT_DESC: Record<string, string> = {
  'Fire Rate': 'Rounds per minute the weapon can fire. Higher = faster shooting.',
  'Fire Interval': 'Time in milliseconds between each shot.',
  'Damage Modifier': 'Built-in damage bonus or penalty on this weapon. Affects final damage per shot.',
  'Base Damage (close)': 'Base damage per shot at point-blank range before armor calculations.',
  'Min Damage (far)': 'Minimum damage per shot at maximum effective range.',
  'Damage Falloff': 'How much damage decreases per meter beyond the effective range.',
  'Muzzle Velocity': 'Speed of the bullet leaving the barrel. Higher = less lead needed on moving targets.',
  'Zero Distance': 'The range at which the weapon is zeroed. Shots hit point-of-aim at this distance.',
  'Bullet Drop Start': 'Distance at which the bullet starts to drop due to gravity.',
  'Damage Range': 'The range within which the weapon deals its full base damage.',
  'Horizontal Recoil': 'Side-to-side recoil per shot. Higher = more horizontal spread.',
  'Vertical Recoil': 'Upward recoil per shot. Higher = more muzzle climb.',
  'Weapon Stability': 'Affects how quickly the weapon settles after firing or moving.',
  'Accuracy': 'Base accuracy stat. Higher = tighter shot spread.',
  'MOA Scale': 'Minute of Angle scale. Lower = better precision.',
  'ADS MOA X': 'Horizontal accuracy spread when aiming down sights.',
  'ADS MOA Y': 'Vertical accuracy spread when aiming down sights.',
  'Ergonomics': 'Affects ADS speed, weapon swap speed, and stamina drain while aiming.',
  'Move Speed': 'Movement speed modifier while holding this weapon.',
  'ADS Move Speed': 'Movement speed modifier while aiming down sights.',
  'Silent Walk Speed': 'Movement speed modifier while walking silently (crouched).',
  'Impact Resistance': 'Resistance to weapon sway when hit by enemy fire.',
};

function StatCard({ label, value, detail, color }: { label: string; value: string; detail?: string; color?: string }) {
  const valueColor = color === 'green' ? 'text-green-400' : color === 'red' ? 'text-red-400' : 'text-white';
  const desc = WEAPON_STAT_DESC[label];
  return (
    <div className="glass rounded-lg p-4 relative group">
      <div className="text-xs text-[#6B7280] uppercase tracking-wider mb-1 flex items-center gap-1.5">
        {label}
        {desc && (
          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-white/5 text-[8px] text-[#6B7280] cursor-help font-bold">?</span>
        )}
      </div>
      <div className={`text-lg font-semibold font-mono ${valueColor}`}>{value}</div>
      {detail && <div className="text-xs text-[#6B7280] mt-0.5">{detail}</div>}
      {desc && (
        <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-xs text-[#9CA3AF] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl">
          {desc}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1a1a1a]" />
        </div>
      )}
    </div>
  );
}
